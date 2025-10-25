/**
 * Reddit API functions for fetching user data
 */

import type {
  RedditComment,
  RedditCommentData,
  RedditCommentListing,
  RedditPost,
  RedditPostData,
  RedditPostListing,
} from "../lib/types";
import type { RedditApiClient } from "../clients/reddit-auth";

/**
 * Fetch user's comments (up to 100)
 * @param client - Authenticated Reddit API client
 * @param username - Reddit username (without u/ prefix)
 * @param limit - Number of comments to fetch (max 100)
 */
export async function getUserComments(
  client: RedditApiClient,
  username: string,
  limit: number = 100
): Promise<RedditComment[]> {
  const endpoint = `/user/${username}/comments?limit=${Math.min(limit, 100)}`;
  const response = await client.makeRequest<RedditCommentListing>(endpoint);

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
 * @param client - Authenticated Reddit API client
 * @param username - Reddit username (without u/ prefix)
 * @param limit - Number of posts to fetch (max 100)
 */
export async function getUserPosts(
  client: RedditApiClient,
  username: string,
  limit: number = 100
): Promise<RedditPost[]> {
  const endpoint = `/user/${username}/submitted?limit=${Math.min(limit, 100)}`;
  const response = await client.makeRequest<RedditPostListing>(endpoint);

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
