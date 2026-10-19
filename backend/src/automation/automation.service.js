/**
 * Automation Service (API Queue Producer & Model Coordinator)
 * Phase 2: Distributed Browser Worker Architecture
 *
 * Express controllers call this service to create jobs and enqueue them
 * to the BullMQ Browser Worker queue. Long-running Playwright executions
 * NO LONGER run inside the Express process.
 */

import { AutomationJob } from './automation.model.js';
import { InterviewState } from '../interview/interview-state.model.js';
import { internalApi } from '../config/axios.js';
import { config } from '../config/env.js';
import {
  enqueueScanPortalAndAwait,
  enqueueExecuteApplication,
  enqueueResumeApplication
} from '../queue/automation.queue.js';
import { defaultPortalScanner } from '../../../browser-worker/src/engine/portal.scanner.js';
import { selectOptionRobust, defaultPlanExecutor } from '../../../browser-worker/src/engine/plan.executor.js';
import { isSecretField } from '../../../browser-worker/execution/secret-sanitizer.js';
import { AutomationEventType } from '../../../shared/src/index.js';
import { defaultAutomationEventService } from '../events/index.js';

export { selectOptionRobust };

/**
 * Initiates an automation job and asks AI ExecutionPlanner to build a plan
 */
export const startAutomation = async (userId, interviewStateId) => {
  const state = await InterviewState.findById(interviewStateId).populate('workflowId');
  if (!state) throw new Error('InterviewState not found');

  const job = new AutomationJob({
    userId,
    interviewStateId,
    workflowId: state.workflowId._id,
    status: 'QUEUED',
    workerStatus: 'IDLE'
  });

  await job.save();

  internalApi
    .post(config.pythonApiUrl, {
      intent: 'plan_execution',
      raw_data: {
        jobId: job._id,
        stateId: state._id,
        answers: Object.fromEntries(state.answers || new Map()),
        workflowUrl: state.workflowId.url
      },
      workflow: state.workflowId.schemaDefinition || {}
    })
    .catch((err) => {
      console.error('Failed to trigger python start automation:', err.message);
    });

  try {
    defaultAutomationEventService.emitEvent({
      jobId: job._id,
      eventType: AutomationEventType.JOB_CREATED,
      applicationId: job.applicationId,
      payload: {
        status: job.status,
        interviewStateId: state._id,
        workflowId: state.workflowId._id
      }
    });
  } catch (_) {}

  return job;
};

/**
 * Scans a target portal URL via the distributed Browser Worker queue.
 * Express delegates crawling to the worker and awaits the extracted DOM/screenshots.
 */
export const scanUrl = async (url, options = {}) => {
  try {
    return await enqueueScanPortalAndAwait({ targetUrl: url, options });
  } catch (queueErr) {
    // If worker queue is offline or in direct test execution, fall back to scanner engine
    console.warn(`[AutomationService] Queue scan delegating directly to scanner: ${queueErr.message}`);
    return await defaultPortalScanner.scan(url, options);
  }
};

/**
 * Saves execution plan received from AI and enqueues it to the Browser Worker
 */
export const saveAndStartPlan = async (jobId, plan) => {
  const job = await AutomationJob.findById(jobId);
  if (!job) throw new Error(`AutomationJob ${jobId} not found`);

  const steps = plan.steps || [];
  const targetUrl = plan.targetUrl;

  job.executionPlan = steps;
  job.progress.totalSteps = steps.length;
  job.progress.currentStep = 0;
  job.currentStepIndex = 0;
  job.status = 'QUEUED';
  job.workerStatus = 'IDLE';
  await job.save();

  const state = await InterviewState.findById(job.interviewStateId);
  const answers = state ? Object.fromEntries(state.answers || new Map()) : {};

  // Enqueue job to BullMQ Browser Worker
  await enqueueExecuteApplication({
    jobId,
    applicationId: job.applicationId,
    userId: job.userId,
    targetUrl,
    steps,
    answers,
    startFromIndex: 0
  });

  try {
    defaultAutomationEventService.emitEvent({
      jobId,
      eventType: AutomationEventType.JOB_STARTED,
      applicationId: job.applicationId,
      payload: {
        totalSteps: steps.length,
        targetUrl
      }
    });
  } catch (_) {}

  return job;
};

