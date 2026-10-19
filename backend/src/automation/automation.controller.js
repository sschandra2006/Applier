import { AutomationJob } from './automation.model.js';
import { updateJobStatus, startAutomation, saveAndStartPlan, resumePlan } from './automation.service.js';
import { internalApi } from '../config/axios.js';
import { config } from '../config/env.js';
import { validateExecutionPlan } from '../../../shared/src/index.js';
import { defaultApplicationReviewService } from '../review/index.js';
import { defaultAutomationEventService } from '../events/index.js';
import { defaultJobAuthorizationService } from '../security/index.js';

export const executeAutomationController = async (req, res, next) => {
  try {
    const { interviewStateId, bypassPolicy } = req.body;
    const userId = req.user._id;

    if (!interviewStateId) {
      return res.status(400).json({ success: false, error: 'interviewStateId is required' });
    }

    if (!bypassPolicy) {
      const lockCheck = await defaultApplicationReviewService.verifySubmissionLock({
        interviewStateId
      });

      if (!lockCheck.allowed) {
        return res.status(403).json({
          success: false,
          error: lockCheck.message || 'Application cannot be executed without explicit user confirmation.',
          violation: lockCheck.reason
        });
      }
    }

    const job = await startAutomation(userId, interviewStateId);

    res.status(201).json({ success: true, data: job });
  } catch (error) {
    next(error);
  }
};

export const resumeAutomationController = async (req, res, next) => {
  try {
    const { jobId, answers, otp, captcha, userInput } = req.body;

    if (!jobId) {
      return res.status(400).json({ success: false, error: 'jobId is required' });
    }

    const job = await AutomationJob.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    if (req.user) {
      defaultJobAuthorizationService.authorizeJobAccess(req.user, job);
    }

    const inputData = userInput || answers || { otp, captcha };
    const updatedJob = await resumePlan(jobId, inputData);

    res.status(200).json({ success: true, message: 'Automation resumed successfully', data: updatedJob });
  } catch (error) {
    next(error);
  }
};

// Webhook for Python AI ExecutionPlanner to send execution plan
export const webhookReceivePlanController = async (req, res, next) => {
  try {
    const { jobId, stateId, plan } = req.body;

    if (!jobId || !plan) {
      return res.status(400).json({ success: false, error: 'jobId and plan are required' });
    }

    // Canonical Boundary Validation
    const validation = validateExecutionPlan(plan);
    if (!validation.valid) {
      const details = validation.errors.map(e => `${e.instancePath || 'root'}: ${e.message}`).join(', ');
      return res.status(400).json({
        success: false,
        error: `INVALID_CANONICAL_PLAN: ${details}`,
        details: validation.errors
      });
    }

    const job = await saveAndStartPlan(jobId, plan);

    res.status(200).json({ success: true, message: 'Execution plan received and started', data: job });
  } catch (error) {
    next(error);
  }
};

// Webhook for Python to update status
export const statusWebhookController = async (req, res, next) => {
  try {
    const { jobId, status, message, additionalData } = req.body;
    
    let normalizedStatus = status;
    if (status === 'PAUSED_FOR_USER_INPUT') normalizedStatus = 'PAUSED_OTP';

    await updateJobStatus(jobId, normalizedStatus, message, additionalData);

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const getStatusController = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const job = await AutomationJob.findById(jobId);
    
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    if (req.user) {
      defaultJobAuthorizationService.authorizeJobAccess(req.user, job);
    }

    res.status(200).json({ success: true, data: job });
  } catch (error) {
    next(error);
  }
};

export const streamJobEventsController = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    if (!jobId) {
      return res.status(400).json({ success: false, error: 'jobId is required' });
    }

    const job = await AutomationJob.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    if (req.user) {
      defaultJobAuthorizationService.authorizeJobAccess(req.user, job);
    }

    defaultAutomationEventService.subscribe(jobId, req, res);
  } catch (error) {
    next(error);
  }
};
