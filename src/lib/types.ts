export interface RedditTokens {
  access_token: string;
  token_type: string;
  expires_at: number; // timestamp in ms
  scope: string;
}

export interface RedditApiConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  userAgent: string;
}

export interface RedditUserData {
  name: string;
  id: string;
}

export interface RedditPost {
  id: string;
  author: string;
  body: string;
  subreddit: string;
  created_utc: number;
  permalink: string;
  score: number;
}

export interface RedditComment {
  id: string;
  parent_id?: string;
  link_id?: string;
  author: string;
  body: string;
  subreddit: string;
  created_utc: number;
  permalink: string;
  score: number;
  ups: number;
  downs: number;
  controversiality?: number;
  num_comments?: number;
  awarders?: string[];
}

export interface RedditCommentData {
  kind: string;
  data: RedditComment;
}

export interface RedditCommentListing {
  kind: string;
  data: {
    children: RedditCommentData[];
    after: string | null;
    before: string | null;
  };
}

export interface RedditPostData {
  kind: string;
  data: {
    id: string;
    author: string;
    title: string;
    selftext: string;
    subreddit: string;
    created_utc: number;
    permalink: string;
    score: number;
    url: string;
  };
}

export interface RedditPostListing {
  kind: string;
  data: {
    children: RedditPostData[];
    after: string | null;
    before: string | null;
  };
}

export interface AIAnalysisResult {
  username: string;
  totalPosts: number;
  analyzedPosts: number;
  aiProbability: number; // 0-1
  confidence: number; // 0-1
  details: {
    postId: string;
    content: string;
    aiScore: number;
    humanScore: number;
  }[];
}

export interface AnalysisMessage {
  type: "ANALYZE_USER";
  username: string;
}

export interface AnalysisResponse {
  type: "ANALYSIS_RESULT";
  result: AIAnalysisResult | null;
  error?: string;
}