/**
 * Resumes a paused automation job after user provides OTP / CAPTCHA input
 */
export const resumePlan = async (jobId, userInput = {}) => {
  const job = await AutomationJob.findById(jobId);
  if (!job) throw new Error(`AutomationJob ${jobId} not found`);

  const state = await InterviewState.findById(job.interviewStateId);
  if (state && state.answers) {
    // Only persist non-secret fields permanently; OTP, CAPTCHA, and secrets remain transient
    for (const [key, value] of Object.entries(userInput)) {
      if (value && !isSecretField(key)) {
        state.answers.set(key, value);
      }
    }
    state.markModified('answers');
    await state.save();
  }

  await updateJobStatus(jobId, 'QUEUED', 'User provided input, enqueued resumption...');

  await enqueueResumeApplication({
    jobId,
    applicationId: job.applicationId,
    userId: job.userId,
    userInput
  });

  return job;
};

/**
 * Direct execution facade (delegates to BullMQ or PlanExecutor engine)
 */
export const executePlan = async (jobId, targetUrl, steps, answers, startFromIndex = 0) => {
  try {
    await enqueueExecuteApplication({
      jobId,
      targetUrl,
      steps,
      answers,
      startFromIndex
    });
  } catch (err) {
    // Direct fallback
    return await defaultPlanExecutor.execute({
      jobId,
      targetUrl,
      steps,
      answers,
      startFromIndex,
      onStatusUpdate: updateJobStatus
    });
  }
};

/**
 * Updates status and logs in MongoDB
 */
export const updateJobStatus = async (jobId, status, message, additionalData = {}) => {
  const job = await AutomationJob.findByIdAndUpdate(
    jobId,
    {
      status,
      $push: {
        logs: {
          level: status === 'FAILED' ? 'ERROR' : 'INFO',
          message,
          additionalData
        }
      }
    },
    { returnDocument: 'after' }
  );

  try {
    let eventType = null;
    if (status === 'RUNNING') eventType = AutomationEventType.JOB_STARTED;
    else if (status === 'COMPLETED') eventType = AutomationEventType.JOB_COMPLETED;
    else if (status === 'FAILED') eventType = AutomationEventType.JOB_FAILED;
    else if (status === 'PAUSED_OTP' || status === 'PAUSED_CAPTCHA' || status === 'PAUSED_PAYMENT') {
      eventType = AutomationEventType.USER_INPUT_REQUIRED;
    }

    if (eventType) {
      defaultAutomationEventService.emitEvent({
        jobId,
        eventType,
        applicationId: job?.applicationId,
        payload: {
          status,
          message,
          additionalData,
          pauseContext: job?.pauseContext || null
        }
      });
    }
  } catch (_) {}

  return job;
};

/**
 * Records error details and triggers AI recovery insight
 */
export const logJobError = async (jobId, message) => {
  const job = await AutomationJob.findByIdAndUpdate(
    jobId,
    {
      status: 'FAILED',
      failureReason: message,
      errorDetails: message,
      $push: { logs: { level: 'ERROR', message } }
    },
    { returnDocument: 'after' }
  );

  try {
    const response = await internalApi.post(config.pythonApiUrl, {
      intent: 'recover_error',
      raw_data: { logs: job.logs.map((l) => l.message), message, targetUrl: 'unknown' }
    });

    if (response.data && response.data.success) {
      console.log('AI Recovered Insight:', response.data.data);
    }
  } catch (err) {
    console.error('Failed to call AI Orchestrator for recovery', err.message);
  }
};

export default {
  startAutomation,
  scanUrl,
  saveAndStartPlan,
  resumePlan,
  executePlan,
  updateJobStatus,
  logJobError,
  selectOptionRobust
};
