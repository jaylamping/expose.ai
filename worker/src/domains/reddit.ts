import fetch from 'node-fetch';
import {
  FetchOptions,
  FetchResponse,
  RedditComment,
  RedditCommentsListing,
} from '../lib/types';

interface RedditOAuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

let oauthToken: RedditOAuthToken | null = null;
let tokenExpiry: number = 0;

async function getRedditOAuthToken(): Promise<string> {
  const now = Date.now();

  // Return cached token if still valid
  if (oauthToken && now < tokenExpiry) {
    return oauthToken.access_token;
  }

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Reddit OAuth credentials not configured');
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'expose.ai-worker/0.1 (+github.com/jaylamping/expose.ai)',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error(`Reddit OAuth failed: ${response.statusText}`);
  }

  const tokenData = (await response.json()) as RedditOAuthToken;
  oauthToken = tokenData;
  tokenExpiry = now + tokenData.expires_in * 1000 - 60000; // 1 minute buffer

  return tokenData.access_token;
}

async function fetchWithRetry(
  url: string,
  options: FetchOptions,
  maxRetries = 3
): Promise<FetchResponse> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.status === 429) {
        // Rate limited - exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        console.log(
          `Rate limited, waiting ${delay}ms before retry ${
            attempt + 1
          }/${maxRetries}`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      return response as FetchResponse;
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      const delay = Math.pow(2, attempt) * 1000;
      console.log(
        `Request failed, retrying in ${delay}ms (attempt ${
          attempt + 1
        }/${maxRetries})`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error('Max retries exceeded');
}

export async function fetchUserComments(
  username: string,
  limit: number
): Promise<RedditComment[]> {
  console.log(
    `🔍 Starting to fetch comments for user: ${username} (limit: ${limit})`
  );

  try {
    // Try OAuth first for higher rate limits
    console.log('🔐 Attempting OAuth authentication...');
    const token = await getRedditOAuthToken();
    const url = `https://oauth.reddit.com/user/${encodeURIComponent(
      username
    )}/comments?limit=${Math.min(limit, 100)}&raw_json=1`;

    console.log(`📡 Making OAuth request to: ${url}`);
    const response = await fetchWithRetry(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'expose.ai-worker/0.1 (+github.com/jaylamping/expose.ai)',
      },
    });

    if (response.ok) {
      console.log('✅ OAuth request successful');
      const json = (await response.json()) as RedditCommentsListing;
      const children = json.data?.children ?? [];
      console.log(
        `📊 Raw API response contains ${children.length} comment objects`
      );

      const comments = children.map((c: { data: RedditComment }) => {
        const d = c.data;
        return {
          id: d.id,
          body: d.body || '',
          parent_id: d.parent_id,
          link_id: d.link_id,
          subreddit: d.subreddit,
          created_utc: d.created_utc,
          permalink: `https://www.reddit.com${d.permalink}`,
          score: d.score,
        } as RedditComment;
      });

      console.log(`📝 Processed ${comments.length} comments from OAuth API`);
      console.log('📋 Sample comment structure:', {
        id: comments[0]?.id,
        body: comments[0]?.body?.substring(0, 100) + '...',
        subreddit: comments[0]?.subreddit,
        score: comments[0]?.score,
        created_utc: comments[0]?.created_utc,
      });

      return comments;
    }
  } catch (error) {
    console.log('❌ OAuth failed, falling back to public API:', error);
  }

  // Fallback to public endpoint
  console.log('🌐 Falling back to public Reddit API...');
  const url = `https://www.reddit.com/user/${encodeURIComponent(
    username
  )}/comments.json?limit=${Math.min(limit, 100)}&raw_json=1`;

  console.log(`📡 Making public API request to: ${url}`);
  const res = await fetchWithRetry(url, {
    headers: {
      'User-Agent': 'expose.ai-worker/0.1 (+github.com/jaylamping/expose.ai)',
    },
  });

  if (!res.ok) {
    console.error(`❌ Public API request failed: ${res.statusText}`);
    throw new Error(`Reddit fetch failed: ${res.statusText}`);
  }

  console.log('✅ Public API request successful');
  const json = (await res.json()) as RedditCommentsListing;
  const children = json.data?.children ?? [];
  console.log(
    `📊 Public API response contains ${children.length} comment objects`
  );

  const comments = children.map((c: { data: RedditComment }) => {
    const d = c.data;
    return {
      id: d.id,
      body: d.body || '',
      parent_id: d.parent_id,
      link_id: d.link_id,
      subreddit: d.subreddit,
      created_utc: d.created_utc,
      permalink: `https://www.reddit.com${d.permalink}`,
      score: d.score,
    } as RedditComment;
  });

  console.log(`📝 Processed ${comments.length} comments from public API`);
  console.log('📋 Sample comment structure:', {
    id: comments[0]?.id,
    body: comments[0]?.body?.substring(0, 100) + '...',
    subreddit: comments[0]?.subreddit,
    score: comments[0]?.score,
    created_utc: comments[0]?.created_utc,
  });

  return comments;
}

export async function fetchParentContext(
  commentId: string
): Promise<string | null> {
  try {
    const token = await getRedditOAuthToken();
    const url = `https://oauth.reddit.com/api/info?id=t1_${commentId}&raw_json=1`;

    const response = await fetchWithRetry(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'expose.ai-worker/0.1 (+github.com/jaylamping/expose.ai)',
      },
    });

    if (response.ok) {
      const json = (await response.json()) as RedditCommentsListing;
      const comment = json.data?.children?.[0]?.data as RedditComment;
      if (comment) {
        // If this is a comment, try to get the parent
        if (comment.parent_id?.startsWith('t1_')) {
          // Parent is another comment
          const parentCommentId = comment.parent_id.replace('t1_', '');
          return await fetchParentContext(parentCommentId);
        } else if (comment.parent_id?.startsWith('t3_')) {
          // Parent is a post - fetch the post content
          const postId = comment.parent_id.replace('t3_', '');
          const postUrl = `https://oauth.reddit.com/api/info?id=t3_${postId}&raw_json=1`;
          const postResponse = await fetchWithRetry(postUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
              'User-Agent':
                'expose.ai-worker/0.1 (+github.com/jaylamping/expose.ai)',
            },
          });

          if (postResponse.ok) {
            const postJson =
              (await postResponse.json()) as RedditCommentsListing;
            const post = postJson.data?.children?.[0]?.data as RedditComment;
            if (post) {
              return post.selftext || post.title || '';
            }
          }
        }
      }
    }
  } catch (error) {
    console.log('Failed to fetch parent context:', error);
  }

  return null;
}
