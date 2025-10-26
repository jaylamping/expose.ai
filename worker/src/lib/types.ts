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
  ups?: number;
  downs?: number;
  controversiality?: number;
  num_comments?: number;
  awarders?: string[];
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

export interface MLAPIConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
  maxRetries?: number;
}

export interface MLAPIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ML API Types - matching expose-ai-ml repository
export interface AnalysisOptions {
  fast_only: boolean;
  include_breakdown: boolean;
  use_context: boolean;
  force_full_analysis: boolean;
}

export interface BaseComment {
  comment_id: string;
  comment: string;
  created_at?: string;
  updated_at?: string;
}

export interface UserComment extends BaseComment {
  parent_comment?: BaseComment;
  child_comment?: BaseComment;
}

export interface AnalyzeUserRequest {
  user_id: string;
  comments: UserComment[];
  options?: AnalysisOptions;
}

export interface AnalyzeUserResponse {
  user_id: string;
  bot_score: number; // 0-100
  confidence: number; // 0-100
  is_likely_bot: boolean;
  stage: string;
  processing_time_ms: number;
  comments_analyzed: number;
  total_comments: number;
  breakdown?: Record<string, unknown>;
  explanation?: string;
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
