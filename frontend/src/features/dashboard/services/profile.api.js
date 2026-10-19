import apiClient from '../../../core/api/api.client.js';

export const fetchProfessionalProfileApi = async () => {
  const response = await apiClient.get('/profile');
  return response.data;
};

export const updateProfessionalProfileApi = async (updates) => {
  const response = await apiClient.put('/profile', updates);
  return response.data;
};

export const verifyProfessionalProfileApi = async () => {
  const response = await apiClient.post('/profile/verify');
  return response.data;
};

export const deleteProfileItemApi = async (section, itemId) => {
  const response = await apiClient.delete(`/profile/${section}/${itemId}`);
  return response.data;
};

export const uploadMasterResumeApi = async (file, forceReprocess = false) => {
  const formData = new FormData();
  formData.append('resume', file);
  if (forceReprocess) {
    formData.append('forceReprocess', 'true');
  }

  const response = await apiClient.post('/vault/resumes/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
  return response.data;
};

export const fetchMasterResumesApi = async () => {
  const response = await apiClient.get('/vault/resumes');
  return response.data;
};

export const downloadMasterResumeApi = async (resumeId, originalName) => {
  const response = await apiClient.get(`/vault/resumes/${resumeId}/download`, {
    responseType: 'blob'
  });

  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', originalName || 'master_resume.pdf');
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};
