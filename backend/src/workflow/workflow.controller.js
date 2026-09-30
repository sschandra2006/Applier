import { Workflow } from './workflow.model.js';
import { startInterview } from '../interview/interview.service.js';
import { InterviewState } from '../interview/interview-state.model.js';
import { Conversation } from '../chat/conversation.model.js';
import { Message } from '../chat/message.model.js';
import crypto from 'crypto';
import { config } from '../config/env.js';
import { internalApi } from '../config/axios.js';
import { scanUrl } from '../automation/automation.service.js';

const PYTHON_API_URL = config.pythonApiUrl;

export const analyzeUrl = async (req, res, next) => {
  try {
    const { targetUrl, bypassCache, forceRescan } = req.body;
    const userId = req.user._id;

    if (!targetUrl) {
      return res.status(400).json({ success: false, error: 'Target URL is required' });
    }

    const urlHash = crypto.createHash('sha256').update(targetUrl).digest('hex');
    
    if (bypassCache || forceRescan) {
      await Workflow.deleteMany({ urlHash });
      console.log(`[Workflow Cache Cleared] Removed cached workflow for: ${targetUrl}`);
    }

    let scannedData = null;
    let workflow = await Workflow.findOne({ urlHash });
    // Valid = has pages with steps AND at least one step has a non-null id
    const hasValidSteps = workflow?.schemaDefinition?.pages?.some(p =>
      p.steps?.some(s => s.id && s.id.trim() !== '')
    );
    
    if (workflow && hasValidSteps) {
      console.log(`[Workflow Cache Hit] Reuse existing valid workflow for: ${targetUrl}`);
    } else {
      if (workflow && !hasValidSteps) {
        console.log(`[Workflow Cache Invalidated] Deleting outdated/empty cached workflow for: ${targetUrl}`);
        await Workflow.deleteOne({ _id: workflow._id });
      }
      console.log(`[Workflow Cache Miss] Scanning new URL via Node Automation Service: ${targetUrl}`);
      // 1. Scan DOM using Node.js Playwright (Automation Service)
      scannedData = await scanUrl(targetUrl);

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
        landingScreenshot: scannedData?.landingScreenshot || scannedData?.pages?.[0]?.screenshot || null,
        schemaDefinition: schema
      });
    }

    // 4. Start Interview Process — reuse existing IN_PROGRESS state if available
    console.log(`[Workflow] Starting AI Interview for Workflow: ${workflow._id}`);

    // Look for existing in-progress interview for this user+workflow
    const existingState = await InterviewState.findOne({
      userId,
      workflowId: workflow._id,
      status: 'IN_PROGRESS'
    });

    let state, conversation, firstMessage;

    if (existingState) {
      // Reuse existing state — find its conversation
      conversation = await Conversation.findOne({ 'metadata.interviewStateId': existingState._id, userId });
      if (!conversation) {
        // Conversation was lost — create a fresh one linked to existing state
        conversation = await Conversation.create({
          userId,
          title: `Interview: ${workflow.name}`,
          metadata: { interviewStateId: existingState._id }
        });
      }
      state = existingState;
      // Re-emit the next pending question
      const lastMsg = await Message.findOne({ conversationId: conversation._id, sender: 'AI' }).sort({ createdAt: -1 });
      firstMessage = lastMsg || { content: 'Welcome back! Let\'s continue your application.' };
      console.log(`[Workflow] Reusing existing InterviewState ${existingState._id} for user ${userId}`);
    } else {
      const result = await startInterview(userId, workflow._id);
      state = result.state;
      conversation = result.conversation;
      firstMessage = result.firstMessage;
    }

    const firstAiMessage = {
       sender: 'AI',
       content: firstMessage?.content || 'Hi, I have analyzed the application. I have a few questions for you before we submit.'
    };

    res.status(201).json({ 
      success: true, 
      data: {
        workflow,
        interviewStateId: state._id,
        conversationId: conversation._id,
        firstMessage: firstAiMessage,
        landingScreenshot: workflow.landingScreenshot || scannedData?.landingScreenshot || scannedData?.pages?.[0]?.screenshot || null
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
