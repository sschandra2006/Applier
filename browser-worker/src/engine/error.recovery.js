/**
 * Error Recovery & AI Diagnosis Engine
 * Phase 2: Distributed Browser Worker Architecture
 */

import axios from 'axios';
import { workerConfig } from '../config/env.js';

export class ErrorRecoveryService {
  constructor(pythonApiUrl = workerConfig.pythonApiUrl) {
    this.pythonApiUrl = pythonApiUrl;
  }

  /**
   * Sends error logs to AI Orchestrator for recovery diagnosis
   */
  async diagnoseFailure(jobId, errorMessage, logs = [], targetUrl = 'unknown') {
    try {
      const response = await axios.post(
        this.pythonApiUrl,
        {
          intent: 'recover_error',
          raw_data: {
            jobId,
            message: errorMessage,
            logs: logs.map((l) => (typeof l === 'string' ? l : l.message)),
            targetUrl
          }
        },
        { timeout: 15000 }
      );

      if (response.data && response.data.success) {
        return {
          diagnosed: true,
          insight: response.data.data,
          recommendation: response.data.data?.recommendation || 'Retry after delay'
        };
      }
    } catch (err) {
      // AI diagnosis fallback
      return {
        diagnosed: false,
        insight: null,
        recommendation: 'Check portal connectivity or selector stability'
      };
    }

    return { diagnosed: false, insight: null, recommendation: 'Retry' };
  }
}

export const defaultErrorRecovery = new ErrorRecoveryService();
export default defaultErrorRecovery;
