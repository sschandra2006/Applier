/**
 * Applier Background API Client
 * Resilient HTTP client for Applier backend communication with JWT auth injection
 * and exponential retry logic for temporary network glitches.
 */

import { ExtensionStorage } from '../utils/storage.js';

export class ApplierApiClient {
  constructor() {
    this.baseUrl = null;
  }

  async getBaseUrl() {
    if (!this.baseUrl) {
      this.baseUrl = await ExtensionStorage.getBackendUrl();
    }
    return this.baseUrl;
  }

  async request(endpoint, options = {}, retries = 2) {
    const baseUrl = await this.getBaseUrl();
    const url = `${baseUrl}${endpoint}`;
    const token = await ExtensionStorage.getAuthToken();

    const headers = {
      'Content-Type': 'application/json',
      'X-Client': 'Applier-Chrome-Extension-v3',
      ...(options.headers || {})
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const resp = await fetch(url, {
          ...options,
          headers
        });

        if (resp.status === 401) {
          // Token expired or invalid
          await ExtensionStorage.clearAuthToken();
          const err = new Error('Session expired. Please sign in again.');
          err.code = 'UNAUTHENTICATED';
          throw err;
        }

        const data = await resp.json();
        if (!resp.ok || data.success === false) {
          const err = new Error(data.error || `HTTP error ${resp.status}`);
          err.status = resp.status;
          err.data = data;
          throw err;
        }

        return data;
      } catch (err) {
        lastError = err;
        if (err.code === 'UNAUTHENTICATED' || attempt === retries) {
          break;
        }
        // Wait before exponential retry (300ms, 900ms)
        const delay = Math.pow(3, attempt) * 300;
        await new Promise((res) => setTimeout(res, delay));
      }
    }

    throw lastError;
  }

  // Authentication
  async login(email, password) {
    const res = await this.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    const token = res.token || res.data?.token;
    if (token) {
      await ExtensionStorage.setAuthToken(token);
    }
    return res;
  }

  // User Profile
  async getProfile() {
    const res = await this.request('/api/v1/profile', { method: 'GET' });
    const profile = res.data || res;
    await ExtensionStorage.setUserProfile(profile);
    return profile;
  }

  // Application & Gap Clarification Session
  async initSession({ jobTitle, companyName, jobDescription, applicationQuestions, jobUrl, atsType }) {
    return this.request('/api/v1/missing-info/session/init', {
      method: 'POST',
      body: JSON.stringify({
        jobTitle,
        companyName,
        jobDescription,
        applicationQuestions: applicationQuestions || [],
        jobUrl: jobUrl || '',
        atsType: atsType || 'GENERIC'
      })
    });
  }

  async getCurrentQuestion(sessionId) {
    return this.request(`/api/v1/missing-info/session/${sessionId}/current-question`, {
      method: 'GET'
    });
  }

  async submitAnswer(sessionId, { questionId, answer, targetEntity, isDeclined = false }) {
    return this.request(`/api/v1/missing-info/session/${sessionId}/answer`, {
      method: 'POST',
      body: JSON.stringify({
        questionId,
        answer,
        targetEntity,
        isDeclined
      })
    });
  }

  async skipQuestion(sessionId, questionId) {
    return this.request(`/api/v1/missing-info/session/${sessionId}/skip`, {
      method: 'POST',
      body: JSON.stringify({ questionId })
    });
  }

  // Resume Tailoring & PDF Generation
  async tailorResume(sessionId, templateId = 'ATS_SINGLE_COLUMN') {
    return this.request(`/api/v1/missing-info/session/${sessionId}/tailor-resume`, {
      method: 'POST',
      body: JSON.stringify({ templateId })
    });
  }

  // Pre-Submission Review Manifest
  async getReviewManifest(sessionId) {
    return this.request(`/api/v1/missing-info/session/${sessionId}/review`, {
      method: 'GET'
    });
  }

  // Fetch Decrypted PDF Buffer as Base64 for In-Page File Attachment
  async fetchResumePdfBase64(tailoredResumeId) {
    const baseUrl = await this.getBaseUrl();
    const token = await ExtensionStorage.getAuthToken();
    const url = `${baseUrl}/api/v1/vault/resumes/tailored/${tailoredResumeId}/download`;

    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!resp.ok) {
      throw new Error(`Failed to download tailored resume PDF: ${resp.status}`);
    }

    const arrayBuffer = await resp.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // Orchestration & Form Fill Reporting
  async recordFormFillAndAttachment(sessionId, payload) {
    return this.request(`/api/v1/missing-info/session/${sessionId}/fill-status`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  // Pre-Submission Confirmation Barrier
  async confirmSubmission(sessionId, userConfirmed = true) {
    return this.request(`/api/v1/missing-info/session/${sessionId}/confirm-submission`, {
      method: 'POST',
      body: JSON.stringify({ userConfirmed })
    });
  }

  // Final Submission Outcome Recording
  async recordSubmissionOutcome(sessionId, payload) {
    return this.request(`/api/v1/missing-info/session/${sessionId}/record-submission`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  // Session State Recovery
  async recoverWorkflowSession(sessionId) {
    return this.request(`/api/v1/missing-info/session/${sessionId}/recover`, {
      method: 'GET'
    });
  }
}

export const apiClient = new ApplierApiClient();
