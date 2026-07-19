import { Workflow } from './workflow.model.js';
import { startInterview } from '../interview/interview.service.js';
import crypto from 'crypto';
import { config } from '../config/env.js';
import { internalApi } from '../config/axios.js';

const PYTHON_API_URL = config.pythonApiUrl || 'http://localhost:8000/api/v1';

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
      console.log(`[Workflow Cache Miss] Scanning new URL: ${targetUrl}`);
      // 1. Call Python Scanner
      const scanResponse = await internalApi.post(`${PYTHON_API_URL}/scanner/scan`, { url: targetUrl }, {
        headers: { 'x-correlation-id': req.correlationId }
      });
      const scannedData = scanResponse.data.data;

      // 2. Call Python Workflow Generator
      console.log(`[Workflow] Generating workflow schema for: ${targetUrl}`);
      const genResponse = await internalApi.post(`${PYTHON_API_URL}/workflow/generate`, { form_data: scannedData }, {
        headers: { 'x-correlation-id': req.correlationId }
      });
      const schema = genResponse.data.schema;

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

    // Get the first AI message from the conversation history
    const firstAiMessage = {
       sender: 'AI',
       content: 'Hi, I have analyzed the application. I have a few questions for you before we submit.'
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
    if (error.response) {
      console.error('Python API Error Data:', JSON.stringify(error.response.data, null, 2));
    }
    
    // Provide a structured, safe error payload to the frontend
    res.status(500).json({ 
      success: false, 
      error: 'WORKFLOW_GENERATION_FAILED',
      message: 'An error occurred while generating the workflow.',
      details: error.response?.data?.detail || error.message,
      requestId: req.id || 'N/A'
    });
  }
};
