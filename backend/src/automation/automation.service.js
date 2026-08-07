import { chromium } from 'playwright';
import { AutomationJob } from './automation.model.js';
import { AILearning } from '../ai-learning/ai-learning.model.js';
import axios from 'axios';
import { config } from '../config/env.js';
import { internalApi } from '../config/axios.js';
import { admin } from '../auth/firebase.js';
import { Application } from '../tracking/application.model.js';
import { sendNotification } from '../notifications/notifications.service.js';
import { User } from '../users/user.model.js';
import { InterviewState } from '../interview/interview-state.model.js';
import { DocumentProcessingEngine } from '../documents/document.engine.js';

export const startAutomation = async (userId, interviewStateId) => {
    const state = await InterviewState.findById(interviewStateId).populate('workflowId');
    if (!state) throw new Error('InterviewState not found');
    
    const job = new AutomationJob({
        userId,
        interviewStateId,
        workflowId: state.workflowId._id,
        status: 'QUEUED'
    });
    
    await job.save();
    
    internalApi.post(config.pythonApiUrl, {
        intent: 'plan_execution',
        raw_data: {
            jobId: job._id,
            stateId: state._id,
            answers: Object.fromEntries(state.answers || new Map()),
            workflowUrl: state.workflowId.url
        },
        workflow: state.workflowId.schemaDefinition || {}
    }).catch(err => {
        console.error('Failed to trigger python start automation:', err.message);
    });
    
    return job;
};

export const scanUrl = async (url) => {
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
    } catch (error) {
        throw new Error(`BrowserInitializationError: Failed to launch Chromium. ${error.message}`);
    }
    
    let page;
    try {
        const context = await browser.newContext();
        page = await context.newPage();
    } catch (error) {
        await browser.close();
        throw new Error(`BrowserInitializationError: Failed to create page context. ${error.message}`);
    }

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        try {
            await page.waitForLoadState('networkidle', { timeout: 10000 });
        } catch (e) {
            // Soft fallback if networkidle times out due to persistent background requests
        }
        const html = await page.content();
        const title = await page.title();
        const screenshot = await page.screenshot({ fullPage: true });
        return {
            url,
            title,
            html,
            screenshot: screenshot.toString('base64')
        };
    } catch (error) {
        throw new Error(`ApplicationAnalysisFailed: Failed to navigate and scan URL ${url}. ${error.message}`);
    } finally {
        if (browser) await browser.close();
    }
};

export const saveAndStartPlan = async (jobId, plan) => {
    const job = await AutomationJob.findById(jobId);
    if (!job) throw new Error(`AutomationJob ${jobId} not found`);

    const steps = plan.steps || [];
    const targetUrl = plan.targetUrl;

    job.executionPlan = steps;
    job.progress.totalSteps = steps.length;
    job.progress.currentStep = 0;
    job.currentStepIndex = 0;
    job.status = 'RUNNING';
    await job.save();

    const state = await InterviewState.findById(job.interviewStateId);
    const answers = state ? Object.fromEntries(state.answers || new Map()) : {};

    // Execute plan asynchronously
    executePlan(jobId, targetUrl, steps, answers, 0).catch(err => {
        console.error(`[AutomationEngine] Execution error for job ${jobId}:`, err);
    });

    return job;
};

