import apiClient from '../../../core/api/api.client.js';

export const fetchDocumentsApi = async () => {
  const response = await apiClient.get('/documents');
  return response.data;
};

export const uploadDocumentApi = async (file, expectedType) => {
  const formData = new FormData();
  formData.append('document', file);
  formData.append('expectedType', expectedType);

  const response = await apiClient.post('/documents/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
  return response.data;
};

export const deleteDocumentApi = async (documentId) => {
  const response = await apiClient.delete(`/documents/${documentId}`);
  return response.data;
};
