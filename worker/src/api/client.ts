/**
 * Generic ML API client for model repo
 * https://github.com/jaylamping/expose-ai-ml
 */
import fetch from 'node-fetch';
import type {
  AnalyzeUserRequest,
  AnalyzeUserResponse,
  MLAPIConfig,
  MLAPIResponse,
} from '../lib/types';

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

  /**
   * Analyze a user for bot detection using the expose-ai-ml API
   */
  async analyzeUser(
    request: AnalyzeUserRequest
  ): Promise<MLAPIResponse<AnalyzeUserResponse>> {
    const url = `${this.config.baseUrl}/api/v1/analyze-user`;

    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && {
          Authorization: `Bearer ${this.config.apiKey}`,
        }),
      },
      body: JSON.stringify(request),
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
            `ML API analyze-user request failed: ${response.status} ${response.statusText} - ${errorText}`
          );
        }

        const data = await response.json();
        return {
          success: true,
          data: data as AnalyzeUserResponse,
        };
      } catch (error) {
        lastError = error as Error;
        console.log(
          `ML API analyze-user request attempt ${attempt + 1}/${
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
}

/**
 * Create an ML API client with environment configuration
 *
 * @example
 * ```typescript
 * const client = createMLAPIClient();
 *
 * const request: AnalyzeUserRequest = {
 *   user_id: "reddit_username",
 *   comments: [
 *     {
 *       comment_id: "c1",
 *       comment: "This is a great post!",
 *       created_at: "2024-01-01T00:00:00Z"
 *     }
 *   ],
 *   options: {
 *     fast_only: false,
 *     include_breakdown: true,
 *     use_context: true,
 *     force_full_analysis: false
 *   }
 * };
 *
 * const result = await client.analyzeUser(request);
 * if (result.success) {
 *   console.log(`Bot Score: ${result.data?.bot_score}%`);
 *   console.log(`Confidence: ${result.data?.confidence}%`);
 *   console.log(`Is Bot: ${result.data?.is_likely_bot}`);
 * }
 * ```
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
