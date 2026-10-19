/**
 * Applier Popup Controller
 */

import { ExtensionStorage } from '../utils/storage.js';
import { ExtensionAction } from '../utils/constants.js';

document.addEventListener('DOMContentLoaded', async () => {
  const authBadge = document.getElementById('popup-auth-badge');
  const jobInfoBlock = document.getElementById('job-info-block');
  const noJobBlock = document.getElementById('no-job-block');
  const atsBadge = document.getElementById('ats-badge');
  const jobTitleEl = document.getElementById('job-title');
  const jobCompanyEl = document.getElementById('job-company');
  const btnOpenSidepanel = document.getElementById('btn-open-sidepanel');
  const btnSidepanelFallback = document.getElementById('btn-sidepanel-fallback');

  // 1. Auth Status Check
  const token = await ExtensionStorage.getAuthToken();
  const profile = await ExtensionStorage.getUserProfile();
  if (token) {
    authBadge.textContent = profile?.personalInfo?.fullName ? 'Signed In' : 'Connected';
    authBadge.className = 'badge badge-success';
  } else {
    authBadge.textContent = 'Sign In Required';
    authBadge.className = 'badge badge-unauth';
  }

  // 2. Active Tab Status
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: ExtensionAction.EXTRACT_JOB_DETAILS }, (resp) => {
      if (!chrome.runtime.lastError && resp?.data) {
        const jd = resp.data;
        jobTitleEl.textContent = jd.jobTitle || 'Job Application';
        jobCompanyEl.textContent = jd.companyName || '';
        atsBadge.textContent = jd.pageStatus?.atsType || 'Generic';

        jobInfoBlock.classList.remove('hidden');
        noJobBlock.classList.add('hidden');
      } else {
        jobInfoBlock.classList.add('hidden');
        noJobBlock.classList.remove('hidden');
      }
    });
  }

  // 3. Open Side Panel Handler
  const openSidePanel = async () => {
    if (tab?.id && chrome.sidePanel && chrome.sidePanel.open) {
      try {
        await chrome.sidePanel.open({ tabId: tab.id });
      } catch (e) {
        // Window fallback
        const window = await chrome.windows.getCurrent();
        await chrome.sidePanel.open({ windowId: window.id }).catch(() => {});
      }
    }
    window.close();
  };

  btnOpenSidepanel.addEventListener('click', openSidePanel);
  btnSidepanelFallback.addEventListener('click', openSidePanel);
});
