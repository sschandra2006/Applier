import apiClient from '../../../core/api/api.client.js';

export const fetchProfileApi = async () => {
  const response = await apiClient.get('/users/profile');
  return response.data;
};

export const updateProfileApi = async (profileData) => {
  const response = await apiClient.put('/users/profile', profileData);
  return response.data;
};
