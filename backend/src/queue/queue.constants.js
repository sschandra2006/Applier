/**
 * Queue Constants & Job Type Definitions
 * Phase 2: Distributed Browser Worker Architecture
 */

export const AUTOMATION_QUEUE_NAME = 'automation-jobs';

export const JOB_TYPES = Object.freeze({
  SCAN_PORTAL: 'SCAN_PORTAL',
  EXECUTE_APPLICATION: 'EXECUTE_APPLICATION',
  RESUME_APPLICATION: 'RESUME_APPLICATION',
  RECOVER_APPLICATION: 'RECOVER_APPLICATION'
});

export const JOB_PRIORITIES = Object.freeze({
  [JOB_TYPES.SCAN_PORTAL]: 1,
  [JOB_TYPES.EXECUTE_APPLICATION]: 1,
  [JOB_TYPES.RESUME_APPLICATION]: 2, // Resuming a paused job gets higher priority
  [JOB_TYPES.RECOVER_APPLICATION]: 3  // Recovery is urgent
});

export const JOB_TIMEOUTS_MS = Object.freeze({
  [JOB_TYPES.SCAN_PORTAL]: 120000,       // 2 minutes for crawling & screenshotting
  [JOB_TYPES.EXECUTE_APPLICATION]: 600000, // 10 minutes for full form automation
  [JOB_TYPES.RESUME_APPLICATION]: 300000,  // 5 minutes for post-pause execution
  [JOB_TYPES.RECOVER_APPLICATION]: 120000  // 2 minutes for recovery analysis
});

export const WORKER_STATUS = Object.freeze({
  IDLE: 'IDLE',
  ASSIGNED: 'ASSIGNED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  STALLED: 'STALLED'
});

export const RETRY_STRATEGY = Object.freeze({
  MAX_ATTEMPTS: 3,
  BACKOFF_DELAY_MS: 2000, // 2s, 4s, 8s exponential backoff
  BACKOFF_TYPE: 'exponential'
});

export default {
  AUTOMATION_QUEUE_NAME,
  JOB_TYPES,
  JOB_PRIORITIES,
  JOB_TIMEOUTS_MS,
  WORKER_STATUS,
  RETRY_STRATEGY
};
