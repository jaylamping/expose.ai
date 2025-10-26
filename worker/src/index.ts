import { config } from 'dotenv';
import { createServer } from 'http';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

// TODO: FIX THIS TERRIBLE VIBE BULLSHIT

// Load environment variables from .env file
config();
import { pollQueuedRequests } from './listener.js';
import { fetchRedditCommentsForUser } from './domains/reddit.js';
import { AnalysisRequestData, RedditComment } from './lib/types.js';
import { createMLAPIClient } from './api/client.js';

// Initialize Firebase Admin with service account credentials
let app: ReturnType<typeof initializeApp>;

if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  // Local development: use service account key file
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

  app = initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
} else {
  // Production (Cloud Run): use default credentials
  app = initializeApp({
    projectId: 'expose-ai-227bc',
  });
}

// Use the default database
const db = getFirestore(app);

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
server.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);

  // Only start polling if we have a test request or want to process requests
  if (process.env.ENABLE_POLLING === 'true') {
    console.log('🔄 Starting request polling...');
    pollQueuedRequests(db, processRequest).catch((e) =>
      console.error('poller failed', e)
    );
  } else {
    console.log('⏸️ Polling disabled. Set ENABLE_POLLING=true to enable.');
  }
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

  await reqRef.update({ status: 'fetching', updatedAt: Date.now() });

  try {
    const platform: string = data.platform;
    const userId: string = data.userId;

    const mlClient = createMLAPIClient();

    console.log(`🎯 Processing analysis for ${platform} user: ${userId}`);

    if (platform === 'reddit') {
      console.log(`📥 Fetching Reddit comments for user: ${userId}`);
      const comments = await fetchRedditCommentsForUser(userId, 100);
      console.log(
        `📊 Fetched ${comments.length} total comments from Reddit API`
      );

      // Filter comments with sufficient content
      console.log(
        `🔍 Filtering comments with sufficient content (>= 15 characters)...`
      );
      const validComments = comments.filter(
        (c: RedditComment) => (c.body || '').trim().length >= 10
      );

      console.log(`📈 Comment filtering results:`, {
        totalFetched: comments.length,
        validComments: validComments.length,
        filteredOut: comments.length - validComments.length,
        filterReason: 'body length < 10 characters',
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

      // Detailed bot detection explanation
      console.log(`\n🤖 BOT DETECTION ANALYSIS`);
      console.log(
        `═══════════════════════════════════════════════════════════`
      );

      const response = await mlClient.analyzeUser({
        user_id: userId,
        comments: validComments.map((c) => ({
          comment_id: c.id,
          comment: c.body,
        })),
        options: {
          fast_only: false,
          include_breakdown: true,
          use_context: true,
          force_full_analysis: false,
        },
      });

      console.log(`🎯 ML API response:`, response);

      // const resultDoc: AnalysisResultDoc = {
      //   requestRef: reqRef.path,
      //   platform,
      //   userId,
      //   userScore: userStats.userScore,
      //   analyzedCount,
      //   totalCount,
      //   perComment,
      //   method: 'cascading-bpc-ml-context-v1',
      //   createdAt: Date.now(),
      //   bpcAnalyzed: userStats.statistics.bpcAnalyzed,
      //   mlAnalyzed: userStats.statistics.mlAnalyzed,
      //   contextAnalyzed: userStats.statistics.contextAnalyzed,
      //   averageBPC: userStats.statistics.averageBPC,
      //   averagePerplexity: userStats.statistics.averagePerplexity,
      //   averageBert: userStats.statistics.averageBert,
      //   overallConfidence: userStats.confidence,
      // };

      // console.log(`💾 Saving analysis results to database...`);
      // await db.collection('analysisResults').doc(requestId).set(resultDoc);
      // await reqRef.update({ status: 'done', updatedAt: Date.now() });

      console.log(`\n🎉 ANALYSIS COMPLETE!`);
      console.log(`👤 User: ${userId}`);
      console.log(
        `📊 Final Score: ${response.data?.bot_score.toFixed(
          3
        )} (confidence: ${response.data?.confidence.toFixed(3)})`
      );
      console.log(
        `📝 Comments analyzed: ${response.data?.comments_analyzed || 0}/${
          comments.length || 0
        }`
      );
    } else {
      console.log(`⚠️ Unsupported platform: ${platform}`);
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
