import { createServer } from 'http';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { pollQueuedRequests } from './listener.js';
import { fetchUserComments, fetchParentContext } from './domains/reddit.js';
import { tokenizeComments } from './util/tokenizer.js';
import { batchAnalyzeBPC } from './util/bpc-analyzer.js';
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
  pollQueuedRequests(db, processRequest).catch((e) =>
    console.error('poller failed', e)
  );
});

async function processRequest(requestId: string): Promise<void> {
  console.log(`🚀 Starting analysis request: ${requestId}`);

  const reqRef = db.collection('analysisRequests').doc(requestId);
  const reqSnap = await reqRef.get();
  if (!reqSnap.exists) {
    console.log(`❌ Request ${requestId} not found in database`);
    return;
  }

  const data = reqSnap.data() as AnalysisRequestData;
  console.log(`📋 Request data:`, {
    platform: data.platform,
    userId: data.userId,
    status: data.status,
    count: data.count,
  });

  if (data.status !== 'queued') {
    console.log(
      `⏭️ Request ${requestId} not in queued status (${data.status}), skipping`
    );
    return;
  }

  console.log(`🔄 Updating request status to 'fetching'`);
  await reqRef.update({ status: 'fetching', updatedAt: Date.now() });

  try {
    const platform: string = data.platform;
    const userId: string = data.userId;

    console.log(`🎯 Processing analysis for ${platform} user: ${userId}`);

    let totalCount = 0;
    let analyzedCount = 0;
    let perComment: AnalysisPerCommentSummary[] = [];

    if (platform === 'reddit') {
      console.log(`📥 Fetching Reddit comments for user: ${userId}`);
      const comments = await fetchUserComments(userId, 100);
      totalCount = comments.length;
      console.log(`📊 Fetched ${totalCount} total comments from Reddit API`);

      // Filter comments with sufficient content
      console.log(
        `🔍 Filtering comments with sufficient content (>= 15 characters)...`
      );
      const validComments = comments.filter(
        (c: RedditComment) => (c.body || '').trim().length >= 15
      );

      console.log(`📈 Comment filtering results:`, {
        totalFetched: totalCount,
        validComments: validComments.length,
        filteredOut: totalCount - validComments.length,
        filterReason: 'body length < 15 characters',
      });

      if (validComments.length === 0) {
        console.error(`❌ No valid comments found for analysis`);
        throw new Error('No valid comments found for analysis');
      }

      console.log(
        `✅ Found ${validComments.length} valid comments for analysis`
      );
      console.log(`📝 Sample valid comment:`, {
        id: validComments[0]?.id,
        body: validComments[0]?.body?.substring(0, 150) + '...',
        length: validComments[0]?.body?.length,
        subreddit: validComments[0]?.subreddit,
      });

      // Initialize scorers / classifiers
      console.log(`🔧 Initializing analysis components...`);
      const compositeScorer = createCompositeScorer();
      const perplexityScorer = createPerplexityScorer();
      const bertClassifier = createBertClassifier();
      console.log(`✅ Analysis components initialized`);

      // Stage 1: BPC Analysis
      console.log(`\n🎯 STAGE 1: BPC Analysis`);
      console.log(
        `📊 Running BPC analysis on ${validComments.length} comments`
      );
      const bpcResults = batchAnalyzeBPC(
        validComments.map((c) => ({ id: c.id, text: c.body }))
      );
      console.log(`✅ BPC analysis completed on ${bpcResults.length} comments`);

      // Create initial comment summaries
      console.log(`🔢 Tokenizing comments for analysis...`);
      const tokenizedResults = await tokenizeComments(
        validComments.map((c) => ({ id: c.id, text: c.body }))
      );
      console.log(
        `✅ Tokenization completed for ${tokenizedResults.length} comments`
      );

      console.log(`📝 Creating initial comment summaries...`);
      perComment = validComments.map((c, index) => {
        const bpcResult = bpcResults[index];
        const tokenized = tokenizedResults[index];

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

      console.log(`📊 Stage 1 BPC Results Summary:`, {
        totalComments: perComment.length,
        highConfidence: perComment.filter((c) => c.confidence === 1).length,
        mediumConfidence: perComment.filter((c) => c.confidence === 0.5).length,
        lowConfidence: perComment.filter((c) => c.confidence === 0).length,
        inconclusive: perComment.filter((c) => c.isInconclusive).length,
        averageBPCScore: (
          perComment.reduce((sum, c) => sum + (c.bpcScore || 0), 0) /
          perComment.length
        ).toFixed(3),
      });

      // Stage 2: ML Analysis for inconclusive cases
      console.log(`\n🎯 STAGE 2: ML Analysis`);
      const inconclusiveComments = perComment.filter((c) =>
        compositeScorer.needsFurtherAnalysis(c)
      );

      console.log(
        `🔍 Found ${inconclusiveComments.length} inconclusive comments from BPC analysis`
      );

      if (inconclusiveComments.length > 0) {
        console.log(
          `🤖 Running ML analysis on ${inconclusiveComments.length} inconclusive comments`
        );

        const mlTexts = inconclusiveComments.map((c) => ({
          id: c.commentId,
          text: validComments.find((vc) => vc.id === c.commentId)?.body || '',
        }));

        console.log(`📝 Prepared ${mlTexts.length} texts for ML analysis`);

        // Run perplexity and BERT analysis in parallel
        console.log(`🔄 Running perplexity and BERT analysis in parallel...`);
        const [perplexityResults, bertResults] = await Promise.all([
          perplexityScorer.scoreTexts(mlTexts),
          bertClassifier.classifyTexts(mlTexts),
        ]);

        console.log(`✅ ML analysis completed:`, {
          perplexityResults: perplexityResults.length,
          bertResults: bertResults.length,
        });

        // Update inconclusive comments with ML scores
        console.log(`🔄 Updating inconclusive comments with ML scores...`);
        let mlUpdatedCount = 0;
        for (const comment of inconclusiveComments) {
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
            mlUpdatedCount++;
          }
        }

        console.log(`✅ Updated ${mlUpdatedCount} comments with ML scores`);
        console.log(`📊 Stage 2 ML Results Summary:`, {
          totalInconclusive: inconclusiveComments.length,
          mlUpdated: mlUpdatedCount,
          averagePerplexity: (
            inconclusiveComments.reduce(
              (sum, c) => sum + (c.perplexityScore || 0),
              0
            ) / mlUpdatedCount
          ).toFixed(3),
          averageBert: (
            inconclusiveComments.reduce(
              (sum, c) => sum + (c.bertScore || 0),
              0
            ) / mlUpdatedCount
          ).toFixed(3),
        });
      } else {
        console.log(`✅ No inconclusive comments found - skipping ML analysis`);
      }

      // Stage 3: Parent Context for still inconclusive cases
      console.log(`\n🎯 STAGE 3: Parent Context Analysis`);
      const stillInconclusive = perComment.filter((c) =>
        compositeScorer.needsFurtherAnalysis(c)
      );

      console.log(
        `🔍 Found ${stillInconclusive.length} still inconclusive comments after ML analysis`
      );

      if (stillInconclusive.length > 0) {
        console.log(
          `🔗 Fetching parent context for ${stillInconclusive.length} comments`
        );

        // Fetch parent context for inconclusive comments
        console.log(
          `🔄 Starting parent context fetching for ${stillInconclusive.length} comments...`
        );
        const contextPromises = stillInconclusive.map(
          async (comment, index) => {
            try {
              console.log(
                `🔍 [${index + 1}/${
                  stillInconclusive.length
                }] Fetching parent context for comment ${comment.commentId}`
              );
              const parentContext = await fetchParentContext(comment.commentId);
              if (parentContext) {
                console.log(
                  `✅ Found parent context for ${comment.commentId} (${parentContext.length} chars)`
                );

                // Combine parent + child text
                const originalComment = validComments.find(
                  (c) => c.id === comment.commentId
                );
                const combinedText = `${parentContext}\n\n${
                  originalComment?.body || ''
                }`;

                console.log(
                  `🤖 Re-running ML analysis with combined context (${combinedText.length} chars total)`
                );
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
                console.log(
                  `✅ Updated ${
                    comment.commentId
                  } with context analysis (score: ${comment.score.toFixed(3)})`
                );
              } else {
                console.log(
                  `⚠️ No parent context found for ${comment.commentId}`
                );
              }
            } catch (error) {
              console.error(
                `❌ Failed to fetch parent context for ${comment.commentId}:`,
                error
              );
            }
          }
        );

        await Promise.all(contextPromises);
        console.log(`✅ Parent context analysis completed`);
      } else {
        console.log(
          `✅ No still inconclusive comments found - skipping parent context analysis`
        );
      }

      // Calculate final scores
      console.log(`\n📊 FINAL ANALYSIS SUMMARY`);
      analyzedCount = perComment.length;

      // Calculate user-level statistics
      console.log(`🧮 Calculating final user-level statistics...`);
      const userStats = compositeScorer.calculateUserScore(perComment);

      console.log(`📈 Final Analysis Results:`, {
        totalComments: totalCount,
        analyzedComments: analyzedCount,
        userScore: userStats.userScore.toFixed(3),
        overallConfidence: userStats.confidence.toFixed(3),
        bpcAnalyzed: userStats.statistics.bpcAnalyzed,
        mlAnalyzed: userStats.statistics.mlAnalyzed,
        contextAnalyzed: userStats.statistics.contextAnalyzed,
        averageBPC: userStats.statistics.averageBPC.toFixed(3),
        averagePerplexity: userStats.statistics.averagePerplexity.toFixed(3),
        averageBert: userStats.statistics.averageBert.toFixed(3),
      });

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

      console.log(`💾 Saving analysis results to database...`);
      await db.collection('analysisResults').doc(requestId).set(resultDoc);
      await reqRef.update({ status: 'done', updatedAt: Date.now() });

      console.log(`\n🎉 ANALYSIS COMPLETE!`);
      console.log(`👤 User: ${userId}`);
      console.log(
        `📊 Final Score: ${userStats.userScore.toFixed(
          3
        )} (confidence: ${userStats.confidence.toFixed(3)})`
      );
      console.log(`📝 Comments analyzed: ${analyzedCount}/${totalCount}`);
      console.log(
        `🔧 Pipeline stages: BPC(${userStats.statistics.bpcAnalyzed}) → ML(${userStats.statistics.mlAnalyzed}) → Context(${userStats.statistics.contextAnalyzed})`
      );
    } else {
      console.log(`⚠️ Unsupported platform: ${platform}`);
      totalCount = 0;
      analyzedCount = 0;
      perComment = [];
    }
  } catch (e) {
    console.error(`❌ Analysis failed for request ${requestId}:`, e);
    await reqRef.update({
      status: 'error',
      errorMessage: (e as Error).message,
      updatedAt: Date.now(),
    });
    console.log(`💾 Updated request status to 'error'`);
  }
}
