/**
 * Generic ML API client for model repo
 * https://github.com/jaylamping/expose-ai-ml
 */
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
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
   * Analyze a user for bot detection using the expose-ai-ml API
   */
  async analyzeUser(
    request: AnalyzeUserRequest
  ): Promise<MLAPIResponse<AnalyzeUserResponse>> {
    const url = `${this.config.baseUrl}/api/v1/analyze/user`;

    const requestConfig: AxiosRequestConfig = {
      method: 'POST',
      url,
      // headers: {
      //   'Content-Type': 'application/json',
      //   ...(this.config.apiKey && {
      //     Authorization: `Bearer ${this.config.apiKey}`,
      //   }),
      // },
      data: request,
      timeout: this.config.timeout,
    };

    try {
      const response: AxiosResponse = await axios(requestConfig);

      if (response.status === 429) {
        // Rate limited - exponential backoff
        const delay = 1000;
        console.log(`ML API rate limited, waiting ${delay}ms before retry`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      if (response.status === 503) {
        // Service unavailable - wait and retry
        const delay = 2000;
        console.log(
          `ML API service unavailable, waiting ${delay}ms before retry`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      return {
        success: true,
        data: response.data as AnalyzeUserResponse,
      };
    } catch (error: unknown) {
      // Handle axios-specific error responses
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as {
          response: { status: number; statusText: string; data: unknown };
        };
        const status = axiosError.response.status;
        if (status === 429 || status === 503) {
          const delay = status === 429 ? 1000 : 2000;

          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        throw error;
      }

      throw error;
    }
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
