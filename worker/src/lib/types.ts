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
  aiDetectorScore?: number;
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

export interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface FetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
}

export interface BertScore {
  score: number; // 0-1, higher = more likely AI
  confidence: number; // 0-1, confidence in the score
  label: string; // Human or AI
  rawScore: number; // Raw model output
}

export interface BertConfig {
  model: string;
  maxLength: number;
  minLength: number;
  threshold: number; // Score threshold for AI detection
}

export interface HuggingFaceConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
}

export interface HuggingFaceResponse<T = unknown> {
  data: T;
  error?: string;
  success: boolean;
}

export interface PerplexityScore {
  score: number; // 0-1, higher = more likely AI
  confidence: number; // 0-1, confidence in the score
  rawPerplexity: number; // Raw perplexity value
}

export interface PerplexityConfig {
  model: string;
  maxLength: number;
  minLength: number;
  threshold: number; // Perplexity threshold for AI detection
}

export interface AIDetectorScore {
  score: number; // 0-1, higher = more likely AI
  confidence: number; // 0-1, confidence in the score
  label: string; // Human or AI
  rawScore: number; // Raw model output
}

export interface AIDetectorConfig {
  model: string;
  maxLength: number;
  minLength: number;
  threshold: number; // Score threshold for AI detection
}
