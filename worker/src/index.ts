import { createServer } from "http";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { pollQueuedRequests } from "./listener";
import { fetchUserComments } from "./domains/reddit";
import { tokenizeComments } from "./util/tokenizer";
import { RedditComment } from "./lib/types";

// Initialize Firebase Admin
// Uses GOOGLE_APPLICATION_CREDENTIALS by default in Cloud Run
initializeApp();
const db = getFirestore();

// Simple HTTP server to accept manual triggers and run a background poller
const server = createServer(async (req, res) => {
  if (!req.url) {
    res.statusCode = 400;
    res.end("Bad Request");
    return;
  }

  if (req.method === "POST" && req.url.startsWith("/analyze")) {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = chunks.length
        ? JSON.parse(Buffer.concat(chunks).toString("utf-8"))
        : {};
      const requestId: string | undefined = body.requestId;
      if (!requestId) {
        res.statusCode = 400;
        res.end("Missing requestId");
        return;
      }

      await processRequest(requestId);
      res.statusCode = 200;
      res.end("ok");
      return;
    } catch (e) {
      res.statusCode = 500;
      res.end((e as Error).message);
      return;
    }
  }

  // Health check
  if (req.method === "GET" && req.url === "/healthz") {
    res.statusCode = 200;
    res.end("ok");
    return;
  }

  res.statusCode = 404;
  res.end("not found");
});

server.listen(process.env.PORT || 8080, () => {
  // eslint-disable-next-line no-console
  console.log("Worker listening on port", process.env.PORT || 8080);
  // Start background poller
  pollQueuedRequests(processRequest).catch((e) =>
    console.error("poller failed", e)
  );
});

async function processRequest(requestId: string): Promise<void> {
  const reqRef = db.collection("analysisRequests").doc(requestId);
  const reqSnap = await reqRef.get();
  if (!reqSnap.exists) return;

  const data = reqSnap.data() as any;
  if (data.status !== "queued") return;

  await reqRef.update({ status: "fetching", updatedAt: Date.now() });

  try {
    // Fetch platform data server-side based on platform
    const platform: string = data.platform;
    const userId: string = data.userId;
    const maxItems: number = Math.min(data.maxItems || 100, 100);

    let totalCount = 0;
    let analyzedCount = 0;
    let perComment: Array<{
      commentId: string;
      score: number;
      numTokens: number;
      hasParent?: boolean;
    }> = [];

    if (platform === "reddit") {
      const comments = await fetchUserComments(userId, maxItems);
      totalCount = comments.length;

      const tokenized = await tokenizeComments(
        comments
          .filter((c: RedditComment) => (c.body || "").trim().length >= 20)
          .map((c) => ({ id: c.id, text: c.body }))
      );

      // Placeholder scoring: score by length proxy
      perComment = tokenized.map((t) => ({
        commentId: t.id,
        score: Math.min(1, t.tokens.length / 300),
        numTokens: t.tokens.length,
      }));

      analyzedCount = perComment.length;
    } else {
      totalCount = 0;
      analyzedCount = 0;
      perComment = [];
    }

    // Placeholder result
    const resultDoc = {
      requestRef: reqRef.path,
      platform,
      userId,
      userScore: perComment.length
        ? Math.min(
            1,
            perComment.reduce((s, x) => s + x.score, 0) / perComment.length
          )
        : 0,
      analyzedCount,
      totalCount,
      perComment,
      method: "placeholder-length-proxy",
      createdAt: Date.now(),
    };

    await db.collection("analysisResults").doc(requestId).set(resultDoc);
    await reqRef.update({ status: "done", updatedAt: Date.now() });
  } catch (e) {
    await reqRef.update({
      status: "error",
      errorMessage: (e as Error).message,
      updatedAt: Date.now(),
    });
  }
}
