import axios from 'axios';
import { config } from '../../../config/env.js';
import { auth } from '../../../core/firebase.js';

const api = axios.create({
  baseURL: config.apiBaseUrl + '/auth',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Helper to set token on requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('backend_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// API Calls that initially use Firebase Token
const executeWithFirebaseToken = async (url, body = {}) => {
  const user = auth.currentUser;
  if (!user) throw new Error('No Firebase user found');

  const token = await user.getIdToken();
  const response = await axios.post(config.apiBaseUrl + '/auth' + url, body, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (response.data.success && response.data.data.token) {
    localStorage.setItem('backend_token', response.data.data.token);
  }
  return response.data;
};

export const registerApi = (otp = null) => executeWithFirebaseToken('/register', { otp });
export const loginApi = () => executeWithFirebaseToken('/login');

export const sendRegisterOtpApi = async (email) => {
  const response = await api.post('/send-register-otp', { email });
  return response.data;
};

// API Calls that use Backend JWT
export const meApi = async () => {
  const response = await api.get('/me');
  return response.data;
};

export const refreshApi = async () => {
  const response = await api.post('/refresh');
  if (response.data.success && response.data.data.token) {
    localStorage.setItem('backend_token', response.data.data.token);
  }
  return response.data;
};

export const forgotPasswordApi = async (email) => {
  const response = await api.post('/forgot-password', { email });
  return response.data;
};

export const verifyOtpApi = async (email, otp) => {
  const response = await api.post('/verify-otp', { email, otp });
  return response.data;
};

export const resetPasswordApi = async (email, otp, newPassword) => {
  const response = await api.post('/reset-password', { email, otp, newPassword });
  return response.data;
};

export const logoutApi = async () => {
  try {
    await api.post('/logout');
  } catch (error) {
    console.error('Logout API failed, continuing client logout', error);
  } finally {
    localStorage.removeItem('backend_token');
  }
};
