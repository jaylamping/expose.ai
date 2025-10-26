/**
 * Generic ML API client for model repo
 * https://github.com/jaylamping/expose-ai-ml
 */
import fetch from 'node-fetch';

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

export interface MLAPIRequest {
  inputs: string | string[] | Record<string, unknown>;
  options?: {
    wait_for_model?: boolean;
    use_cache?: boolean;
    [key: string]: unknown;
  };
}

export class MLAPIClient {
  private config: Required<MLAPIConfig>;

  constructor(config: MLAPIConfig) {
    this.config = {
      apiKey: 'local-dev-key',
      timeout: 60000,
      maxRetries: 3,
      ...config,
    };
  }

  /**
   * Make a request to the ML API
   */
  async request<T = unknown>(
    model: string,
    inputs: string | string[] | Record<string, unknown>,
    options: {
      wait_for_model?: boolean;
      use_cache?: boolean;
      [key: string]: unknown;
    } = {}
  ): Promise<MLAPIResponse<T>> {
    const url = `${this.config.baseUrl}/models/${model}`;

    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && {
          Authorization: `Bearer ${this.config.apiKey}`,
        }),
      },
      body: JSON.stringify({
        inputs,
        options: {
          wait_for_model: true,
          use_cache: false,
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
            `ML API rate limited, waiting ${delay}ms before retry ${
              attempt + 1
            }/${this.config.maxRetries}`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (response.status === 503) {
          // Service unavailable - wait and retry
          const delay = Math.pow(2, attempt) * 2000;
          console.log(
            `ML API service unavailable, waiting ${delay}ms before retry ${
              attempt + 1
            }/${this.config.maxRetries}`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `ML API request failed: ${response.status} ${response.statusText} - ${errorText}`
          );
        }

        const data = await response.json();
        return {
          success: true,
          data: data as T,
        };
      } catch (error) {
        lastError = error as Error;
        console.log(
          `ML API request attempt ${attempt + 1}/${
            this.config.maxRetries
          } failed:`,
          error instanceof Error ? error.message : String(error)
        );

        if (attempt < this.config.maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    return {
      success: false,
      error: `Max retries exceeded: ${lastError?.message || 'Unknown error'}`,
    };
  }

  /**
   * Classify text using a classification model
   */
  async classifyText(
    text: string,
    model: string,
    options: { wait_for_model?: boolean; use_cache?: boolean } = {}
  ): Promise<MLAPIResponse<Array<{ label: string; score: number }>>> {
    return this.request(model, text, options);
  }

  /**
   * Generate text using a generation model
   */
  async generateText(
    text: string,
    model: string,
    options: { wait_for_model?: boolean; use_cache?: boolean } = {}
  ): Promise<MLAPIResponse<Array<{ generated_text: string }>>> {
    return this.request(model, text, options);
  }

  /**
   * Calculate perplexity using a language model
   */
  async calculatePerplexity(
    text: string,
    model: string,
    options: { wait_for_model?: boolean; use_cache?: boolean } = {}
  ): Promise<MLAPIResponse<Array<{ perplexity: number }>>> {
    return this.request(model, text, options);
  }
}

/**
 * Create an ML API client with environment configuration
 */
export function createMLAPIClient(): MLAPIClient {
  const baseUrl = process.env.ML_API_ADDRESS;

  if (!baseUrl) {
    throw new Error('ML_API_ADDRESS environment variable is required');
  }

  console.log(`🔧 ML API configured: ${baseUrl}`);

  return new MLAPIClient({
    baseUrl,
    apiKey: process.env.ML_API_KEY,
    timeout: process.env.ML_API_TIMEOUT
      ? parseInt(process.env.ML_API_TIMEOUT)
      : undefined,
    maxRetries: process.env.ML_API_MAX_RETRIES
      ? parseInt(process.env.ML_API_MAX_RETRIES)
      : undefined,
  });
}
