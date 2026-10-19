/**
 * End-to-End Distributed Worker Integration Test
 * Phase 2: Distributed Browser Worker Architecture
 *
 * Verifies full round-trip:
 * API (Enqueue)
 *   → Queue (BullMQ / InMemory)
 *   → Worker (BrowserWorker)
 *   → Playwright (Headless Chromium execution)
 *   → Completion (Receipt screenshot & success)
 */

import { resetInMemoryQueues } from '../src/queue/queue.provider.js';
import { enqueueExecuteApplication, getAutomationQueue } from '../src/queue/automation.queue.js';
import { BrowserWorker } from '../../browser-worker/src/worker/browser.worker.js';
import { defaultBrowserManager } from '../../browser-worker/src/engine/browser.manager.js';

describe('7. End-to-End Worker Integration Test (API -> Queue -> Worker -> Playwright -> Done)', () => {
  let worker;

  beforeEach(() => {
    resetInMemoryQueues();
    worker = new BrowserWorker();
    worker.start();
  });

  afterEach(async () => {
    if (worker) {
      await worker.stop();
    }
    await defaultBrowserManager.cleanupAllBrowsers();
    resetInMemoryQueues();
  });

  it('should execute a multi-step form workflow in Playwright via queue and complete successfully', async () => {
    // Self-contained data URL requiring no external network connectivity
    const htmlPage = `data:text/html,<!DOCTYPE html><html><head><title>Scholarship Test Portal</title></head><body>
      <h1>National Application Portal</h1>
      <form id="appForm">
        <label for="txtName">Candidate Full Name:</label>
        <input id="txtName" type="text" />
        <button id="btnSubmit" type="button" onclick="document.body.style.backgroundColor='lightgreen';">Submit Form</button>
      </form>
    </body></html>`;

    const steps = [
      {
        stepIndex: 0,
        type: 'navigate',
        url: htmlPage,
        description: 'Navigate to application form'
      },
      {
        stepIndex: 1,
        type: 'fill',
        selector: '#txtName',
        field: 'candidateName',
        description: 'Fill candidate name'
      },
      {
        stepIndex: 2,
        type: 'click',
        selector: '#btnSubmit',
        description: 'Click submit button'
      },
      {
        stepIndex: 3,
        type: 'screenshot',
        description: 'Capture submission receipt'
      }
    ];

    const answers = {
      candidateName: 'Dr. Maria Curie'
    };

    // 1. API layer enqueues EXECUTE_APPLICATION
    const { job } = await enqueueExecuteApplication({
      jobId: 'integ_test_job_888',
      applicationId: 'app_rec_888',
      userId: 'user_test_888',
      targetUrl: htmlPage,
      steps,
      answers,
      startFromIndex: 0
    });

    expect(job).toBeDefined();

    // 2. Await worker processing completion
    const queue = getAutomationQueue();
    const result = await new Promise((resolve, reject) => {
      const timeoutTimer = setTimeout(() => {
        reject(new Error('Integration test timed out waiting for worker'));
      }, 30000);

      const checkInterval = setInterval(async () => {
        const currentJob = await queue.getJob(job.id);
        if (currentJob?.finishedOn) {
          clearTimeout(timeoutTimer);
          clearInterval(checkInterval);
          if (currentJob.failedReason) {
            reject(new Error(currentJob.failedReason));
          } else {
            resolve(currentJob.returnvalue);
          }
        }
      }, 200);
    });

    // 3. Verify Playwright execution completed
    expect(result).toBeDefined();
    expect(result.status).toBe('COMPLETED');
    expect(result.finalReceipt).toBeDefined();
    expect(typeof result.finalReceipt).toBe('string');
    expect(result.finalReceipt.length).toBeGreaterThan(100);

    // 4. Verify browser process cleanup
    expect(defaultBrowserManager.getActiveCount()).toBe(0);
  }, 45000);
});
