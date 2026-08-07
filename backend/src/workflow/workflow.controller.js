import { Workflow } from './workflow.model.js';
import { startInterview } from '../interview/interview.service.js';
import crypto from 'crypto';
import { config } from '../config/env.js';
import { internalApi } from '../config/axios.js';
import { scanUrl } from '../automation/automation.service.js';

const PYTHON_API_URL = config.pythonApiUrl;

export const analyzeUrl = async (req, res, next) => {
  try {
    const { targetUrl } = req.body;
    const userId = req.user._id;

    if (!targetUrl) {
      return res.status(400).json({ success: false, error: 'Target URL is required' });
    }

    const urlHash = crypto.createHash('sha256').update(targetUrl).digest('hex');
    let workflow = await Workflow.findOne({ urlHash });
    
    if (workflow) {
      console.log(`[Workflow Cache Hit] Reuse existing workflow for: ${targetUrl}`);
    } else {
      console.log(`[Workflow Cache Miss] Scanning new URL via Node Automation Service: ${targetUrl}`);
      // 1. Scan DOM using Node.js Playwright (Automation Service)
      const scannedData = await scanUrl(targetUrl);

      // 2. Call Python AI Orchestrator to Plan Workflow
      console.log(`[Workflow] Planning workflow via AI Orchestrator for: ${targetUrl}`);
      const aiResponse = await internalApi.post(PYTHON_API_URL, {
        intent: 'plan_workflow',
        raw_data: scannedData
      }, {
        headers: { 'x-correlation-id': req.correlationId }
      });
      
      const aiData = aiResponse.data;
      if (!aiData.success) {
          throw new Error(`AI Orchestrator failed: ${aiData.error}`);
      }
      
      const schema = aiData.data?.schema || (aiData.data?.pages ? aiData.data : {});

      // 3. Save Workflow to MongoDB
      workflow = await Workflow.create({
        userId,
        name: schema.name || 'Generated Workflow',
        url: targetUrl,
        urlHash: urlHash,
        schemaDefinition: schema
      });
    }

    // 4. Start Interview Process
    console.log(`[Workflow] Starting AI Interview for Workflow: ${workflow._id}`);
    const { state, conversation } = await startInterview(userId, workflow._id);

    // Call AI Orchestrator to generate the first message based on the workflow
    const chatResponse = await internalApi.post(PYTHON_API_URL, {
        intent: 'continue_interview',
        workflow: workflow.schemaDefinition,
        conversation: conversation.messages || []
    });

    const firstAiMessage = {
       sender: 'AI',
       content: chatResponse.data.success ? chatResponse.data.data.message : 'Hi, I have analyzed the application. I have a few questions for you before we submit.'
    };

    res.status(201).json({ 
      success: true, 
      data: {
        workflow,
        interviewStateId: state._id,
        conversationId: conversation._id,
        firstMessage: firstAiMessage
      } 
    });
  } catch (error) {
    console.error('Workflow analysis error [Traceback]:', error.stack);
    
    let pythonErrorData = null;
    let pythonStatus = null;
    
    if (error.response) {
      pythonErrorData = error.response.data;
      pythonStatus = error.response.status;
      console.error('Python API Error Data:', JSON.stringify(pythonErrorData, null, 2));
    }
    
    // Instead of throwing a generic WORKFLOW_GENERATION_FAILED, we propagate the exact error details.
    // If the error was explicitly thrown by our own code, we use its message, else we format it.
    res.status(500).json({ 
      success: false, 
      error: 'WORKFLOW_GENERATION_FAILED', // Keeping the code for frontend compatibility, but attaching the original cause
      message: error.message,
      details: {
        originalError: error.message,
        originalStack: error.stack,
        module: 'workflow.controller.js',
        function: 'analyzeUrl',
        httpStatus: pythonStatus,
        responseBody: pythonErrorData,
      },
      requestId: req.id || 'N/A'
    });
  }
};
