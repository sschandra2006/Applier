const axios = require('axios');
const mongoose = require('mongoose');

async function test() {
  try {
    const PYTHON_API_URL = 'http://localhost:8000/api/v1';
    const targetUrl = 'https://onlineservices.proteantech.in/paam/endUserRegisterContact.html';
    
    console.log(`[Workflow] Scanning URL: ${targetUrl}`);
    const scanResponse = await axios.post(`${PYTHON_API_URL}/scanner/scan`, { url: targetUrl });
    const scannedData = scanResponse.data.data;

    console.log(`[Workflow] Generating workflow schema...`);
    const genResponse = await axios.post(`${PYTHON_API_URL}/workflow/generate`, { form_data: scannedData });
    const schema = genResponse.data.schema;
    
    console.log('SUCCESS', schema);
  } catch (error) {
    if (error.response) {
      console.error('Python API Error Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

test();
