/**
 * Queue Unit Tests
 * Phase 2: Distributed Browser Worker Architecture
 *
 * Verifies:
 * 1. All 4 job types (SCAN_PORTAL, EXECUTE_APPLICATION, RESUME_APPLICATION, RECOVER_APPLICATION).
 * 2. Every job contains required metadata: jobId, applicationId, userId, correlationId, attempt, priority, createdAt, timeout, status.
 * 3. Priority scheduling: higher priority jobs are dequeued first.
 */

import {
  JOB_TYPES,
  JOB_PRIORITIES,
  JOB_TIMEOUTS_MS,
  RETRY_STRATEGY
} from '../src/queue/queue.constants.js';
import {
  enqueueScanPortal,
  enqueueExecuteApplication,
  enqueueResumeApplication,
  enqueueRecoverApplication,
  getAutomationQueue
} from '../src/queue/automation.queue.js';
import { resetInMemoryQueues } from '../src/queue/queue.provider.js';

describe('1. Automation Queue Unit Tests', () => {
  beforeEach(() => {
    resetInMemoryQueues();
  });

  afterAll(() => {
    resetInMemoryQueues();
  });

  it('should enqueue SCAN_PORTAL job with complete canonical metadata', async () => {
    const { job, payload } = await enqueueScanPortal({
      targetUrl: 'https://scholarships.gov.in/fresh',
      options: { maxPages: 5 },
      userId: 'user_123',
      correlationId: 'corr_abc'
    });

    expect(job).toBeDefined();
    expect(payload.jobType).toBe(JOB_TYPES.SCAN_PORTAL);
    expect(payload.targetUrl).toBe('https://scholarships.gov.in/fresh');
    expect(payload.userId).toBe('user_123');
    expect(payload.correlationId).toBe('corr_abc');
    expect(payload.priority).toBe(JOB_PRIORITIES[JOB_TYPES.SCAN_PORTAL]);
    expect(payload.timeout).toBe(JOB_TIMEOUTS_MS[JOB_TYPES.SCAN_PORTAL]);
    expect(payload.attempt).toBe(1);
    expect(payload.status).toBe('QUEUED');
    expect(payload.createdAt).toBeDefined();
  });

  it('should enqueue EXECUTE_APPLICATION job with required fields', async () => {
    const { job, payload } = await enqueueExecuteApplication({
      jobId: 'job_exec_101',
      applicationId: 'app_555',
      userId: 'user_123',
      correlationId: 'corr_exec',
      targetUrl: 'https://scholarships.gov.in',
      steps: [{ type: 'navigate', url: 'https://scholarships.gov.in' }],
      answers: { name: 'Jane' },
      startFromIndex: 0
    });

    expect(job).toBeDefined();
    expect(payload.jobType).toBe(JOB_TYPES.EXECUTE_APPLICATION);
    expect(payload.jobId).toBe('job_exec_101');
    expect(payload.applicationId).toBe('app_555');
    expect(payload.userId).toBe('user_123');
    expect(payload.steps).toHaveLength(1);
    expect(payload.answers).toEqual({ name: 'Jane' });
    expect(payload.timeout).toBe(JOB_TIMEOUTS_MS[JOB_TYPES.EXECUTE_APPLICATION]);
  });

  it('should enqueue RESUME_APPLICATION job with higher priority', async () => {
    const { job, payload } = await enqueueResumeApplication({
      jobId: 'job_resume_202',
      applicationId: 'app_555',
      userId: 'user_123',
      userInput: { otp: '123456' }
    });

    expect(job).toBeDefined();
    expect(payload.jobType).toBe(JOB_TYPES.RESUME_APPLICATION);
    expect(payload.userInput).toEqual({ otp: '123456' });
    expect(payload.priority).toBe(JOB_PRIORITIES[JOB_TYPES.RESUME_APPLICATION]);
    expect(payload.priority).toBeGreaterThan(JOB_PRIORITIES[JOB_TYPES.EXECUTE_APPLICATION]);
  });

  it('should enqueue RECOVER_APPLICATION job with highest priority', async () => {
    const { job, payload } = await enqueueRecoverApplication({
      jobId: 'job_rec_303',
      applicationId: 'app_555',
      failureReason: 'NavigationTimeout',
      attempt: 2
    });

    expect(job).toBeDefined();
    expect(payload.jobType).toBe(JOB_TYPES.RECOVER_APPLICATION);
    expect(payload.failureReason).toBe('NavigationTimeout');
    expect(payload.attempt).toBe(2);
    expect(payload.priority).toBe(JOB_PRIORITIES[JOB_TYPES.RECOVER_APPLICATION]);
    expect(payload.priority).toBeGreaterThan(JOB_PRIORITIES[JOB_TYPES.RESUME_APPLICATION]);
  });

  it('should schedule higher priority jobs ahead of lower priority jobs in waiting queue', async () => {
    const queue = getAutomationQueue();

    // Enqueue normal priority job
    await enqueueExecuteApplication({
      jobId: 'normal_1',
      userId: 'u1',
      targetUrl: 'https://example.com'
    });

    // Enqueue urgent recovery job
    await enqueueRecoverApplication({
      jobId: 'urgent_1',
      failureReason: 'Critical failure'
    });

    // Enqueue resume job
    await enqueueResumeApplication({
      jobId: 'resume_1',
      userInput: { otp: '999' }
    });

    // Check waiting list order
    expect(queue.waiting[0].name).toBe(JOB_TYPES.RECOVER_APPLICATION);
    expect(queue.waiting[1].name).toBe(JOB_TYPES.RESUME_APPLICATION);
    expect(queue.waiting[2].name).toBe(JOB_TYPES.EXECUTE_APPLICATION);
  });
});
