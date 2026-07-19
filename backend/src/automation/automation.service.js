import { InterviewState } from '../interview/interview-state.model.js';
import { Workflow } from '../workflow/workflow.model.js';
import { admin } from '../auth/firebase.js';
import { Application } from '../tracking/application.model.js';
import { sendNotification } from '../notifications/notifications.service.js';
import { User } from '../users/user.model.js';
import { AILearning } from '../ai-learning/ai-learning.model.js';
import axios from 'axios';

import { config } from '../config/env.js';

const bucket = admin.storage().bucket();
const PYTHON_API_URL = config.pythonApiUrl;

export const startAutomation = async (userId, interviewStateId) => {
  const state = await InterviewState.findById(interviewStateId);
  if (!state) throw new Error('InterviewState not found');
  if (state.status !== 'COMPLETED') throw new Error('Interview must be completed before automation can start');
  
  const workflow = await Workflow.findById(state.workflowId);
  if (!workflow) throw new Error('Workflow not found');
  
  const job = await AutomationJob.create({
    userId,
    interviewStateId,
    workflowId: state.workflowId,
    status: 'RUNNING',
    progress: { currentStep: 0, totalSteps: workflow.schemaDefinition.steps?.length || 1 }
  });
  
  // Trigger Python Execution asynchronously
  // We don't await this because it's a long-running process
  triggerPythonAutomation(job._id, state, workflow).catch(console.error);
  
  return job;
};

const triggerPythonAutomation = async (jobId, state, workflow) => {
  try {
    const payload = {
      jobId: jobId.toString(),
      targetUrl: workflow.url,
      schema: workflow.schemaDefinition,
      answers: Object.fromEntries(state.answers || new Map())
    };
    
    const res = await fetch(`${PYTHON_API_URL}/automation/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      await logJobError(jobId, 'Python API rejected the execution request');
    }
  } catch (error) {
    await logJobError(jobId, error.message);
  }
};

export const logJobError = async (jobId, message) => {
  await AutomationJob.findByIdAndUpdate(jobId, {
    status: 'FAILED',
    errorDetails: message,
    $push: { logs: { level: 'ERROR', message } }
  });
};

export const updateJobStatus = async (jobId, status, message, additionalData = {}) => {
  const job = await AutomationJob.findByIdAndUpdate(jobId, {
    status,
    $push: { logs: { level: 'INFO', message } }
  });

  if (status === 'COMPLETED' && job) {
    let receiptUrl = null;
    if (additionalData.base64Receipt) {
      const buffer = Buffer.from(additionalData.base64Receipt, 'base64');
      const fileName = `receipts/${job.userId}/${Date.now()}_receipt.png`;
      const fileRef = bucket.file(fileName);
      await fileRef.save(buffer, { metadata: { contentType: 'image/png' } });
      await fileRef.makePublic();
      receiptUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    }

    await Application.create({
      userId: job.userId,
      workflowId: job.workflowId,
      interviewStateId: job.interviewStateId,
      status: 'SUBMITTED',
      applicationNumber: additionalData.applicationNumber || `APP-${Date.now()}`,
      receiptUrl
    });

    const user = await User.findById(job.userId);
    await sendNotification(
      job.userId,
      'Application Submitted Successfully!',
      `Your application has been submitted. Reference: ${additionalData.applicationNumber || 'N/A'}`,
      'SUCCESS',
      { jobId: job._id },
      user?.email
    );
  } else if (status === 'PAUSED_OTP' && job) {
    const user = await User.findById(job.userId);
    await sendNotification(
      job.userId,
      'Action Required: OTP Needed',
      'The automation engine is paused and requires an OTP code to continue.',
      'ACTION_REQUIRED',
      { jobId: job._id },
      user?.email
    );
  } else if (status === 'FAILED' && job) {
    // TRIGGER PHASE 17 AI LEARNING
    try {
      const response = await axios.post(`${PYTHON_API_URL}/analyze-failure`, {
        logs: job.logs.slice(-20), // Send last 20 logs
        url: 'https://unknown-target.com' // Should fetch from workflow in real app
      });
      
      const insight = response.data;
      if (insight) {
        await AILearning.create({
          workflowId: job.workflowId,
          jobId: job._id,
          targetUrl: insight.targetUrl || 'Unknown',
          errorSignature: insight.rootCause.substring(0, 50),
          rawLogs: job.logs.slice(-5),
          insight: {
            rootCause: insight.rootCause,
            suggestedFix: insight.suggestedFix,
            confidence: insight.confidence,
            updatedSelector: insight.updatedSelector
          }
        });
      }
    } catch (error) {
      console.error('Failed to trigger AI Learning analyzer:', error.message);
    }
  }
};
