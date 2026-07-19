import axios from 'axios';

const apiBaseUrl = 'http://localhost:5000/api/v1'; // Node backend

const apiClient = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('backend_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.data?.error) {
      const apiError = error.response.data.error;
      error.isRetryable = apiError.retryable || false;
      error.userMessage = apiError.retryable ? `${apiError.message} Please try again.` : apiError.message;
      error.apiCode = apiError.code;
      error.details = apiError.details;
      error.requestId = apiError.requestId;
    } else {
      error.userMessage = "Network error. The server might be unreachable.";
    }
    return Promise.reject(error);
  }
);

export default apiClient;
