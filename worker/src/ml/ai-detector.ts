/**
 * AI Detector for AI text detection using Hugging Face Inference API
 * Uses various AI detection models available on Hugging Face
 */

import { AIDetectorConfig, AIDetectorScore } from '../lib/types';
import {
  HuggingFaceClient,
  createHuggingFaceClient,
} from './huggingface-client.js';

const DEFAULT_CONFIG: AIDetectorConfig = {
  model: 'microsoft/DialoGPT-medium', // Fallback model, will be overridden
  maxLength: 512,
  minLength: 20,
  threshold: 0.5,
};

// List of AI detection models to try in order of preference
const AI_DETECTION_MODELS = ['Hello-SimpleAI/chatgpt-detector-roberta'];

export class AIDetector {
  private client: HuggingFaceClient;
  private config: AIDetectorConfig;
  private availableModels: string[] = [];

  constructor(config: Partial<AIDetectorConfig> = {}) {
    this.client = createHuggingFaceClient();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.availableModels = [...AI_DETECTION_MODELS];
  }

  /**
   * Detect AI-generated text using the best available model
   */
  async detectText(text: string): Promise<AIDetectorScore> {
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

    // Try each model until one works
    for (const model of this.availableModels) {
      try {
        const result = await this.detectWithModel(truncatedText, model);
        if (result.score >= 0) {
          // Update config to use the working model
          this.config.model = model;
          return result;
        }
      } catch (error) {
        console.warn(`AI Detector model ${model} failed:`, error);
        continue;
      }
    }

    // If all models fail, return a default result
    console.error('All AI Detector models failed');
    return {
      score: 0,
      confidence: 0,
      label: 'Unknown',
      rawScore: 0,
    };
  }

  /**
   * Detect AI text using a specific model
   */
  private async detectWithModel(
    text: string,
    model: string
  ): Promise<AIDetectorScore> {
    try {
      // Try text classification first (for models like chatgpt-detector-roberta)
      const classificationResponse = await this.client.classifyText(
        text,
        model,
        {
          wait_for_model: true,
          use_cache: true,
        }
      );

      if (classificationResponse.success && classificationResponse.data) {
        return this.processClassificationResult(
          classificationResponse.data as Array<{ label: string; score: number }>
        );
      } else {
        console.log(
          `Classification failed for ${model}:`,
          classificationResponse.error
        );
      }

      // If classification fails, try text generation (for models like GPT-2)
      const generationResponse = await this.client.generateText(text, model, {
        wait_for_model: true,
        use_cache: true,
      });

      if (generationResponse.success && generationResponse.data) {
        return this.processGenerationResult(text, generationResponse.data);
      } else {
        console.log(
          `Generation failed for ${model}:`,
          generationResponse.error
        );
      }

      throw new Error('Both classification and generation failed');
    } catch (error) {
      console.error(`AI Detector model ${model} failed:`, error);
      throw error;
    }
  }

  /**
   * Process classification results (for models like chatgpt-detector-roberta)
   */
  private processClassificationResult(
    data: Array<{ label: string; score: number }>
  ): AIDetectorScore {
    // Find AI-related labels
    const aiLabel = data.find(
      (item) =>
        item.label.toLowerCase().includes('ai') ||
        item.label.toLowerCase().includes('generated') ||
        item.label.toLowerCase().includes('fake') ||
        item.label.toLowerCase().includes('synthetic')
    );

    const humanLabel = data.find(
      (item) =>
        item.label.toLowerCase().includes('human') ||
        item.label.toLowerCase().includes('real') ||
        item.label.toLowerCase().includes('authentic') ||
        item.label.toLowerCase().includes('original')
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
  }

  /**
   * Process generation results (for models like GPT-2)
   */
  private processGenerationResult(
    originalText: string,
    data: Array<{ generated_text?: string }>
  ): AIDetectorScore {
    // For generation models, we can estimate AI likelihood based on:
    // 1. How well the model can continue the text
    // 2. Perplexity-like metrics
    // 3. Text similarity to training data

    if (!data || data.length === 0) {
      return {
        score: 0,
        confidence: 0,
        label: 'Unknown',
        rawScore: 0,
      };
    }

    const generatedText = data[0]?.generated_text || '';

    // Simple heuristic: if the model generates text very similar to the input,
    // it might be AI-generated (since AI models are trained on similar patterns)
    const similarity = this.calculateTextSimilarity(
      originalText,
      generatedText
    );

    // Estimate perplexity-like score based on text characteristics
    const perplexityEstimate = this.estimatePerplexity(originalText);

    // Combine similarity and perplexity for final score
    const rawScore = (similarity + (1 - perplexityEstimate / 100)) / 2;
    const normalizedScore = Math.max(0, Math.min(1, rawScore));

    // Confidence based on how clear the signal is
    const confidence = Math.abs(normalizedScore - 0.5) * 2;

    const label = normalizedScore > this.config.threshold ? 'AI' : 'Human';

    return {
      score: normalizedScore,
      confidence,
      label,
      rawScore,
    };
  }

  /**
   * Calculate text similarity between two strings
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);

    const set1 = new Set(words1);
    const set2 = new Set(words2);

    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * Estimate perplexity-like score for text
   */
  private estimatePerplexity(text: string): number {
    const words = text.split(/\s+/);
    const chars = text.length;

    // Simple perplexity estimation based on text characteristics
    // This is a placeholder - real implementation would use model probabilities
    const wordCount = words.length;
    const avgWordLength = chars / wordCount;

    // Higher perplexity for more random/creative text
    const basePerplexity = Math.log(wordCount) * 10;
    const lengthFactor = Math.log(chars) * 2;
    const creativityFactor = avgWordLength * 5;

    return basePerplexity + lengthFactor + creativityFactor;
  }

  /**
   * Batch detect multiple texts
   */
  async detectTexts(
    texts: Array<{ id: string; text: string }>
  ): Promise<Array<{ id: string; score: AIDetectorScore }>> {
    const results = await Promise.allSettled(
      texts.map(async ({ id, text }) => ({
        id,
        score: await this.detectText(text),
      }))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        console.error(`AI Detector failed for text ${index}:`, result.reason);
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

  /**
   * Get the currently active model
   */
  getActiveModel(): string {
    return this.config.model;
  }

  /**
   * Get list of available models
   */
  getAvailableModels(): string[] {
    return [...this.availableModels];
  }
}

/**
 * Create an AI Detector with default configuration
 */
export function createAIDetector(
  config: Partial<AIDetectorConfig> = {}
): AIDetector {
  return new AIDetector(config);
}
