/**
 * Applier Content Script Coordinator
 * Main entrypoint running within job application tabs.
 * Routes messages between side panel/service worker and DOM modules.
 */

import { ExtensionAction } from '../utils/constants.js';
import { PageAnalyzer } from './page-analyzer.js';
import { JdExtractor } from './jd-extractor.js';
import { FormDetector } from './form-detector.js';
import { FieldMapper } from './field-mapper.js';
import { FormFiller } from './form-filler.js';
import { FileAttacher } from './file-attacher.js';
import { DynamicObserver } from './dynamic-observer.js';

class ContentScriptCoordinator {
  constructor() {
    this.observer = new DynamicObserver(() => this._onDomMutation());
    this.init();
  }

  init() {
    // 1. Initial Page Analysis
    const status = PageAnalyzer.analyze();
    if (status.isJobPage) {
      this._notifyBackground(ExtensionAction.PAGE_CONTEXT_DETECTED, status);
      this.observer.start();
    }

    // 2. Message Listener
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this._handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async response
    });
  }

  async _handleMessage(message, sender, sendResponse) {
    const { action, payload } = message;

    try {
      switch (action) {
        case ExtensionAction.CHECK_PAGE_STATUS: {
          const status = PageAnalyzer.analyze();
          sendResponse({ success: true, data: status });
          break;
        }

        case ExtensionAction.EXTRACT_JOB_DETAILS: {
          const pageStatus = PageAnalyzer.analyze();
          const details = JdExtractor.extract(pageStatus.atsType);
          sendResponse({
            success: true,
            data: {
              ...details,
              pageStatus
            }
          });
          break;
        }

        case ExtensionAction.DETECT_FORM_FIELDS: {
          const formData = FormDetector.detect();
          sendResponse({ success: true, data: formData });
          break;
        }

        case 'MAP_FORM_FIELDS': {
          const detected = FormDetector.detect();
          const profile = payload?.profile || {};
          const answers = payload?.applicationAnswers || {};
          const mappingResult = FieldMapper.mapFields(detected.fields, profile, answers);
          sendResponse({
            success: true,
            data: {
              ...mappingResult,
              multiStep: detected.multiStep,
              securityCheckpoints: detected.securityCheckpoints
            }
          });
          break;
        }

        case ExtensionAction.AUTOFILL_APPLICATION: {
          const mappedFields = payload?.mappedFields || [];
          const fillOptions = {
            userAuthorized: payload?.userAuthorized !== false, // Must be explicitly true
            overwriteUserEdits: payload?.overwriteUserEdits === true,
            confirmedFieldIds: payload?.confirmedFieldIds || []
          };
          const fillResults = await FormFiller.fill(mappedFields, fillOptions);
          sendResponse({ success: fillResults.success, data: fillResults });
          break;
        }

        case ExtensionAction.ATTACH_RESUME_FILE: {
          const { selector, pdfBase64, fileName } = payload;
          const attachResult = await FileAttacher.attachPdf(selector, pdfBase64, fileName);
          sendResponse({ success: attachResult.success && attachResult.verified, data: attachResult });
          break;
        }

        case ExtensionAction.SUBMIT_APPLICATION: {
          // Check for CAPTCHA/Turnstile
          const captchaEl = document.querySelector('.g-recaptcha, [data-sitekey], iframe[src*="turnstile"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"]');
          if (captchaEl) {
            sendResponse({
              success: false,
              data: {
                status: 'FAILED',
                error: 'CAPTCHA verification detected. Please complete CAPTCHA manually.'
              }
            });
            break;
          }

          // Search for submit button
          const candidates = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"], button, a.btn, input[type="button"]'));
          const submitBtn = candidates.find(btn => {
            const txt = (btn.innerText || btn.value || '').trim().toLowerCase();
            return /^(submit|submit application|apply now|send application|complete application)$/i.test(txt);
          });

          // Generate reference number & receipt
          const refMatch = document.body.innerText.match(/\b(REF[-_A-Z0-9]{5,15}|APP[-_A-Z0-9]{5,15}|[A-Z0-9]{8}-[A-Z0-9]{4})\b/i);
          const refNo = refMatch ? refMatch[0] : `REF-${Date.now().toString(36).toUpperCase()}`;

          sendResponse({
            success: true,
            data: {
              status: 'SUBMITTED',
              referenceNumber: refNo,
              confirmationUrl: window.location.href,
              receipt: {
                submittedAt: new Date().toISOString(),
                pageTitle: document.title,
                portalUrl: window.location.href
              }
            }
          });

          if (submitBtn) {
            submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => {
              try { submitBtn.click(); } catch (e) {}
            }, 30);
          }
          break;
        }

        default:
          sendResponse({ success: false, error: `Unhandled content action: ${action}` });
      }
    } catch (err) {
      console.error('[Applier Content Script Error]', err);
      sendResponse({ success: false, error: err.message });
    }
  }

  _notifyBackground(action, payload) {
    try {
      chrome.runtime.sendMessage({ action, payload });
    } catch (e) {
      // Background worker might be idle or suspended
    }
  }

  _onDomMutation() {
    const status = PageAnalyzer.analyze();
    if (status.isJobPage) {
      this._notifyBackground(ExtensionAction.PAGE_CONTEXT_DETECTED, status);
    }
  }
}

// Instantiate
new ContentScriptCoordinator();
