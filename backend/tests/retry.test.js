/**
 * Retry & Exponential Backoff Tests
 * Phase 2: Distributed Browser Worker Architecture
 *
 * Verifies that transient execution errors trigger retries with exponential backoff,
 * incrementing attempt counters up to MAX_ATTEMPTS.
 */

import { InMemoryQueue, InMemoryWorker } from '../src/queue/queue.provider.js';
import { RETRY_STRATEGY } from '../src/queue/queue.constants.js';

describe('3. Retry & Exponential Backoff Tests', () => {
  it('should retry a failed job up to max attempts with backoff', async () => {
    const queue = new InMemoryQueue('retry-test-queue');
    let executionAttempts = 0;

    const worker = new InMemoryWorker('retry-test-queue', async (job) => {
      executionAttempts++;
      if (executionAttempts < 3) {
        throw new Error(`Transient failure attempt ${executionAttempts}`);
      }
      return { success: true, attempt: executionAttempts };
    }, {
      concurrency: 1
    });

    const job = await queue.add('test_job', { data: 'test' }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10 } // Short delay for fast test
    });

    const completionResult = await new Promise((resolve, reject) => {
      worker.on('completed', (completedJob, result) => {
        resolve({ completedJob, result });
      });
      worker.on('failed', (failedJob, err) => {
        reject(err);
      });
    });

    expect(executionAttempts).toBe(3);
    expect(completionResult.result.success).toBe(true);
    expect(completionResult.completedJob.attemptsMade).toBe(3);

    await worker.close();
    await queue.close();
  });

  it('should mark job failed when exceeding maximum retry attempts', async () => {
    const queue = new InMemoryQueue('fail-test-queue');
    let attemptCount = 0;

    const worker = new InMemoryWorker('fail-test-queue', async (job) => {
      attemptCount++;
      throw new Error(`Persistent failure ${attemptCount}`);
    }, {
      concurrency: 1
    });

    const job = await queue.add('doomed_job', {}, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 10 }
    });

    const failureResult = await new Promise((resolve) => {
      worker.on('failed', (failedJob, err) => {
        resolve({ failedJob, err });
      });
    });

    expect(attemptCount).toBe(2);
    expect(failureResult.failedJob.attemptsMade).toBe(2);
    expect(failureResult.err.message).toContain('Persistent failure 2');

    await worker.close();
    await queue.close();
  });
});
