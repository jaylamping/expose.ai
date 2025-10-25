export interface RedditComment {
  id: string;
  body: string;
  parent_id?: string;
  link_id?: string;
  subreddit: string;
  created_utc: number;
  permalink: string;
  score: number;
}

export type RedditCommentsListing = {
  data?: { children?: Array<{ data: any }> };
};
