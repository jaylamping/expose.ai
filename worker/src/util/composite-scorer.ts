/**
 * Composite scoring system that combines multiple detection methods
 * with configurable weights and confidence thresholds
 */

import { AnalysisPerCommentSummary } from '../lib/types';

export interface ScoringWeights {
  bpc: number; // Bits-per-character weight
  perplexity: number; // Perplexity model weight
  bert: number; // BERT classifier weight
}

export interface ScoringConfig {
  weights: ScoringWeights;
  confidenceThreshold: number; // Minimum confidence to use ML scores
  inconclusiveThreshold: number; // BPC threshold for inconclusive cases
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  bpc: 0.2,
  perplexity: 0.4,
  bert: 0.4,
};

const DEFAULT_CONFIG: ScoringConfig = {
  weights: DEFAULT_WEIGHTS,
  confidenceThreshold: 0.6,
  inconclusiveThreshold: 0.3, // BPC score between 0.3-0.7 is inconclusive
};

export class CompositeScorer {
  private config: ScoringConfig;

  constructor(config: Partial<ScoringConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Calculate composite score for a single comment
   */
  calculateScore(comment: AnalysisPerCommentSummary): number {
    const { bpcScore, perplexityScore, bertScore, stage, confidence } = comment;

    // If we only have BPC score (stage 1)
    if (stage === 'bpc' && bpcScore !== undefined) {
      return bpcScore;
    }

    // If we have ML scores (stage 2 or 3)
    if (stage === 'ml' || stage === 'context') {
      const scores: number[] = [];
      const weights: number[] = [];

      // Add BPC score if available
      if (bpcScore !== undefined) {
        scores.push(bpcScore);
        weights.push(this.config.weights.bpc);
      }

      // Add perplexity score if available and confident
      if (
        perplexityScore !== undefined &&
        (confidence || 0) >= this.config.confidenceThreshold
      ) {
        scores.push(perplexityScore);
        weights.push(this.config.weights.perplexity);
      }

      // Add BERT score if available and confident
      if (
        bertScore !== undefined &&
        (confidence || 0) >= this.config.confidenceThreshold
      ) {
        scores.push(bertScore);
        weights.push(this.config.weights.bert);
      }

      // If we have multiple scores, use weighted average
      if (scores.length > 1) {
        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
        if (totalWeight > 0) {
          const weightedSum = scores.reduce(
            (sum, score, i) => sum + score * weights[i],
            0
          );
          return weightedSum / totalWeight;
        }
      }

      // Fallback to first available score
      return scores[0] || 0;
    }

    return 0;
  }

  /**
   * Determine if a comment needs further analysis
   */
  needsFurtherAnalysis(comment: AnalysisPerCommentSummary): boolean {
    const { bpcScore, stage, confidence } = comment;

    // If we're still in BPC stage and score is inconclusive
    if (stage === 'bpc' && bpcScore !== undefined) {
      return (
        bpcScore >= this.config.inconclusiveThreshold &&
        bpcScore <= 1 - this.config.inconclusiveThreshold
      );
    }

    // If we're in ML stage but confidence is low
    if (stage === 'ml' && (confidence || 0) < this.config.confidenceThreshold) {
      return true;
    }

    return false;
  }

  /**
   * Calculate aggregate user score from all comments
   */
  calculateUserScore(comments: AnalysisPerCommentSummary[]): {
    userScore: number;
    confidence: number;
    statistics: {
      bpcAnalyzed: number;
      mlAnalyzed: number;
      contextAnalyzed: number;
      averageBPC: number;
      averagePerplexity: number;
      averageBert: number;
    };
  } {
    const validComments = comments.filter((c) => c.score > 0);

    if (validComments.length === 0) {
      return {
        userScore: 0,
        confidence: 0,
        statistics: {
          bpcAnalyzed: 0,
          mlAnalyzed: 0,
          contextAnalyzed: 0,
          averageBPC: 0,
          averagePerplexity: 0,
          averageBert: 0,
        },
      };
    }

    // Calculate stage statistics
    const bpcAnalyzed = validComments.filter((c) => c.stage === 'bpc').length;
    const mlAnalyzed = validComments.filter((c) => c.stage === 'ml').length;
    const contextAnalyzed = validComments.filter(
      (c) => c.stage === 'context'
    ).length;

    // Calculate average scores
    const averageBPC =
      validComments
        .filter((c) => c.bpcScore !== undefined)
        .reduce((sum, c) => sum + (c.bpcScore || 0), 0) /
        validComments.filter((c) => c.bpcScore !== undefined).length || 0;

    const averagePerplexity =
      validComments
        .filter((c) => c.perplexityScore !== undefined)
        .reduce((sum, c) => sum + (c.perplexityScore || 0), 0) /
        validComments.filter((c) => c.perplexityScore !== undefined).length ||
      0;

    const averageBert =
      validComments
        .filter((c) => c.bertScore !== undefined)
        .reduce((sum, c) => sum + (c.bertScore || 0), 0) /
        validComments.filter((c) => c.bertScore !== undefined).length || 0;

    // Calculate weighted user score
    const userScore =
      validComments.reduce((sum, c) => sum + c.score, 0) / validComments.length;

    // Calculate overall confidence based on stage distribution
    const totalComments = validComments.length;
    const confidence = Math.min(
      1,
      (bpcAnalyzed * 0.3 + mlAnalyzed * 0.7 + contextAnalyzed * 1.0) /
        totalComments
    );

    return {
      userScore,
      confidence,
      statistics: {
        bpcAnalyzed,
        mlAnalyzed,
        contextAnalyzed,
        averageBPC,
        averagePerplexity,
        averageBert,
      },
    };
  }
}

/**
 * Create a composite scorer with default configuration
 */
export function createCompositeScorer(
  config: Partial<ScoringConfig> = {}
): CompositeScorer {
  return new CompositeScorer(config);
}