export const executePlan = async (jobId, targetUrl, steps, answers, startFromIndex = 0) => {
    const job = await AutomationJob.findById(jobId);
    if (!job) return;
    
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
        await updateJobStatus(jobId, 'RUNNING', `Starting execution from step ${startFromIndex + 1}/${steps.length}`);
        
        for (let i = startFromIndex; i < steps.length; i++) {
            const step = steps[i];
            
            // Persist step index
            await AutomationJob.findByIdAndUpdate(jobId, {
                currentStepIndex: i,
                'progress.currentStep': i + 1,
                'progress.totalSteps': steps.length
            });

            await updateJobStatus(jobId, 'RUNNING', `Step ${i + 1}/${steps.length}: ${step.description || step.type}`);
            
            if (step.type === 'navigate') {
                await page.goto(step.url || targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                try {
                    await page.waitForLoadState('networkidle', { timeout: 10000 });
                } catch (e) {
                    // Soft fallback
                }
            } else if (step.type === 'fill') {
                const value = answers[step.field] || step.value;
                if (value && step.selector) {
                    await page.fill(step.selector, String(value));
                }
            } else if (step.type === 'click') {
                if (step.selector) {
                    await page.click(step.selector);
                }
            } else if (step.type === 'select') {
                const value = answers[step.field] || step.value;
                if (value && step.selector) {
                    await page.selectOption(step.selector, String(value));
                }
            } else if (step.type === 'upload') {
                const documentUrl = answers[step.field];
                if (documentUrl && step.selector) {
                    await updateJobStatus(jobId, 'RUNNING', `Preparing document upload for field: ${step.field}...`);
                    
                    const docResponse = await fetch(documentUrl);
                    if (!docResponse.ok) throw new Error(`Failed to download document from ${documentUrl}`);
                    
                    const arrayBuffer = await docResponse.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    const mimeType = docResponse.headers.get('content-type') || 'application/octet-stream';
                    
                    const constraints = step.constraints || {}; 
                    const processedDoc = await DocumentProcessingEngine.prepareDocument(buffer, mimeType, constraints);
                    const tempFilePath = await DocumentProcessingEngine.writeToTempFile(processedDoc.buffer, processedDoc.extension);
                    
                    await updateJobStatus(jobId, 'RUNNING', `Uploading document for field: ${step.field}`);
                    await page.setInputFiles(step.selector, tempFilePath);
                }
            } else if (step.type === 'pause') {
                const pauseStatus = step.pauseReason === 'CAPTCHA' ? 'PAUSED_CAPTCHA' : 'PAUSED_OTP';
                await updateJobStatus(jobId, pauseStatus, `Paused for user input (${step.pauseReason || 'OTP/CAPTCHA'}). Field: ${step.field || 'verification'}`);
                return; // Stop execution loop; waiting for user resume
            } else if (step.type === 'screenshot') {
                const screenshotBuf = await page.screenshot({ fullPage: true });
                const base64Screenshot = screenshotBuf.toString('base64');
                await updateJobStatus(jobId, 'RUNNING', 'Captured application page state', { base64Receipt: base64Screenshot });
            }

            const waitTime = step.waitAfterMs || 500;
            await page.waitForTimeout(waitTime);
        }
        
        await updateJobStatus(jobId, 'COMPLETED', 'Execution finished successfully!');
    } catch (error) {
        await logJobError(jobId, error.message);
    } finally {
        await browser.close();
    }
};

export const resumePlan = async (jobId, userInput = {}) => {
    const job = await AutomationJob.findById(jobId);
    if (!job) throw new Error(`AutomationJob ${jobId} not found`);

    const state = await InterviewState.findById(job.interviewStateId);
    if (state && state.answers) {
        // Merge user input (e.g. OTP, captcha) into state answers
        for (const [key, value] of Object.entries(userInput)) {
            if (value) state.answers.set(key, value);
        }
        await state.save();
    }

    const answers = state ? Object.fromEntries(state.answers || new Map()) : {};
    const steps = job.executionPlan || [];
    const nextStepIndex = (job.currentStepIndex || 0) + 1;

    await updateJobStatus(jobId, 'RUNNING', `Resuming execution from step ${nextStepIndex + 1}/${steps.length}`);

    const workflow = await InterviewState.findById(job.interviewStateId).populate('workflowId');
    const targetUrl = workflow?.workflowId?.url || '';

    // Execute remaining steps asynchronously
    executePlan(jobId, targetUrl, steps, answers, nextStepIndex).catch(err => {
        console.error(`[AutomationEngine] Resume execution error for job ${jobId}:`, err);
    });

    return job;
};

export const updateJobStatus = async (jobId, status, message, additionalData = {}) => {
  const job = await AutomationJob.findByIdAndUpdate(jobId, {
    status,
    $push: { 
        logs: { 
            level: status === 'FAILED' ? 'ERROR' : 'INFO', 
            message,
            additionalData 
        } 
    }
  }, { new: true });
  return job;
};

export const logJobError = async (jobId, message) => {
  const job = await AutomationJob.findByIdAndUpdate(jobId, {
    status: 'FAILED',
    errorDetails: message,
    $push: { logs: { level: 'ERROR', message } }
  });
  
  try {
     const response = await internalApi.post(config.pythonApiUrl, {
        intent: 'recover_error',
        raw_data: { logs: job.logs.map(l => l.message), message, targetUrl: "unknown" }
     });
     
     if (response.data && response.data.success) {
         console.log("AI Recovered Insight:", response.data.data);
     }
  } catch (err) {
      console.error("Failed to call AI Orchestrator for recovery", err.message);
  }
};
