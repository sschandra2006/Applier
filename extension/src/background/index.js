/**
 * Applier Chrome Extension — Background Service Worker (Manifest V3)
 * Manages extension lifecycle, side panel behavior, durable state recovery,
 * and inter-component message routing.
 */

import { ExtensionAction, ExtensionWorkflowState } from '../utils/constants.js';
import { SessionManager } from './session-manager.js';
import { ExtensionStorage } from '../utils/storage.js';

// Configure Side Panel behavior on install
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
      // Fallback if permission or browser variant doesn't support openPanelOnActionClick
    });
  }
});

// Update badge when a job application page is detected
function updateBadge(tabId, isJobPage) {
  if (isJobPage) {
    chrome.action.setBadgeText({ tabId, text: 'JOB' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#2563eb' });
  } else {
    chrome.action.setBadgeText({ tabId, text: '' });
  }
}

// Tab activation listener
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.url && tab.url.startsWith('http')) {
      chrome.tabs.sendMessage(activeInfo.tabId, { action: ExtensionAction.CHECK_PAGE_STATUS }, (resp) => {
        if (!chrome.runtime.lastError && resp?.data?.isJobPage) {
          updateBadge(activeInfo.tabId, true);
        } else {
          updateBadge(activeInfo.tabId, false);
        }
      });
    }
  } catch (e) {}
});

// Message Dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, payload } = message;
  const tabId = payload?.tabId || sender?.tab?.id;

  (async () => {
    try {
      switch (action) {
        case ExtensionAction.PAGE_CONTEXT_DETECTED: {
          if (sender?.tab?.id) {
            updateBadge(sender.tab.id, payload.isJobPage);
            await SessionManager.updateSession(sender.tab.id, {
              state: ExtensionWorkflowState.JOB_DETECTED,
              jobPageContext: payload
            });
          }
          sendResponse({ success: true });
          break;
        }

        case ExtensionAction.START_APPLICATION_FLOW: {
          const targetTabId = tabId || (await getActiveTabId());
          const session = await SessionManager.startApplicationFlow(targetTabId);
          sendResponse({ success: true, data: session });
          break;
        }

        case ExtensionAction.SUBMIT_GAP_ANSWER: {
          const targetTabId = tabId || (await getActiveTabId());
          const session = await SessionManager.submitAnswer(targetTabId, payload);
          sendResponse({ success: true, data: session });
          break;
        }

        case ExtensionAction.SKIP_GAP_QUESTION: {
          const targetTabId = tabId || (await getActiveTabId());
          const session = await SessionManager.skipQuestion(targetTabId, payload.questionId);
          sendResponse({ success: true, data: session });
          break;
        }

        case ExtensionAction.GENERATE_TAILORED_RESUME: {
          const targetTabId = tabId || (await getActiveTabId());
          const session = await SessionManager.generateTailoredResume(targetTabId, payload?.templateId);
          sendResponse({ success: true, data: session });
          break;
        }

        case ExtensionAction.AUTOFILL_APPLICATION: {
          const targetTabId = tabId || (await getActiveTabId());
          const session = await SessionManager.autofillApplication(targetTabId);
          sendResponse({ success: true, data: session });
          break;
        }

        case ExtensionAction.CONFIRM_AND_SUBMIT: {
          const targetTabId = tabId || (await getActiveTabId());
          const session = await SessionManager.submitApplication(targetTabId, payload || {});
          sendResponse({ success: true, data: session });
          break;
        }

        case 'RECOVER_SESSION': {
          const targetTabId = tabId || (await getActiveTabId());
          const session = await SessionManager.recoverSession(targetTabId);
          sendResponse({ success: true, data: session });
          break;
        }

        case 'GET_SESSION_STATE': {
          const targetTabId = tabId || (await getActiveTabId());
          const session = await SessionManager.getSession(targetTabId);
          sendResponse({ success: true, data: session });
          break;
        }

        case 'RESET_SESSION_STATE': {
          const targetTabId = tabId || (await getActiveTabId());
          await ExtensionStorage.clearTabSession(targetTabId);
          const fresh = await SessionManager.getSession(targetTabId);
          sendResponse({ success: true, data: fresh });
          break;
        }

        default:
          sendResponse({ success: false, error: `Unknown background action: ${action}` });
      }
    } catch (err) {
      console.error('[Background Worker Error]', err);
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true; // Keep async channel open
});

async function getActiveTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id;
}
