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
  author: string;
  body: string;
  subreddit: string;
  created_utc: number;
  permalink: string;
  score: number;
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
