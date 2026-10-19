import apiClient from '../../../core/api/api.client.js';

export const analyzeUrlApi = async (targetUrl) => {
  const response = await apiClient.post('/workflow/analyze', { targetUrl });
  return response.data;
};

export const sendInterviewMessageApi = async (conversationId, content) => {
  const response = await apiClient.post('/interview/message', { conversationId, content });
  return response.data;
};

export const resumeInterviewApi = async (interviewStateId) => {
  const response = await apiClient.post('/interview/resume', { interviewStateId });
  return response.data;
};

export const executeApplicationApi = async (interviewStateId, confirmationToken = null) => {
  const response = await apiClient.post('/automation/execute', { interviewStateId, confirmationToken });
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
  
  const response = await apiClient.post('/documents/inline-upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
};

export const fetchApplicationReviewApi = async (interviewStateId) => {
  const response = await apiClient.get(`/review/${interviewStateId}`);
  return response.data;
};

export const resolveConflictApi = async (interviewStateId, { fieldKey, resolvedValue, chosenSource }) => {
  const response = await apiClient.post(`/review/${interviewStateId}/resolve-conflict`, {
    fieldKey,
    resolvedValue,
    chosenSource
  });
  return response.data;
};

export const updateReviewFieldApi = async (interviewStateId, { fieldKey, value, source }) => {
  const response = await apiClient.put(`/review/${interviewStateId}/field`, {
    fieldKey,
    value,
    source
  });
  return response.data;
};

export const confirmApplicationReviewApi = async (interviewStateId, { applicationId, workflowVersion } = {}) => {
  const response = await apiClient.post(`/review/${interviewStateId}/confirm`, {
    applicationId,
    workflowVersion
  });
  return response.data;
};

export const createAutomationEventSource = (jobId) => {
  const token = localStorage.getItem('backend_token');
  const baseUrl = 'http://localhost:5000/api/v1';
  const url = `${baseUrl}/automation/events/${jobId}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  return new EventSource(url);
};

