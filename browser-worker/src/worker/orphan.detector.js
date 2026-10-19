/**
 * Orphan Job & Worker Crash Recovery Detector
 * Phase 2: Distributed Browser Worker Architecture
 *
 * Scans MongoDB for stalled jobs whose worker heartbeat has ceased,
 * recovering them or marking terminal failure without corrupting state.
 */

import { AutomationJob } from '../../../backend/src/automation/automation.model.js';
import { WORKER_STATUS } from '../../../backend/src/queue/queue.constants.js';
import { enqueueRecoverApplication, enqueueExecuteApplication } from '../../../backend/src/queue/automation.queue.js';
import { workerConfig } from '../config/env.js';

export class OrphanDetector {
  constructor(thresholdMs = workerConfig.stalledJobThresholdMs) {
    this.thresholdMs = thresholdMs;
    this.timer = null;
    this.isRunning = false;
  }

  start(intervalMs = 30000) {
    if (this.isRunning) return;
    this.isRunning = true;
    
    // Run initial scan on startup
    this.scanAndRecover().catch(() => {});

    this.timer = setInterval(() => {
      this.scanAndRecover().catch(() => {});
    }, intervalMs);
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Scans for stalled jobs without active heartbeats
   */
  async scanAndRecover() {
    const cutoff = new Date(Date.now() - this.thresholdMs);

    try {
      const stalledJobs = await AutomationJob.find({
        status: 'RUNNING',
        $or: [
          { lastHeartbeat: { $lt: cutoff } },
          { lastHeartbeat: null, updatedAt: { $lt: cutoff } }
        ]
      });

      for (const job of stalledJobs) {
        await this._recoverStalledJob(job);
      }
    } catch (_) {
      // MongoDB might not be connected in tests
    }
  }

  async _recoverStalledJob(job) {
    const nextAttempt = (job.attempt || 1) + 1;
    const maxAttempts = job.maxAttempts || 3;

    if (nextAttempt <= maxAttempts) {
      await AutomationJob.findByIdAndUpdate(job._id, {
        status: 'QUEUED',
        workerStatus: WORKER_STATUS.STALLED,
        attempt: nextAttempt,
        $push: {
          logs: {
            level: 'WARNING',
            message: `[CrashRecovery] Stalled job detected. Rescheduling attempt ${nextAttempt}/${maxAttempts} from step ${(job.currentStepIndex || 0) + 1}`
          }
        }
      });

      // Re-enqueue execution starting from the last persisted step index
      await enqueueExecuteApplication({
        jobId: job._id,
        applicationId: job.applicationId,
        userId: job.userId,
        targetUrl: job.executionPlan?.[0]?.url || '',
        steps: job.executionPlan || [],
        answers: {},
        startFromIndex: job.currentStepIndex || 0
      });
    } else {
      await AutomationJob.findByIdAndUpdate(job._id, {
        status: 'FAILED',
        workerStatus: WORKER_STATUS.FAILED,
        failureReason: 'WorkerCrashTimeout: Job stalled and exceeded maximum retry attempts',
        $push: {
          logs: {
            level: 'ERROR',
            message: '[CrashRecovery] Terminal failure: Job stalled and exceeded max recovery attempts'
          }
        }
      });
    }
  }
}

export const defaultOrphanDetector = new OrphanDetector();
export default defaultOrphanDetector;
