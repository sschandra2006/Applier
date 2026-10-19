/**
 * Redis & BullMQ Connection Configuration
 * Phase 2: Distributed Browser Worker Architecture
 */

import { config } from '../config/env.js';

export function getRedisConnectionConfig() {
  if (config.redisUrl) {
    return {
      url: config.redisUrl,
      maxRetriesPerRequest: null,
      enableReadyCheck: false
    };
  }

  return {
    host: config.redisHost || '127.0.0.1',
    port: config.redisPort || 6379,
    password: config.redisPassword || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
      if (times > 5) {
        return null; // Stop reconnecting after 5 attempts
      }
      return Math.min(times * 200, 2000);
    }
  };
}

export function isInMemoryMode() {
  return config.useInMemoryQueue || process.env.NODE_ENV === 'test';
}

export default {
  getRedisConnectionConfig,
  isInMemoryMode
};
