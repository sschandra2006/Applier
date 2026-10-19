/**
 * Worker Unit Tests
 * Phase 2: Distributed Browser Worker Architecture
 *
 * Verifies that BrowserWorker dispatches jobs properly to the execution engines,
 * records progress, handles checkpoints, and catches errors.
 */

import { jest } from '@jest/globals';
import { BrowserWorker } from '../../browser-worker/src/worker/browser.worker.js';
import { JOB_TYPES } from '../src/queue/queue.constants.js';

describe('2. Browser Worker Unit Tests', () => {
  it('should route SCAN_PORTAL job to portalScanner.scan', async () => {
    const mockScanner = {
      scan: jest.fn().mockResolvedValue({
        url: 'https://example.com',
        pages: [{ url: 'https://example.com', title: 'Example' }],
        screenshot: 'base64_landing'
      })
    };

    const worker = new BrowserWorker({
      portalScanner: mockScanner,
      errorRecovery: { diagnoseFailure: jest.fn().mockResolvedValue({}) }
    });

    const job = {
      name: JOB_TYPES.SCAN_PORTAL,
      data: {
        jobId: 'scan_1',
        jobType: JOB_TYPES.SCAN_PORTAL,
        targetUrl: 'https://example.com',
        options: { maxPages: 2 }
      },
      updateProgress: jest.fn()
    };

    const result = await worker.processJob(job);
    expect(mockScanner.scan).toHaveBeenCalledWith('https://example.com', { maxPages: 2 });
    expect(result.url).toBe('https://example.com');
  });

  it('should route EXECUTE_APPLICATION job to planExecutor.execute', async () => {
    const mockExecutor = {
      execute: jest.fn().mockResolvedValue({
        status: 'COMPLETED',
        finalReceipt: 'base64_receipt'
      })
    };

    const worker = new BrowserWorker({
      planExecutor: mockExecutor,
      errorRecovery: { diagnoseFailure: jest.fn().mockResolvedValue({}) }
    });

    const job = {
      name: JOB_TYPES.EXECUTE_APPLICATION,
      data: {
        jobId: 'job_app_1',
        jobType: JOB_TYPES.EXECUTE_APPLICATION,
        targetUrl: 'https://example.com/form',
        steps: [{ type: 'navigate', url: 'https://example.com/form' }],
        answers: { name: 'John' },
        startFromIndex: 0
      },
      updateProgress: jest.fn()
    };

    const result = await worker.processJob(job);
    expect(mockExecutor.execute).toHaveBeenCalled();
    const callArgs = mockExecutor.execute.mock.calls[0][0];
    expect(callArgs.targetUrl).toBe('https://example.com/form');
    expect(callArgs.answers).toEqual({ name: 'John' });
    expect(result.status).toBe('COMPLETED');
  });

  it('should route RECOVER_APPLICATION job to errorRecovery.diagnoseFailure', async () => {
    const mockRecovery = {
      diagnoseFailure: jest.fn().mockResolvedValue({
        diagnosed: true,
        recommendation: 'Increase page timeout to 60s'
      })
    };

    const worker = new BrowserWorker({
      errorRecovery: mockRecovery
    });

    const job = {
      name: JOB_TYPES.RECOVER_APPLICATION,
      data: {
        jobId: 'job_fail_1',
        jobType: JOB_TYPES.RECOVER_APPLICATION,
        failureReason: 'Timeout on navigation'
      },
      updateProgress: jest.fn()
    };

    const result = await worker.processJob(job);
    expect(mockRecovery.diagnoseFailure).toHaveBeenCalledWith(
      'job_fail_1',
      'Timeout on navigation',
      []
    );
    expect(result.recommendation).toBe('Increase page timeout to 60s');
  });

  it('should throw error for unknown job type', async () => {
    const worker = new BrowserWorker({
      errorRecovery: { diagnoseFailure: jest.fn().mockResolvedValue({}) }
    });
    const job = {
      name: 'UNKNOWN_TYPE',
      data: { jobType: 'UNKNOWN_TYPE' },
      updateProgress: jest.fn()
    };

    await expect(worker.processJob(job)).rejects.toThrow('Unknown job type');
  });
});
