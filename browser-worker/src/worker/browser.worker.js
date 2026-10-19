/**
 * Distributed Playwright Browser Worker
 * Phase 2: Distributed Browser Worker Architecture
 *
 * Processes jobs off the BullMQ queue outside of the Express event loop.
 */

import mongoose from 'mongoose';
import { createWorker } from '../../../backend/src/queue/queue.provider.js';
import {
  AUTOMATION_QUEUE_NAME,
  JOB_TYPES,
  WORKER_STATUS
} from '../../../backend/src/queue/queue.constants.js';
import { defaultBrowserManager } from '../engine/browser.manager.js';
import { defaultPortalScanner } from '../engine/portal.scanner.js';
import { defaultPlanExecutor } from '../engine/plan.executor.js';
import { defaultErrorRecovery } from '../engine/error.recovery.js';
import { defaultDurableResumptionEngine, isSecretField } from '../../execution/index.js';
import { AutomationJob } from '../../../backend/src/automation/automation.model.js';
import { InterviewState } from '../../../backend/src/interview/interview-state.model.js';
import { workerConfig } from '../config/env.js';

export class BrowserWorker {
  constructor(options = {}) {
    this.workerId = options.workerId || workerConfig.workerId;
    this.concurrency = options.concurrency || workerConfig.concurrency;
    this.browserManager = options.browserManager || defaultBrowserManager;
    this.portalScanner = options.portalScanner || defaultPortalScanner;
    this.planExecutor = options.planExecutor || defaultPlanExecutor;
    this.errorRecovery = options.errorRecovery || defaultErrorRecovery;
    this.resumptionEngine = options.resumptionEngine || defaultDurableResumptionEngine;
    this.worker = null;
    this.isStarted = false;
  }

