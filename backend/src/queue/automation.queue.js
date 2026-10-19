/**
 * Automation Queue Service & Enqueue Facade
 * Phase 2: Distributed Browser Worker Architecture
 *
 * Exposes type-safe enqueue methods for Express controllers and services.
 */

import crypto from 'crypto';
import { createQueue } from './queue.provider.js';
import {
  AUTOMATION_QUEUE_NAME,
  JOB_TYPES,
  JOB_PRIORITIES,
  JOB_TIMEOUTS_MS,
  RETRY_STRATEGY
} from './queue.constants.js';

let automationQueue = null;

export function getAutomationQueue() {
  if (!automationQueue) {
    automationQueue = createQueue(AUTOMATION_QUEUE_NAME);
    if (typeof automationQueue.on === 'function') {
      automationQueue.on('error', (err) => {
        // Handled: Redis offline or reconnecting
      });
    }
  }
  return automationQueue;
}

/**
 * Enqueues a SCAN_PORTAL job
 */
export async function enqueueScanPortal({
  targetUrl,
  options = {},
  userId = null,
  correlationId = null
}) {
  const queue = getAutomationQueue();
  const corrId = correlationId || crypto.randomUUID();
  const jobId = `scan_${crypto.randomUUID()}`;

  const payload = {
    jobId,
    jobType: JOB_TYPES.SCAN_PORTAL,
    targetUrl,
    options: {
      maxPages: options.maxPages || 10,
      maxDepth: options.maxDepth || 2,
      ...options
    },
    userId: userId ? String(userId) : null,
    correlationId: corrId,
    attempt: 1,
    priority: JOB_PRIORITIES[JOB_TYPES.SCAN_PORTAL],
    timeout: JOB_TIMEOUTS_MS[JOB_TYPES.SCAN_PORTAL],
    createdAt: new Date().toISOString(),
    status: 'QUEUED'
  };

  const job = await queue.add(JOB_TYPES.SCAN_PORTAL, payload, {
    jobId,
    priority: payload.priority,
    timeout: payload.timeout,
    attempts: RETRY_STRATEGY.MAX_ATTEMPTS
  });

  return { job, payload };
}

/**
 * Enqueues a SCAN_PORTAL job and awaits its result from the browser worker
 */
export async function enqueueScanPortalAndAwait({
  targetUrl,
  options = {},
  userId = null,
  correlationId = null,
  timeout = JOB_TIMEOUTS_MS[JOB_TYPES.SCAN_PORTAL]
}) {
  const { job } = await enqueueScanPortal({ targetUrl, options, userId, correlationId });

  // Await completion via polling or event
  return new Promise((resolve, reject) => {
    const queue = getAutomationQueue();
    const startTime = Date.now();
    const checkInterval = 250;

    const intervalId = setInterval(async () => {
      try {
        const currentJob = await queue.getJob(job.id);
        if (!currentJob) {
          clearInterval(intervalId);
          return reject(new Error(`Scan job ${job.id} disappeared from queue`));
        }

        if (currentJob.returnvalue) {
          clearInterval(intervalId);
          return resolve(currentJob.returnvalue);
        }

        if (currentJob.failedReason) {
          clearInterval(intervalId);
          return reject(new Error(`Scan portal failed: ${currentJob.failedReason}`));
        }

        if (Date.now() - startTime > timeout) {
          clearInterval(intervalId);
          return reject(new Error(`Scan portal timed out after ${timeout}ms`));
        }
      } catch (err) {
        clearInterval(intervalId);
        reject(err);
      }
    }, checkInterval);
  });
}

/**
 * Enqueues an EXECUTE_APPLICATION job
 */
export async function enqueueExecuteApplication({
  jobId,
  applicationId = null,
  userId,
  correlationId = null,
  targetUrl,
  steps = [],
  answers = {},
  startFromIndex = 0,
  priority = JOB_PRIORITIES[JOB_TYPES.EXECUTE_APPLICATION]
}) {
  const queue = getAutomationQueue();
  const corrId = correlationId || crypto.randomUUID();

  const payload = {
    jobId: String(jobId),
    applicationId: applicationId ? String(applicationId) : null,
    userId: String(userId),
    correlationId: corrId,
    jobType: JOB_TYPES.EXECUTE_APPLICATION,
    targetUrl,
    steps,
    answers,
    startFromIndex,
    attempt: 1,
    priority,
    timeout: JOB_TIMEOUTS_MS[JOB_TYPES.EXECUTE_APPLICATION],
    createdAt: new Date().toISOString(),
    status: 'QUEUED'
  };

  const job = await queue.add(JOB_TYPES.EXECUTE_APPLICATION, payload, {
    jobId: String(jobId),
    priority,
    timeout: payload.timeout,
    attempts: RETRY_STRATEGY.MAX_ATTEMPTS
  });

  return { job, payload };
}

/**
 * Enqueues a RESUME_APPLICATION job
 */
export async function enqueueResumeApplication({
  jobId,
  applicationId = null,
  userId = null,
  correlationId = null,
  userInput = {},
  priority = JOB_PRIORITIES[JOB_TYPES.RESUME_APPLICATION]
}) {
  const queue = getAutomationQueue();
  const corrId = correlationId || crypto.randomUUID();

  const payload = {
    jobId: String(jobId),
    applicationId: applicationId ? String(applicationId) : null,
    userId: userId ? String(userId) : null,
    correlationId: corrId,
    jobType: JOB_TYPES.RESUME_APPLICATION,
    userInput,
    attempt: 1,
    priority,
    timeout: JOB_TIMEOUTS_MS[JOB_TYPES.RESUME_APPLICATION],
    createdAt: new Date().toISOString(),
    status: 'QUEUED'
  };

  const job = await queue.add(JOB_TYPES.RESUME_APPLICATION, payload, {
    jobId: `resume_${jobId}_${Date.now()}`,
    priority,
    timeout: payload.timeout,
    attempts: RETRY_STRATEGY.MAX_ATTEMPTS
  });

  return { job, payload };
}

/**
 * Enqueues a RECOVER_APPLICATION job
 */
export async function enqueueRecoverApplication({
  jobId,
  applicationId = null,
  userId = null,
  correlationId = null,
  failureReason = 'Unknown failure',
  attempt = 1,
  priority = JOB_PRIORITIES[JOB_TYPES.RECOVER_APPLICATION]
}) {
  const queue = getAutomationQueue();
  const corrId = correlationId || crypto.randomUUID();

  const payload = {
    jobId: String(jobId),
    applicationId: applicationId ? String(applicationId) : null,
    userId: userId ? String(userId) : null,
    correlationId: corrId,
    jobType: JOB_TYPES.RECOVER_APPLICATION,
    failureReason,
    attempt,
    priority,
    timeout: JOB_TIMEOUTS_MS[JOB_TYPES.RECOVER_APPLICATION],
    createdAt: new Date().toISOString(),
    status: 'QUEUED'
  };

  const job = await queue.add(JOB_TYPES.RECOVER_APPLICATION, payload, {
    jobId: `recover_${jobId}_${Date.now()}`,
    priority,
    timeout: payload.timeout,
    attempts: 1 // Single attempt for recovery analysis
  });

  return { job, payload };
}

export default {
  getAutomationQueue,
  enqueueScanPortal,
  enqueueScanPortalAndAwait,
  enqueueExecuteApplication,
  enqueueResumeApplication,
  enqueueRecoverApplication
};
