import { Workflow } from './workflow.model.js';
import { Service } from './service.model.js';

import { config } from '../config/env.js';

const PYTHON_API_URL = config.pythonApiUrl;

export const generateAndSaveWorkflow = async (url) => {
  try {
    // 1. Call Python Scanner
    console.log(`Scanning URL: ${url}`);
    const scanRes = await fetch(`${PYTHON_API_URL}/scanner/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    
    if (!scanRes.ok) throw new Error('Scanner API failed');
    const scanResult = await scanRes.json();
    const scanData = scanResult.data;
    
    // 2. Call Python Workflow Generator
    console.log(`Generating workflow schema for: ${url}`);
    const wfRes = await fetch(`${PYTHON_API_URL}/workflow/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ form_data: scanData })
    });
    
    if (!wfRes.ok) throw new Error('Workflow API failed');
    const wfResult = await wfRes.json();
    const schemaDefinition = wfResult.schema;
    
    // 3. Manage Service
    const domain = new URL(url).hostname;
    let service = await Service.findOne({ domain });
    
    if (!service) {
      service = await Service.create({
        name: schemaDefinition.name || domain,
        domain: domain,
        description: `Auto-generated service for ${domain}`
      });
    }
    
    // 4. Save Workflow
    const workflow = await Workflow.create({
      serviceId: service._id,
      name: schemaDefinition.name || 'Generated Application Workflow',
      status: 'ACTIVE',
      schemaDefinition: schemaDefinition,
      steps: schemaDefinition.steps.map(step => ({
        title: step.title,
        fields: step.fields.map(f => f.name)
      }))
    });
    
    return workflow;
  } catch (error) {
    console.error('Workflow Generation Error:', error.message);
    throw new Error(`Failed to generate workflow: ${error.message}`);
  }
};