  start() {
    if (this.isStarted) return;
    this.isStarted = true;

    this.worker = createWorker(
      AUTOMATION_QUEUE_NAME,
      async (job) => this.processJob(job),
      { concurrency: this.concurrency }
    );

    this.worker.on('error', (err) => {
      console.warn(`[BrowserWorker] Queue connection warning: ${err.message}. (Ensure Redis is running on port 6379, or run via Docker)`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[BrowserWorker] Job ${job?.id} failed:`, err.message);
    });

    return this.worker;
  }

  async stop() {
    this.isStarted = false;
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    await this.browserManager.cleanupAllBrowsers();
  }

  /**
   * Main job processor routing to corresponding engine execution
   */
  async processJob(job) {
    const jobType = job.name || job.data.jobType;
    const { jobId } = job.data;

    // Heartbeat & status updater callbacks
    const onHeartbeat = async (id) => {
      try {
        if (id && mongoose.Types.ObjectId.isValid(id)) {
          await AutomationJob.findByIdAndUpdate(id, {
            lastHeartbeat: new Date(),
            workerStatus: WORKER_STATUS.RUNNING,
            workerId: this.workerId
          });
        }
      } catch (_) {}
    };

    const onProgress = async (id, progressData) => {
      try {
        if (id && mongoose.Types.ObjectId.isValid(id)) {
          await AutomationJob.findByIdAndUpdate(id, {
            currentStepIndex: progressData.currentStepIndex,
            'progress.currentStep': progressData.currentStep,
            'progress.totalSteps': progressData.totalSteps
          });
        }
        await job.updateProgress(progressData.currentStep);
      } catch (_) {}
    };

    const onStatusUpdate = async (id, status, message, extra = {}) => {
      try {
        if (id && mongoose.Types.ObjectId.isValid(id)) {
          await AutomationJob.findByIdAndUpdate(id, {
            status,
            ...(extra.workerStatus ? { workerStatus: extra.workerStatus } : {}),
            ...(extra.workerId ? { workerId: extra.workerId } : {}),
            $push: {
              logs: {
                timestamp: new Date(),
                level: status === 'FAILED' ? 'ERROR' : 'INFO',
                message,
                additionalData: extra
              }
            }
          });
        }
      } catch (_) {}
    };

    const onPause = async (id, pauseStatus, pauseContext, extra = {}) => {
      try {
        if (id && mongoose.Types.ObjectId.isValid(id)) {
          await AutomationJob.findByIdAndUpdate(id, {
            status: pauseStatus,
            workerStatus: WORKER_STATUS.IDLE,
            pauseContext
          });
        }
        await onStatusUpdate(
          id,
          pauseStatus,
          `Paused: ${pauseContext.pauseReason} required for field "${pauseContext.fieldName}". Awaiting user input.`,
          extra
        );
      } catch (_) {}
    };

    try {
      if (jobId) {
        await onHeartbeat(jobId);
      }

      switch (jobType) {
        case JOB_TYPES.SCAN_PORTAL: {
          const { targetUrl, options } = job.data;
          const scanResult = await this.portalScanner.scan(targetUrl, options);
          return scanResult;
        }

        case JOB_TYPES.EXECUTE_APPLICATION: {
          const { targetUrl, steps, answers, startFromIndex = 0 } = job.data;

          // Hydrate answers from MongoDB if needed
          let executionAnswers = { ...answers };
          if (jobId && mongoose.Types.ObjectId.isValid(jobId) && Object.keys(executionAnswers).length === 0) {
            try {
              const currentJob = await AutomationJob.findById(jobId);
              if (currentJob?.interviewStateId) {
                const state = await InterviewState.findById(currentJob.interviewStateId);
                if (state?.answers) {
                  executionAnswers = Object.fromEntries(state.answers);
                }
              }
            } catch (_) {}
          }

          const result = await this.planExecutor.execute({
            jobId,
            targetUrl,
            steps,
            answers: executionAnswers,
            startFromIndex,
            workerId: this.workerId,
            onProgress,
            onStatusUpdate,
            onPause,
            onHeartbeat
          });

          return result;
        }

        case JOB_TYPES.RESUME_APPLICATION: {
          const { userInput = {} } = job.data;
          let dbJob = null;
          if (jobId && mongoose.Types.ObjectId.isValid(jobId)) {
            dbJob = await AutomationJob.findById(jobId);
          }
          if (!dbJob && jobId && mongoose.Types.ObjectId.isValid(jobId)) throw new Error(`AutomationJob ${jobId} not found`);

          let updatedAnswers = {};

          if (dbJob) {
            const state = await InterviewState.findById(dbJob.interviewStateId);
            if (state && state.answers) {
              // Only persist non-secret fields permanently; OTP, CAPTCHA, and secrets remain transient
              for (const [key, value] of Object.entries(userInput)) {
                if (value && !isSecretField(key)) state.answers.set(key, value);
              }
              state.markModified('answers');
              await state.save();
            }

            updatedAnswers = state ? Object.fromEntries(state.answers || new Map()) : {};
          }

          await onStatusUpdate(jobId, 'RUNNING', 'Resuming execution via DurableResumptionEngine...');

          const resumeResult = await this.resumptionEngine.resume({
            jobId,
            applicationId: dbJob?.applicationId,
            userInput,
            executionPlan: dbJob?.executionPlan,
            answers: updatedAnswers,
            onProgress,
            onStatusUpdate,
            onPause,
            onHeartbeat
          });

          return resumeResult;
        }

        case JOB_TYPES.RECOVER_APPLICATION: {
          const { failureReason } = job.data;
          let dbJob = null;
          if (jobId && mongoose.Types.ObjectId.isValid(jobId)) {
            dbJob = await AutomationJob.findById(jobId);
          }
          const diagnosis = await this.errorRecovery.diagnoseFailure(
            jobId,
            failureReason || 'Worker crash recovery',
            dbJob?.logs || []
          );

          if (jobId) {
            await onStatusUpdate(
              jobId,
              dbJob?.status || 'FAILED',
              `AI Diagnosis: ${diagnosis.recommendation}`
            );
          }

          return diagnosis;
        }

        default:
          throw new Error(`Unknown job type: "${jobType}"`);
      }
    } catch (err) {
      if (jobId && mongoose.Types.ObjectId.isValid(jobId)) {
        await onStatusUpdate(jobId, 'FAILED', `Execution failed: ${err.message}`, {
          workerStatus: WORKER_STATUS.FAILED,
          failureReason: err.message
        });

        // Trigger AI Diagnosis in background
        this.errorRecovery.diagnoseFailure(jobId, err.message).catch(() => {});
      }
      throw err;
    } finally {
      // Ensure cleanup of any dangling browsers from this job
      await this.browserManager.cleanupAllBrowsers().catch(() => {});
    }
  }
}

export const defaultBrowserWorker = new BrowserWorker();
export default defaultBrowserWorker;
