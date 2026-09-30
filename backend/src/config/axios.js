import axios from 'axios';
import axiosRetry from 'axios-retry';
import { logger } from './logger.js';

// Create a pre-configured instance for internal service-to-service communication
export const internalApi = axios.create({
  timeout: 120000, // 120s timeout for AI calls
});

// Phase 13: Network Resilience
axiosRetry(internalApi, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    // Retry on network errors or 5xx, or 429 Rate Limits
    const isNetworkOrIdempotent = axiosRetry.isNetworkOrIdempotentRequestError(error);
    const isRateLimit = error.response && error.response.status === 429;
    
    if (isNetworkOrIdempotent || isRateLimit) {
      logger.warn(`[AxiosRetry] Request failed. Retrying... URL: ${error.config?.url} | Status: ${error.response?.status}`);
      return true;
    }
    return false;
  }
});
