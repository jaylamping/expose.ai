/**
 * Background service worker for handling OAuth2 flow and API calls
 */

import { RedditApiClient } from "./api/reddit-api";
import type { RedditComment } from "./lib/types";

// Reddit App Configuration
// IMPORTANT: You need to register your app at https://www.reddit.com/prefs/apps
const REDDIT_CONFIG = {
  clientId: import.meta.env.VITE_REDDIT_CLIENT_ID || "",
  clientSecret: import.meta.env.VITE_REDDIT_CLIENT_SECRET || "",
  redirectUri: chrome.identity.getRedirectURL("oauth2"),
  userAgent: "chrome-extension:expose.ai:v0.0.1 (by /u/Sweet_Ad_842)",
};

let redditClient: RedditApiClient | null = null;

/**
 * Initialize Reddit API client
 */
async function initializeClient(): Promise<RedditApiClient> {
  if (!redditClient) {
    redditClient = new RedditApiClient(REDDIT_CONFIG);
    await redditClient.initialize();
  }
  return redditClient;
}

/**
 * Handle OAuth2 authentication flow
 */
async function authenticateWithReddit(): Promise<void> {
  const client = await initializeClient();

  // Check if already authenticated
  if (client.isAuthenticated()) {
    console.log("Already authenticated with Reddit");
    return;
  }

  const authUrl = client.getAuthUrl();

  // Open auth flow in a new window
  const redirectUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl,
    interactive: true,
  });

  if (!redirectUrl) {
    throw new Error("Authentication failed: No redirect URL");
  }

  // Extract code from redirect URL
  const url = new URL(redirectUrl);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    throw new Error(`Authentication failed: ${error}`);
  }

  if (!code) {
    throw new Error("No authorization code received");
  }

  // Verify state
  const stored = await chrome.storage.local.get("reddit_oauth_state");
  if (state !== stored.reddit_oauth_state) {
    throw new Error("State mismatch - possible CSRF attack");
  }

  // Exchange code for token
  await client.exchangeCodeForToken(code);

  // Clean up state
  await chrome.storage.local.remove("reddit_oauth_state");

  console.log("Successfully authenticated with Reddit");
}

/**
 * Fetch user comments from Reddit
 */
async function fetchUserComments(username: string): Promise<RedditComment[]> {
  const client = await initializeClient();

  // If not authenticated, trigger auth flow
  if (!client.isAuthenticated()) {
    await authenticateWithReddit();
  }

  return await client.getUserComments(username, 100);
}

/**
 * Message handler for communication with content scripts
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log("Background received message:", message);

  if (message.type === "AUTHENTICATE_REDDIT") {
    authenticateWithReddit()
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        console.error("Authentication error:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }

  if (message.type === "FETCH_USER_COMMENTS") {
    fetchUserComments(message.username)
      .then((comments) => {
        console.log(
          `Fetched ${comments.length} comments for ${message.username}`
        );
        sendResponse({ success: true, comments });
      })
      .catch((error) => {
        console.error("Error fetching comments:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }

  if (message.type === "CHECK_AUTH_STATUS") {
    initializeClient()
      .then((client) => {
        sendResponse({
          authenticated: client.isAuthenticated(),
          hasCredentials: !!(
            REDDIT_CONFIG.clientId && REDDIT_CONFIG.clientSecret
          ),
          clientId: REDDIT_CONFIG.clientId
            ? `${REDDIT_CONFIG.clientId.substring(0, 8)}...`
            : null,
          redirectUri: REDDIT_CONFIG.redirectUri,
        });
      })
      .catch((error) => {
        console.error("Error checking auth status:", error);
        sendResponse({
          authenticated: false,
          hasCredentials: false,
          error: error.message,
        });
      });
    return true;
  }

  if (message.type === "ANALYZE_USER") {
    // Fetch comments and prepare for analysis
    fetchUserComments(message.username)
      .then(async (comments) => {
        console.log(
          `Analyzing ${comments.length} comments for ${message.username}`
        );

        // TODO: Implement AI analysis here
        // For now, just return the comments data
        sendResponse({
          success: true,
          result: {
            username: message.username,
            totalPosts: comments.length,
            analyzedPosts: comments.length,
            aiProbability: 0,
            confidence: 0,
            details: comments.slice(0, 10).map((c) => ({
              postId: c.id,
              content: c.body,
              aiScore: 0,
              humanScore: 1,
            })),
          },
        });
      })
      .catch((error) => {
        console.error("Error analyzing user:", error);
        sendResponse({
          success: false,
          error: error.message,
          needsAuth: error.message.includes("authenticate"),
        });
      });
    return true;
  }

  return false;
});

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  console.log("Expose.AI extension installed");
  initializeClient().catch(console.error);
});

// Initialize on startup
chrome.runtime.onStartup.addListener(() => {
  console.log("Expose.AI extension started");
  initializeClient().catch(console.error);
});

console.log("Background service worker loaded");
