/**
 * Reddit API client with OAuth2 authentication
 * Uses the official Reddit API: https://www.reddit.com/dev/api
 */

import type {
  RedditApiConfig,
  RedditComment,
  RedditCommentData,
  RedditCommentListing,
  RedditPost,
  RedditPostData,
  RedditPostListing,
  RedditTokens,
  RedditUserData,
} from "../lib/types";

const REDDIT_API_BASE = "https://oauth.reddit.com";

export class RedditApiClient {
  private config: RedditApiConfig;
  private tokens: RedditTokens | null = null;

  constructor(config: RedditApiConfig) {
    this.config = config;
  }

  /**
   * Initialize the client by loading stored tokens
   */
  async initialize(): Promise<void> {
    const stored = await chrome.storage.local.get("reddit_tokens");
    if (stored.reddit_tokens) {
      this.tokens = stored.reddit_tokens;
      // Check if token is expired
      if (this.isTokenExpired()) {
        console.log("Reddit token expired, need to re-authenticate");
        this.tokens = null;
      }
    }
  }

  /**
   * Check if the current token is expired
   */
  private isTokenExpired(): boolean {
    if (!this.tokens) return true;
    return Date.now() >= this.tokens.expires_at;
  }

  /**
   * Get OAuth2 authorization URL for user to authenticate
   */
  getAuthUrl(): string {
    const state = this.generateRandomState();
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: "code",
      state,
      redirect_uri: this.config.redirectUri,
      duration: "permanent",
      scope: "identity read history",
    });

    // Store state for verification
    chrome.storage.local.set({ reddit_oauth_state: state });

    return `https://www.reddit.com/api/v1/authorize?${params.toString()}`;
  }

  /**
   * Generate a random state string for OAuth2 security
   */
  private generateRandomState(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
      ""
    );
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<void> {
    const credentials = btoa(
      `${this.config.clientId}:${this.config.clientSecret}`
    );

    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.config.redirectUri,
    });

    const response = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": this.config.userAgent,
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`Failed to exchange code: ${response.statusText}`);
    }

    const data = await response.json();

    this.tokens = {
      access_token: data.access_token,
      token_type: data.token_type,
      expires_at: Date.now() + data.expires_in * 1000,
      scope: data.scope,
    };

    // Store tokens
    await chrome.storage.local.set({ reddit_tokens: this.tokens });
  }

  /**
   * Check if the user is authenticated
   */
  isAuthenticated(): boolean {
    return this.tokens !== null && !this.isTokenExpired();
  }

  /**
   * Make an authenticated request to Reddit API
   */
  private async makeRequest<T>(endpoint: string): Promise<T> {
    if (!this.isAuthenticated()) {
      throw new Error("Not authenticated. Please authenticate first.");
    }

    const response = await fetch(`${REDDIT_API_BASE}${endpoint}`, {
      headers: {
        Authorization: `${this.tokens!.token_type} ${
          this.tokens!.access_token
        }`,
        "User-Agent": this.config.userAgent,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Token expired, clear it
        this.tokens = null;
        await chrome.storage.local.remove("reddit_tokens");
        throw new Error("Token expired. Please re-authenticate.");
      }
      throw new Error(`Reddit API error: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Fetch user's comments (up to 100)
   * @param username - Reddit username (without u/ prefix)
   * @param limit - Number of comments to fetch (max 100)
   */
  async getUserComments(
    username: string,
    limit: number = 100
  ): Promise<RedditComment[]> {
    const endpoint = `/user/${username}/comments?limit=${Math.min(limit, 100)}`;
    const response = await this.makeRequest<RedditCommentListing>(endpoint);

    return response.data.children.map((child: RedditCommentData) => ({
      id: child.data.id,
      author: child.data.author,
      body: child.data.body,
      subreddit: child.data.subreddit,
      created_utc: child.data.created_utc,
      permalink: `https://www.reddit.com${child.data.permalink}`,
      score: child.data.score,
    }));
  }

  /**
   * Fetch user's submitted posts (up to 100)
   * @param username - Reddit username (without u/ prefix)
   * @param limit - Number of posts to fetch (max 100)
   */
  async getUserPosts(
    username: string,
    limit: number = 100
  ): Promise<RedditPost[]> {
    const endpoint = `/user/${username}/submitted?limit=${Math.min(
      limit,
      100
    )}`;
    const response = await this.makeRequest<RedditPostListing>(endpoint);

    return response.data.children.map((child: RedditPostData) => ({
      id: child.data.id,
      author: child.data.author,
      title: child.data.title,
      body: child.data.selftext,
      subreddit: child.data.subreddit,
      created_utc: child.data.created_utc,
      permalink: `https://www.reddit.com${child.data.permalink}`,
      score: child.data.score,
      url: child.data.url,
    }));
  }

  /**
   * Get current user info (to verify authentication)
   */
  async getCurrentUser(): Promise<RedditUserData> {
    const response = await this.makeRequest<RedditUserData>("/api/v1/me");
    return response;
  }

  /**
   * Clear stored tokens
   */
  async logout(): Promise<void> {
    this.tokens = null;
    await chrome.storage.local.remove("reddit_tokens");
  }
}
