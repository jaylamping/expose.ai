export interface RedditComment {
  id: string;
  body: string;
  parent_id?: string;
  link_id?: string;
  subreddit: string;
  created_utc: number;
  permalink: string;
  score: number;
  selftext?: string;
  title?: string;
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

export interface AnalysisPerCommentSummary {
  commentId: string;
  score: number; // 0..1 bot-likelihood
  numTokens: number;
  hasParent?: boolean;
  // Individual model scores
  bpcScore?: number;
  perplexityScore?: number;
  bertScore?: number;
  // Pipeline stage tracking
  stage: 'bpc' | 'ml' | 'context';
  usedParentContext?: boolean;
  // Confidence metrics
  confidence?: number;
  isInconclusive?: boolean;
}

export interface AnalysisResultDoc {
  requestRef: string; // path to the request doc
  platform: string;
  userId: string;
  userScore: number; // 0..1
  analyzedCount: number;
  totalCount: number;
  perComment: AnalysisPerCommentSummary[];
  method: string; // description/version of scorer
  createdAt: number;
  // Pipeline statistics
  bpcAnalyzed: number;
  mlAnalyzed: number;
  contextAnalyzed: number;
  // Aggregate scores
  averageBPC: number;
  averagePerplexity: number;
  averageBert: number;
  // Confidence metrics
  overallConfidence: number;
}
