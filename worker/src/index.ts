import { createServer } from 'http';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { pollQueuedRequests } from './listener.js';
import { fetchUserComments, fetchParentContext } from './domains/reddit.js';
import { tokenizeComments } from './util/tokenizer.js';
import {
  analyzeBPC,
  batchAnalyzeBPC,
  getAggregateBPCStats,
} from './util/bpc-analyzer.js';
import { createPerplexityScorer } from './ml/perplexity-scorer.js';
import { createBertClassifier } from './ml/bert-classifier.js';
import { createCompositeScorer } from './util/composite-scorer.js';
import {
  AnalysisRequestData,
  RedditComment,
  AnalysisPerCommentSummary,
  AnalysisResultDoc,
} from './lib/types';

// Initialize Firebase Admin
initializeApp();
const db = getFirestore();

// Simple HTTP server to accept manual triggers and run a background poller
const server = createServer(async (req, res) => {
  // Preflight
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (!req.url) {
    res.statusCode = 400;
    res.end('Bad Request');
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/analyze')) {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = chunks.length
        ? JSON.parse(Buffer.concat(chunks).toString('utf-8'))
        : {};
      const requestId: string | undefined = body.requestId;
      if (!requestId) {
        res.statusCode = 400;
        res.end('Missing requestId');
        return;
      }

      await processRequest(requestId);
      res.statusCode = 200;
      res.end('ok');
      return;
    } catch (e) {
      res.statusCode = 500;
      res.end((e as Error).message);
      return;
    }
  }

  if (req.method === 'GET' && req.url.startsWith('/analyze')) {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const requestId = url.searchParams.get('requestId');
      if (!requestId) {
        res.statusCode = 400;
        res.end('Missing requestId');
        return;
      }

      await processRequest(requestId);
      res.statusCode = 200;
      res.end('ok');
      return;
    } catch (e) {
      res.statusCode = 500;
      res.end((e as Error).message);
      return;
    }
  }

  // Health check
  if (req.method === 'GET' && req.url === '/healthz') {
    res.statusCode = 200;
    res.end('ok');
    return;
  }

  res.statusCode = 404;
  res.end('not found');
});

const port = Number(process.env.PORT) || 8080;
server.listen(port, '0.0.0.0', () => {
  console.log('Worker listening on port', port);
  // Start background poller
  pollQueuedRequests(db, processRequest).catch((e) =>
    console.error('poller failed', e)
  );
});

