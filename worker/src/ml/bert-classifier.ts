/**
 * BERT/RoBERTa classifier for AI text detection
 * Uses pre-trained models specifically trained for AI text detection
 */

import { BertConfig, BertScore } from '../lib/types';
import {
  HuggingFaceClient,
  createHuggingFaceClient,
} from './huggingface-client';

const DEFAULT_CONFIG: BertConfig = {
  model: 'Hello-SimpleAI/chatgpt-detector-roberta',
  maxLength: 512,
  minLength: 20,
  threshold: 0.5,
};

export class BertClassifier {
  private client: HuggingFaceClient;
  private config: BertConfig;

  constructor(config: Partial<BertConfig> = {}) {
    this.client = createHuggingFaceClient();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Classify a single text as AI or human
   */
  async classifyText(text: string): Promise<BertScore> {
    if (text.length < this.config.minLength) {
      return {
        score: 0,
        confidence: 0,
        label: 'Unknown',
        rawScore: 0,
      };
    }

    // Truncate if too long
    const truncatedText =
      text.length > this.config.maxLength
        ? text.substring(0, this.config.maxLength)
        : text;

    try {
      const response = await this.client.classifyText(
        truncatedText,
        this.config.model,
        {
          wait_for_model: true,
          use_cache: true,
        }
      );

      if (
        !response.success ||
        !response.data ||
        !Array.isArray(response.data)
      ) {
        throw new Error(`BERT classification failed: ${response.error}`);
      }

      // Find the AI label (could be 'AI', 'Generated', 'Fake', etc.)
      const aiLabel = (
        response.data as Array<{ label: string; score: number }>
      ).find(
        (item) =>
          item.label.toLowerCase().includes('ai') ||
          item.label.toLowerCase().includes('generated') ||
          item.label.toLowerCase().includes('fake')
      );

      const humanLabel = (
        response.data as Array<{ label: string; score: number }>
      ).find(
        (item) =>
          item.label.toLowerCase().includes('human') ||
          item.label.toLowerCase().includes('real') ||
          item.label.toLowerCase().includes('authentic')
      );

      // Use AI score if available, otherwise use the highest score
      const aiScore = aiLabel?.score ?? 0;
      const humanScore = humanLabel?.score ?? 0;

      // Normalize to 0-1 scale (higher = more likely AI)
      const normalizedScore = aiScore > humanScore ? aiScore : 1 - humanScore;

      // Confidence based on how far from 0.5 (uncertainty)
      const confidence = Math.abs(normalizedScore - 0.5) * 2;

      const label = normalizedScore > this.config.threshold ? 'AI' : 'Human';

      return {
        score: normalizedScore,
        confidence,
        label,
        rawScore: aiScore,
      };
    } catch (error) {
      console.error('BERT classification failed:', error);
      return {
        score: 0,
        confidence: 0,
        label: 'Unknown',
        rawScore: 0,
      };
    }
  }

  /**
   * Batch classify multiple texts
   */
  async classifyTexts(
    texts: Array<{ id: string; text: string }>
  ): Promise<Array<{ id: string; score: BertScore }>> {
    const results = await Promise.allSettled(
      texts.map(async ({ id, text }) => ({
        id,
        score: await this.classifyText(text),
      }))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        console.error(
          `BERT classification failed for text ${index}:`,
          result.reason
        );
        return {
          id: texts[index].id,
          score: {
            score: 0,
            confidence: 0,
            label: 'Unknown',
            rawScore: 0,
          },
        };
      }
    });
  }
}

/**
 * Create a BERT classifier with default configuration
 */
export function createBertClassifier(
  config: Partial<BertConfig> = {}
): BertClassifier {
  return new BertClassifier(config);
}
