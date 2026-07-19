import { generateAndSaveWorkflow } from './workflow.service.js';
import { Workflow } from './workflow.model.js';
import axios from 'axios';

import { config } from '../config/env.js';

const PYTHON_API_URL = config.pythonApiUrl;

export const generateWorkflow = async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, message: 'URL is required' });
    
    const workflow = await generateAndSaveWorkflow(url);
    res.status(201).json({ success: true, data: workflow });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getWorkflows = async (req, res) => {
  try {
    const workflows = await Workflow.find();
    res.status(200).json({ success: true, data: workflows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMarketplaceWorkflows = async (req, res) => {
  try {
    const workflows = await Workflow.find({ isPublic: true });
    // If empty, return some dummies for the marketplace UI
    if (workflows.length === 0) {
      return res.status(200).json({
        success: true,
        data: [
          { id: '1', name: 'Scholarship App', description: 'Apply for scholarship', category: 'Education', estimatedTime: '5m', successRate: '99%', url: 'https://example.com' }
        ]
      });
    }
    res.status(200).json({ success: true, data: workflows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
