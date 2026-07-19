import apiClient from '../../../core/api/api.client.js';

export const analyzeUrlApi = async (targetUrl) => {
  const response = await apiClient.post('/workflow/analyze', { targetUrl });
  return response.data;
};

export const sendInterviewMessageApi = async (conversationId, content) => {
  const response = await apiClient.post('/interview/message', { conversationId, content });
  return response.data;
};

export const executeApplicationApi = async (interviewStateId) => {
  const response = await apiClient.post('/automation/execute', { interviewStateId });
  return response.data;
};

export const fetchAutomationStatusApi = async (jobId) => {
  const response = await apiClient.get(`/automation/status/${jobId}`);
  return response.data;
};

export const resumeAutomationApi = async (jobId, answers) => {
  const response = await apiClient.post('/automation/resume', { jobId, answers });
  return response.data;
};

export const uploadInlineDocumentApi = async (file, expectedType) => {
  const formData = new FormData();
  formData.append('document', file);
  formData.append('expectedType', expectedType || 'unknown');
  // Pass dummy allowed formats/max size if not explicitly provided, Node will handle defaults
  
  const response = await apiClient.post('/documents/inline-upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
};
