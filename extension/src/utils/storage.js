/**
 * Chrome Storage Local & Session Persistence Helpers
 * Handles durable state storage across Service Worker suspensions and tab switches.
 */

import { DEFAULT_BACKEND_URL } from './constants.js';

export class ExtensionStorage {
  static async get(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (result) => {
        resolve(result || {});
      });
    });
  }

  static async set(items) {
    return new Promise((resolve) => {
      chrome.storage.local.set(items, () => {
        resolve(true);
      });
    });
  }

  static async remove(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.remove(keys, () => {
        resolve(true);
      });
    });
  }

  // Auth Token
  static async getAuthToken() {
    const data = await this.get(['applier_jwt_token']);
    return data.applier_jwt_token || null;
  }

  static async setAuthToken(token) {
    return this.set({ applier_jwt_token: token });
  }

  static async clearAuthToken() {
    return this.remove(['applier_jwt_token', 'applier_user_profile']);
  }

  // User Profile
  static async getUserProfile() {
    const data = await this.get(['applier_user_profile']);
    return data.applier_user_profile || null;
  }

  static async setUserProfile(profile) {
    return this.set({ applier_user_profile: profile });
  }

  // Backend API URL
  static async getBackendUrl() {
    const data = await this.get(['applier_backend_url']);
    return data.applier_backend_url || DEFAULT_BACKEND_URL;
  }

  static async setBackendUrl(url) {
    return this.set({ applier_backend_url: url });
  }

  // Tab-specific Application Session State (recovers from service-worker termination)
  static async getTabSession(tabId) {
    const key = `session_tab_${tabId}`;
    const data = await this.get([key]);
    return data[key] || null;
  }

  static async setTabSession(tabId, sessionData) {
    const key = `session_tab_${tabId}`;
    return this.set({ [key]: sessionData });
  }

  static async clearTabSession(tabId) {
    const key = `session_tab_${tabId}`;
    return this.remove([key]);
  }
}
