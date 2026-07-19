import apiClient from '../../../core/api/api.client.js';

export const fetchDashboardStatsApi = async () => {
  const response = await apiClient.get('/tracking/stats');
  return response.data;
};

export const fetchRecentActivityApi = async () => {
  const response = await apiClient.get('/tracking/activity');
  return response.data;
};

export const fetchApplicationsApi = async () => {
  const response = await apiClient.get('/tracking/applications');
  return response.data;
};
