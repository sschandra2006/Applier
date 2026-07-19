import { AutomationJob } from './automation.model.js';
import { updateJobStatus, startAutomation } from './automation.service.js';
import { internalApi } from '../config/axios.js';
import { config } from '../config/env.js';

const PYTHON_API_URL = config.pythonApiUrl || 'http://localhost:8000/api/v1';

export const executeAutomationController = async (req, res, next) => {
  try {
    const { interviewStateId } = req.body;
    const userId = req.user._id;

    if (!interviewStateId) {
      return res.status(400).json({ success: false, error: 'interviewStateId is required' });
    }

    const job = await startAutomation(userId, interviewStateId);

    res.status(201).json({ success: true, data: job });
  } catch (error) {
    next(error);
  }
};

export const resumeAutomationController = async (req, res, next) => {
  try {
    const { jobId, answers, state, workflow } = req.body;

    await AutomationJob.findByIdAndUpdate(jobId, { status: 'RUNNING' });

    internalApi.post(`${PYTHON_API_URL}/automation/resume`, {
      stateId: state._id,
      answers: Object.fromEntries(state.answers || new Map()),
      workflowUrl: workflow.url
    }, {
      headers: { 'x-correlation-id': req.correlationId }
    }).catch(err => {
      console.error('Failed to resume automation:', err);
    });

    res.status(200).json({ success: true, message: 'Resumed successfully' });
  } catch (error) {
    next(error);
  }
};

// Webhook for Python to update status
export const statusWebhookController = async (req, res, next) => {
  try {
    const { jobId, status, message, additionalData } = req.body;
    
    // Normalize status names from python if needed
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

    res.status(200).json({ success: true, data: job });
  } catch (error) {
    next(error);
  }
};
