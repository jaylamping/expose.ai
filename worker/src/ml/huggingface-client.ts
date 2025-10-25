/**
 * HuggingFace Inference API client for ML model inference
 */

import fetch from 'node-fetch';

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

export class HuggingFaceClient {
  private config: Required<HuggingFaceConfig>;

  constructor(config: HuggingFaceConfig) {
    this.config = {
      baseUrl: 'https://api-inference.huggingface.co',
      timeout: 30000,
      maxRetries: 3,
      ...config,
    };
  }

  /**
   * Make a request to HuggingFace Inference API
   */
  async request<T = unknown>(
    model: string,
    inputs: string | string[] | Record<string, unknown>,
    options: {
      wait_for_model?: boolean;
      use_cache?: boolean;
    } = {}
  ): Promise<HuggingFaceResponse<T>> {
    const url = `${this.config.baseUrl}/models/${model}`;

    const requestOptions = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs,
        options: {
          wait_for_model: true,
          use_cache: true,
          ...options,
        },
      }),
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.config.timeout
        );

        const response = await fetch(url, {
          ...requestOptions,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === 429) {
          // Rate limited - exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          console.log(
            `HuggingFace rate limited, waiting ${delay}ms before retry ${
              attempt + 1
            }/${this.config.maxRetries}`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (response.status === 503) {
          // Model is loading - wait and retry
          const delay = Math.pow(2, attempt) * 2000;
          console.log(
            `HuggingFace model loading, waiting ${delay}ms before retry ${
              attempt + 1
            }/${this.config.maxRetries}`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `HuggingFace API error: ${response.status} ${response.statusText} - ${errorText}`
          );
        }

        const data = (await response.json()) as T;
        return {
          data,
          success: true,
        };
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.config.maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(
            `HuggingFace request failed, retrying in ${delay}ms (attempt ${
              attempt + 1
            }/${this.config.maxRetries}):`,
            error
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    return {
      data: null as T,
      error: lastError?.message || 'Max retries exceeded',
      success: false,
    };
  }

  /**
   * Text classification request
   */
  async classifyText(
    text: string,
    model: string,
    options: { wait_for_model?: boolean; use_cache?: boolean } = {}
  ): Promise<HuggingFaceResponse<Array<{ label: string; score: number }>>> {
    return this.request(model, text, options);
  }

  /**
   * Text generation request (for perplexity calculation)
   */
  async generateText(
    text: string,
    model: string,
    options: { wait_for_model?: boolean; use_cache?: boolean } = {}
  ): Promise<HuggingFaceResponse<Array<{ generated_text: string }>>> {
    return this.request(model, text, options);
  }

  /**
   * Fill mask request (for BERT-style models)
   */
  async fillMask(
    text: string,
    model: string,
    options: { wait_for_model?: boolean; use_cache?: boolean } = {}
  ): Promise<HuggingFaceResponse<Array<{ sequence: string; score: number }>>> {
    return this.request(model, text, options);
  }
}

/**
 * Create a HuggingFace client with environment configuration
 */
export function createHuggingFaceClient(): HuggingFaceClient {
  const apiKey = process.env.HUGGINGFACE_API_KEY;

  if (!apiKey) {
    throw new Error('HUGGINGFACE_API_KEY environment variable is required');
  }

  return new HuggingFaceClient({
    apiKey,
    baseUrl: process.env.HUGGINGFACE_BASE_URL,
    timeout: process.env.HUGGINGFACE_TIMEOUT
      ? parseInt(process.env.HUGGINGFACE_TIMEOUT)
      : undefined,
    maxRetries: process.env.HUGGINGFACE_MAX_RETRIES
      ? parseInt(process.env.HUGGINGFACE_MAX_RETRIES)
      : undefined,
  });
}
