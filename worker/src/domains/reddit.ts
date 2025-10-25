import fetch from "node-fetch";
import { RedditComment, RedditCommentsListing } from "../lib/types";

export async function fetchUserComments(
  username: string,
  limit: number
): Promise<RedditComment[]> {
  // Server-side: favor public endpoints for recent comments to avoid user auth
  const url = `https://www.reddit.com/user/${encodeURIComponent(
    username
  )}/comments.json?limit=${Math.min(limit, 100)}&raw_json=1`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "expose.ai-worker/0.1 (+github.com/jaylamping/expose.ai)",
    },
  });
  if (!res.ok) throw new Error(`Reddit fetch failed: ${res.statusText}`);
  const json = (await res.json()) as RedditCommentsListing;
  const children = json.data?.children ?? [];
  return children.map((c: any) => {
    const d = c.data;
    return {
      id: d.id,
      body: d.body || "",
      parent_id: d.parent_id,
      link_id: d.link_id,
      subreddit: d.subreddit,
      created_utc: d.created_utc,
      permalink: `https://www.reddit.com${d.permalink}`,
      score: d.score,
    } as RedditComment;
  });
}
