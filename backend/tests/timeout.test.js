/**
 * Job Timeout Enforcement Tests
 * Phase 2: Distributed Browser Worker Architecture
 *
 * Verifies that jobs exceeding their configured timeout limit are aborted
 * and fail with JobTimeoutError.
 */

import { InMemoryQueue, InMemoryWorker } from '../src/queue/queue.provider.js';

describe('4. Job Timeout Tests', () => {
  it('should abort and fail job when execution duration exceeds configured timeout', async () => {
    const queue = new InMemoryQueue('timeout-test-queue');

    const worker = new InMemoryWorker('timeout-test-queue', async (job) => {
      // Simulate long-running stuck operation
      await new Promise((resolve) => setTimeout(resolve, 500));
      return { success: true };
    }, {
      concurrency: 1
    });

    const job = await queue.add('stuck_job', {}, {
      timeout: 50, // 50ms timeout
      attempts: 1
    });

    const failureResult = await new Promise((resolve) => {
      worker.on('failed', (failedJob, err) => {
        resolve({ failedJob, err });
      });
    });

    expect(failureResult.err.name).toBe('JobTimeoutError');
    expect(failureResult.err.message).toContain('exceeded timeout of 50ms');

    await worker.close();
    await queue.close();
  });
});
