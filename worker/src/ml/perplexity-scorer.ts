/**
 * Perplexity-based AI text detection using GPT-2 model
 * Lower perplexity = more likely AI-generated
 */

import {
  HuggingFaceClient,
  createHuggingFaceClient,
} from './huggingface-client';

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

const DEFAULT_CONFIG: PerplexityConfig = {
  model: 'gpt2',
  maxLength: 512,
  minLength: 20,
  threshold: 30, // Perplexity < 30 is suspicious
};

export class PerplexityScorer {
  private client: HuggingFaceClient;
  private config: PerplexityConfig;

  constructor(config: Partial<PerplexityConfig> = {}) {
    this.client = createHuggingFaceClient();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Calculate perplexity score for a single text
   */
  async scoreText(text: string): Promise<PerplexityScore> {
    if (text.length < this.config.minLength) {
      return {
        score: 0,
        confidence: 0,
        rawPerplexity: 0,
      };
    }

    // Truncate if too long
    const truncatedText =
      text.length > this.config.maxLength
        ? text.substring(0, this.config.maxLength)
        : text;

    try {
      // Use GPT-2 to calculate perplexity
      const response = await this.client.generateText(
        truncatedText,
        this.config.model,
        {
          wait_for_model: true,
          use_cache: true,
        }
      );

      if (!response.success || !response.data) {
        throw new Error(`Perplexity calculation failed: ${response.error}`);
      }

      // Calculate perplexity from the model's output
      // This is a simplified approach - in practice, you'd need to calculate
      // the actual perplexity using the model's log probabilities
      const rawPerplexity = this.estimatePerplexity(
        truncatedText,
        response.data
      );

      // Normalize to 0-1 scale (lower perplexity = higher AI probability)
      const normalizedScore = Math.max(
        0,
        Math.min(1, 1 - rawPerplexity / this.config.threshold)
      );

      // Confidence based on how far from threshold
      const distanceFromThreshold = Math.abs(
        rawPerplexity - this.config.threshold
      );
      const confidence = Math.min(
        1,
        distanceFromThreshold / this.config.threshold
      );

      return {
        score: normalizedScore,
        confidence,
        rawPerplexity,
      };
    } catch (error) {
      console.error('Perplexity scoring failed:', error);
      return {
        score: 0,
        confidence: 0,
        rawPerplexity: 0,
      };
    }
  }

  /**
   * Batch score multiple texts
   */
  async scoreTexts(
    texts: Array<{ id: string; text: string }>
  ): Promise<Array<{ id: string; score: PerplexityScore }>> {
    const results = await Promise.allSettled(
      texts.map(async ({ id, text }) => ({
        id,
        score: await this.scoreText(text),
      }))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        console.error(
          `Perplexity scoring failed for text ${index}:`,
          result.reason
        );
        return {
          id: texts[index].id,
          score: {
            score: 0,
            confidence: 0,
            rawPerplexity: 0,
          },
        };
      }
    });
  }

  /**
   * Estimate perplexity from model output
   * This is a simplified implementation - in practice, you'd calculate
   * the actual perplexity using the model's log probabilities
   */
  private estimatePerplexity(
    text: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _modelOutput: Array<{ generated_text?: string }>
  ): number {
    // Simplified perplexity estimation
    // In practice, you'd use the model's actual log probabilities
    const textLength = text.length;
    const wordCount = text.split(/\s+/).length;

    // Rough estimation based on text characteristics
    // This is a placeholder - real implementation would use model probabilities
    const basePerplexity = Math.log(wordCount) * 10;
    const lengthFactor = Math.log(textLength) * 2;

    return basePerplexity + lengthFactor;
  }
}

/**
 * Create a perplexity scorer with default configuration
 */
export function createPerplexityScorer(
  config: Partial<PerplexityConfig> = {}
): PerplexityScorer {
  return new PerplexityScorer(config);
}
