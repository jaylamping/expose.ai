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
  data?: { children?: Array<{ data: RedditComment }> };
};

export type AnalysisRequestData = {
  platform: string;
  userId: string;
  count?: number;
  includeParent?: boolean;
  status: 'queued' | 'fetching' | 'done' | 'error';
};