async function processRequest(requestId: string): Promise<void> {
  const reqRef = db.collection('analysisRequests').doc(requestId);
  const reqSnap = await reqRef.get();
  if (!reqSnap.exists) return;

  const data = reqSnap.data() as AnalysisRequestData;
  if (data.status !== 'queued') return;

  await reqRef.update({ status: 'fetching', updatedAt: Date.now() });

  try {
    const platform: string = data.platform;
    const userId: string = data.userId;

    let totalCount = 0;
    let analyzedCount = 0;
    let perComment: AnalysisPerCommentSummary[] = [];

    if (platform === 'reddit') {
      const comments = await fetchUserComments(userId, 100);
      totalCount = comments.length;

      // Filter comments with sufficient content
      const validComments = comments.filter(
        (c: RedditComment) => (c.body || '').trim().length >= 20
      );

      if (validComments.length === 0) {
        throw new Error('No valid comments found for analysis');
      }

      // Initialize scorers
      const compositeScorer = createCompositeScorer();
      const perplexityScorer = createPerplexityScorer();
      const bertClassifier = createBertClassifier();

      // Stage 1: BPC Analysis
      console.log(
        `Stage 1: Running BPC analysis on ${validComments.length} comments`
      );
      const bpcResults = batchAnalyzeBPC(
        validComments.map((c) => ({ id: c.id, text: c.body }))
      );

      // Create initial comment summaries
      perComment = validComments.map((c, index) => {
        const bpcResult = bpcResults[index];
        const tokenized = (
          await tokenizeComments([{ id: c.id, text: c.body }])
        )[0];

        return {
          commentId: c.id,
          score: bpcResult.analysis.bpcScore,
          numTokens: tokenized.tokenCount,
          bpcScore: bpcResult.analysis.bpcScore,
          stage: 'bpc' as const,
          confidence:
            bpcResult.analysis.confidence === 'high'
              ? 1
              : bpcResult.analysis.confidence === 'medium'
              ? 0.5
              : 0,
          isInconclusive: bpcResult.analysis.isInconclusive,
        };
      });

      // Stage 2: ML Analysis for inconclusive cases
      const inconclusiveComments = perComment.filter((c) =>
        compositeScorer.needsFurtherAnalysis(c)
      );

      if (inconclusiveComments.length > 0) {
        console.log(
          `Stage 2: Running ML analysis on ${inconclusiveComments.length} inconclusive comments`
        );

        const mlTexts = inconclusiveComments.map((c) => ({
          id: c.commentId,
          text: validComments.find((vc) => vc.id === c.commentId)?.body || '',
        }));

        // Run perplexity and BERT analysis in parallel
        const [perplexityResults, bertResults] = await Promise.all([
          perplexityScorer.scoreTexts(mlTexts),
          bertClassifier.classifyTexts(mlTexts),
        ]);

        // Update inconclusive comments with ML scores
        inconclusiveComments.forEach((comment, index) => {
          const perplexityResult = perplexityResults.find(
            (r) => r.id === comment.commentId
          );
          const bertResult = bertResults.find(
            (r) => r.id === comment.commentId
          );

          if (perplexityResult && bertResult) {
            comment.perplexityScore = perplexityResult.score.score;
            comment.bertScore = bertResult.score.score;
            comment.stage = 'ml';
            comment.confidence = Math.max(
              perplexityResult.score.confidence,
              bertResult.score.confidence
            );

            // Recalculate composite score
            comment.score = compositeScorer.calculateScore(comment);
          }
        });
      }

      // Stage 3: Parent Context for still inconclusive cases
      const stillInconclusive = perComment.filter((c) =>
        compositeScorer.needsFurtherAnalysis(c)
      );

      if (stillInconclusive.length > 0) {
        console.log(
          `Stage 3: Fetching parent context for ${stillInconclusive.length} comments`
        );

        // Fetch parent context for inconclusive comments
        const contextPromises = stillInconclusive.map(async (comment) => {
          try {
            const parentContext = await fetchParentContext(comment.commentId);
            if (parentContext) {
              // Combine parent + child text
              const originalComment = validComments.find(
                (c) => c.id === comment.commentId
              );
              const combinedText = `${parentContext}\n\n${
                originalComment?.body || ''
              }`;

              // Re-run ML analysis with combined context
              const [perplexityResult, bertResult] = await Promise.all([
                perplexityScorer.scoreText(combinedText),
                bertClassifier.classifyText(combinedText),
              ]);

              comment.perplexityScore = perplexityResult.score;
              comment.bertScore = bertResult.score;
              comment.stage = 'context';
              comment.usedParentContext = true;
              comment.confidence = Math.max(
                perplexityResult.confidence,
                bertResult.confidence
              );

              // Recalculate composite score
              comment.score = compositeScorer.calculateScore(comment);
            }
          } catch (error) {
            console.error(
              `Failed to fetch parent context for ${comment.commentId}:`,
              error
            );
          }
        });

        await Promise.all(contextPromises);
      }

      // Calculate final scores
      analyzedCount = perComment.length;

      // Calculate user-level statistics
      const userStats = compositeScorer.calculateUserScore(perComment);

      const resultDoc: AnalysisResultDoc = {
        requestRef: reqRef.path,
        platform,
        userId,
        userScore: userStats.userScore,
        analyzedCount,
        totalCount,
        perComment,
        method: 'cascading-bpc-ml-context-v1',
        createdAt: Date.now(),
        bpcAnalyzed: userStats.statistics.bpcAnalyzed,
        mlAnalyzed: userStats.statistics.mlAnalyzed,
        contextAnalyzed: userStats.statistics.contextAnalyzed,
        averageBPC: userStats.statistics.averageBPC,
        averagePerplexity: userStats.statistics.averagePerplexity,
        averageBert: userStats.statistics.averageBert,
        overallConfidence: userStats.confidence,
      };

      await db.collection('analysisResults').doc(requestId).set(resultDoc);
      await reqRef.update({ status: 'done', updatedAt: Date.now() });

      console.log(
        `Analysis complete for ${userId}: ${userStats.userScore.toFixed(
          3
        )} (confidence: ${userStats.confidence.toFixed(3)})`
      );
    } else {
      totalCount = 0;
      analyzedCount = 0;
      perComment = [];
    }
  } catch (e) {
    console.error('Analysis failed:', e);
    await reqRef.update({
      status: 'error',
      errorMessage: (e as Error).message,
      updatedAt: Date.now(),
    });
  }
}
