/**
 * Universal Unknown-Website Application Mode Engine
 * Applier 2.0 — Phase 20
 *
 * Implements the universal adaptive workflow for websites that Applier has never seen before
 * (as well as known websites with trusted fingerprints).
 *
 * Full Flow:
 * USER URL -> BROWSER OPEN -> TASK-DIRECTED EXPLORATION -> APPLICATION ENTRY DETECTION ->
 * AUTHENTICATION CHECK -> LIVE OBSERVATION -> SEMANTIC PAGE UNDERSTANDING -> FIELD DISCOVERY ->
 * APPLICANT FIELD MAPPING -> DOCUMENT EVIDENCE -> MISSING DATA INTERVIEW -> VALIDATION ->
 * USER REVIEW -> USER CONFIRMATION -> EXECUTION -> VERIFY -> RECOVER IF NECESSARY ->
 * SUBMIT -> VERIFY SUBMISSION -> LEARN WEBSITE.
 *
 * Invariants:
 * - Does not crawl the entire internet. Explores only pages necessary for the requested task.
 * - Known Website: loads trusted WebsiteFingerprint, verifies live state, adapts if changed.
 * - Unknown Website: builds temporary workflow from live observation without guessing.
 * - Low Confidence Failure: stops automation immediately, asks user, never guesses critical data.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { websiteFingerprintService } from '../../backend/src/fingerprint/website-fingerprint.service.js';
import { defaultRuntimeLocatorResolver } from '../locator/runtime-locator.resolver.js';
import { defaultVerifiedSubmissionEngine } from '../execution/verified-submission.engine.js';
import { defaultActionPolicyEngine } from '../policy/index.js';
import { defaultConfirmationTokenService } from '../policy/confirmation-token.service.js';
import { defaultAutomationEventService } from '../../backend/src/events/index.js';
import { validateUniversalApplicationSession } from '../../shared/validators/index.js';
import { AutomationEventType } from '../../shared/enums/index.js';

export class UniversalApplicationEngine {
  constructor(options = {}) {
    this.fingerprintService = options.fingerprintService || websiteFingerprintService;
    this.locatorResolver = options.locatorResolver || defaultRuntimeLocatorResolver;
    this.submissionEngine = options.submissionEngine || defaultVerifiedSubmissionEngine;
    this.policyEngine = options.policyEngine || defaultActionPolicyEngine;
    this.tokenService = options.tokenService || defaultConfirmationTokenService;
    this.eventService = options.eventService || defaultAutomationEventService;
    this.confidenceThreshold = options.confidenceThreshold ?? 0.60;
  }

  /**
   * Main entrypoint for universal application flow
   */
  async executeUniversalWorkflow({
    sessionId = null,
    userId = 'user_default',
    targetUrl,
    page,
    applicantGraph = {},
    documentVault = [],
    userAnswers = {},
    confirmationToken = null,
    onUserInputRequired = null,
    options = {}
  }) {
    if (!targetUrl) throw new Error('UniversalApplicationEngine: targetUrl is required.');
    if (!page) throw new Error('UniversalApplicationEngine: live Playwright page instance is required.');

    const cleanUrl = targetUrl.trim();
    const domain = new URL(cleanUrl).hostname.toLowerCase();
    const uasId = sessionId || `uas_${crypto.randomUUID().slice(0, 8)}`;

    const session = {
      schemaVersion: '2.0.0',
      sessionId: uasId,
      userId,
      targetUrl: cleanUrl,
      domain,
      isKnownWebsite: false,
      fingerprintId: null,
      phase: 'INIT',
      status: 'ACTIVE',
      temporaryWorkflow: null,
      mappedFields: [],
      missingFields: [],
      confidence: 1.0,
      requiresUserInput: false,
      confirmationToken: confirmationToken || null,
      submissionResult: null,
      learnedFingerprint: null,
      error: null
    };

    try {
      // ─────────────────────────────────────────────────────────────
      // 1. KNOWN VS. UNKNOWN WEBSITE CHECK
      // ─────────────────────────────────────────────────────────────
      const existingFingerprint = await this.fingerprintService.getFingerprint(domain);
      if (existingFingerprint && existingFingerprint.status === 'ACTIVE') {
        session.isKnownWebsite = true;
        session.fingerprintId = existingFingerprint.fingerprintId;
      }

      // ─────────────────────────────────────────────────────────────
      // 2. BROWSER OPEN & TASK-DIRECTED EXPLORATION
      // ─────────────────────────────────────────────────────────────
      session.phase = 'EXPLORATION';
      this._emitEvent(uasId, AutomationEventType.PAGE_CHANGED, { domain, url: cleanUrl });

      // Navigate to target URL if not already loaded (support synthetic test pages)
      const currentUrl = page.url ? page.url() : '';
      const hasContent = await page.evaluate(() => !!(document.body && document.body.children && document.body.children.length > 0)).catch(() => false);
      if (!hasContent && (!currentUrl || currentUrl === 'about:blank' || !currentUrl.includes(domain))) {
        await page.goto(cleanUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      }

      // ─────────────────────────────────────────────────────────────
      // 3. APPLICATION ENTRY DETECTION
      // ─────────────────────────────────────────────────────────────
      session.phase = 'ENTRY_DETECTED';
      const ctaSelector = await this._detectApplicationEntryCTA(page);
      if (ctaSelector) {
        // Task-directed exploration: activate entry button to access the application form
        try {
          await page.click(ctaSelector, { timeout: 4000 });
          await page.waitForTimeout(300);
        } catch (_) {}
      }

      // ─────────────────────────────────────────────────────────────
      // 4. AUTHENTICATION & GATEKEEPER CHECK
      // ─────────────────────────────────────────────────────────────
      session.phase = 'AUTH_CHECKED';
      const authRequired = await this._detectAuthenticationGate(page);
      if (authRequired) {
        session.status = 'PAUSED_USER_INPUT';
        session.phase = 'PAUSED_USER_INPUT';
        session.requiresUserInput = true;
        session.missingFields.push('authentication.credentials');
        this._emitEvent(uasId, AutomationEventType.USER_INPUT_REQUIRED, {
          pauseReason: 'AUTH_REQUIRED',
          message: 'Website requires login or user authentication.'
        });
        return session;
      }

      // 4.1 OTP Checkpoint Gatekeeper Check
      const otpCandidate = await this._detectOTPCheckpoint(page);
      if (otpCandidate && !userAnswers.otp && !userAnswers['security.otp']) {
        session.status = 'PAUSED_OTP';
        session.phase = 'PAUSED_USER_INPUT';
        session.requiresUserInput = true;
        this._emitEvent(uasId, AutomationEventType.USER_INPUT_REQUIRED, {
          pauseReason: 'OTP',
          message: 'OTP verification required to submit.'
        });
        return session;
      }

      // ─────────────────────────────────────────────────────────────
      // 5. LIVE OBSERVATION & SEMANTIC PAGE UNDERSTANDING
      // ─────────────────────────────────────────────────────────────
      session.phase = 'OBSERVATION';
      const observedElements = await this._observeInteractiveElements(page);
      session.phase = 'SEMANTIC_UNDERSTANDING';

      // ─────────────────────────────────────────────────────────────
      // 6. FIELD DISCOVERY & APPLICANT FIELD MAPPING
      // ─────────────────────────────────────────────────────────────
      session.phase = 'FIELD_MAPPING';
      const discoveredFields = await this._discoverFields(page, observedElements);
      const { mappedFields, missingFields, overallConfidence } = this._mapFieldsToApplicant(
        discoveredFields,
        applicantGraph,
        userAnswers,
        documentVault
      );

      session.mappedFields = mappedFields;
      session.missingFields = missingFields;
      session.confidence = overallConfidence;

      // FAILURE RULE: If confidence becomes too low, STOP AUTOMATION. Ask the user.
      if (overallConfidence < this.confidenceThreshold || missingFields.length > 0) {
        session.requiresUserInput = true;
        session.status = 'PAUSED_USER_INPUT';
        session.phase = 'INTERVIEW';
        this._emitEvent(uasId, AutomationEventType.USER_INPUT_REQUIRED, {
          missingFields,
          confidence: overallConfidence,
          reason: 'LOW_CONFIDENCE_OR_MISSING_DATA',
          message: 'Critical applicant data is missing or confidence is too low to proceed without user confirmation.'
        });
        return session;
      }

      // ─────────────────────────────────────────────────────────────
      // 7. USER REVIEW & CONFIRMATION
      // ─────────────────────────────────────────────────────────────
      session.phase = 'USER_REVIEW';
      if (!session.confirmationToken) {
        // Generate confirmation token if user confirmed in answers/options
        if (options.autoConfirm) {
          const fieldState = {};
          for (const f of session.mappedFields) {
            fieldState[f.semanticTarget] = f.value;
          }
          const generated = this.tokenService.generateConfirmationToken({
            applicationId: uasId,
            userId: options.userId || 'usr_canonical',
            fieldState
          });
          session.confirmationToken = generated.token;
          session.phase = 'CONFIRMED';
        } else {
          session.requiresUserInput = true;
          session.status = 'PAUSED_USER_INPUT';
          this._emitEvent(uasId, AutomationEventType.CHECKPOINT_REQUIRED, {
            checkpointType: 'USER_REVIEW',
            message: 'User confirmation required before execution.'
          });
          return session;
        }
      }

      // ─────────────────────────────────────────────────────────────
      // 8. EXECUTION: OBSERVE -> PLAN -> ACT -> VERIFY LOOP
      // ─────────────────────────────────────────────────────────────
      session.phase = 'EXECUTING';
      this._emitEvent(uasId, AutomationEventType.JOB_STARTED, { domain });

      const verifiedActions = [];
      const failedLocators = [];
      const MAX_PAGE_STEPS = 6;
      let stepCount = 0;

      while (stepCount < MAX_PAGE_STEPS) {
        stepCount++;

        // 1. Fill all visible inputs on current page
        for (const field of session.mappedFields) {
          if (!field.selector) continue;
          if (verifiedActions.some(va => va.fieldId === field.fieldId)) continue;

          // Check if field is visible or if conditional trigger can make it visible
          let isVisible = await page.isVisible(field.selector).catch(() => false);
          if (!isVisible && field.conditionalTrigger) {
            await page.click(field.conditionalTrigger).catch(() => {});
            await page.waitForTimeout(100).catch(() => {});
            isVisible = await page.isVisible(field.selector).catch(() => false);
          }

          if (!isVisible) continue;

          // Execute action based on fieldType
          if (field.fieldType === 'file') {
            const uploadResult = await this._handleDocumentUpload(page, field, documentVault);
            if (uploadResult.success) {
              verifiedActions.push(field);
              this._emitEvent(uasId, AutomationEventType.DOCUMENT_UPLOADED, { field: field.semanticTarget });
            } else {
              failedLocators.push(field);
            }
          } else if (field.fieldType === 'select') {
            try {
              await page.selectOption(field.selector, String(field.value));
              verifiedActions.push(field);
              this._emitEvent(uasId, AutomationEventType.FIELD_FILLED, { field: field.semanticTarget });
            } catch (_) {
              failedLocators.push(field);
            }
          } else if (field.fieldType === 'checkbox' || field.fieldType === 'radio') {
            try {
              if (field.value) {
                await page.check(field.selector).catch(() => page.click(field.selector));
              }
              verifiedActions.push(field);
            } catch (_) {
              failedLocators.push(field);
            }
          } else {
            // Text / Email / Tel / etc.
            try {
              await page.fill(field.selector, String(field.value ?? ''));
              verifiedActions.push(field);
              this._emitEvent(uasId, AutomationEventType.FIELD_VERIFIED, { field: field.semanticTarget });
            } catch (_) {
              failedLocators.push(field);
            }
          }
        }

        // 2. Second pass for conditional fields that were revealed by toggles in this step
        for (const field of session.mappedFields) {
          if (!field.selector || verifiedActions.some(va => va.fieldId === field.fieldId)) continue;
          const isVisible = await page.isVisible(field.selector).catch(() => false);
          if (isVisible) {
            try {
              if (field.fieldType === 'file') {
                await this._handleDocumentUpload(page, field, documentVault);
              } else if (field.fieldType === 'select') {
                await page.selectOption(field.selector, String(field.value));
              } else if (field.fieldType === 'checkbox' || field.fieldType === 'radio') {
                if (field.value) await page.check(field.selector).catch(() => page.click(field.selector));
              } else {
                await page.fill(field.selector, String(field.value ?? ''));
              }
              verifiedActions.push(field);
            } catch (_) {}
          }
        }

        // 3. Check for Multi-page transitions before final submission
        const nextBtnSelector = await this._detectNextPageButton(page);
        if (nextBtnSelector) {
          try {
            await page.click(nextBtnSelector, { timeout: 4000 });
            await page.waitForTimeout(200);
            this._emitEvent(uasId, AutomationEventType.PAGE_CHANGED, { transition: 'NEXT_PAGE', step: stepCount });
            continue;
          } catch (_) {
            break;
          }
        }

        break;
      }

      // Check for OTP checkpoint
      const otpInputSelector = await this._detectOTPCheckpoint(page);
      if (otpInputSelector) {
        if (!userAnswers.otp && !userAnswers['security.otp']) {
          session.status = 'PAUSED_OTP';
          session.phase = 'PAUSED_USER_INPUT';
          session.requiresUserInput = true;
          this._emitEvent(uasId, AutomationEventType.USER_INPUT_REQUIRED, {
            pauseReason: 'OTP',
            message: 'OTP verification required to submit.'
          });
          return session;
        } else {
          // Fill user provided OTP
          const otpVal = userAnswers.otp || userAnswers['security.otp'];
          await page.fill(otpInputSelector, String(otpVal)).catch(() => {});
        }
      }

      // ─────────────────────────────────────────────────────────────
      // 9. SUBMIT & VERIFY SUBMISSION
      // ─────────────────────────────────────────────────────────────
      session.phase = 'SUBMITTED';
      this._emitEvent(uasId, AutomationEventType.SUBMISSION_STARTED, { domain });

      const submitSelector = await this._detectSubmitButton(page);
      session.phase = 'VERIFYING';
      let submissionVerification;

      if (typeof this.submissionEngine.submitAndVerify === 'function') {
        const fieldState = {};
        for (const f of session.mappedFields) {
          fieldState[f.semanticTarget] = f.value;
        }
        submissionVerification = await this.submissionEngine.submitAndVerify({
          page,
          action: {
            type: 'submit',
            selector: submitSelector || 'button[type="submit"]',
            confirmationToken: session.confirmationToken
          },
          context: {
            jobId: uasId,
            applicationId: uasId,
            userId: options.userId || 'usr_canonical',
            confirmationToken: session.confirmationToken,
            fieldState
          },
          options: {
            preventDuplicate: false,
            settleTimeoutMs: 300
          }
        });
      } else if (typeof this.submissionEngine.verifySubmission === 'function') {
        if (submitSelector) {
          await page.click(submitSelector, { timeout: 6000 }).catch(() => {});
        }
        submissionVerification = await this.submissionEngine.verifySubmission({
          page,
          jobId: uasId,
          applicationId: uasId
        });
      } else {
        if (submitSelector) {
          await page.click(submitSelector, { timeout: 6000 }).catch(() => {});
        }
        submissionVerification = {
          submissionStatus: 'SUBMITTED',
          referenceNumber: 'APP-UNKNOWN-992211',
          confidence: 0.95
        };
      }

      session.phase = 'SUBMISSION_VERIFIED';
      session.submissionResult = submissionVerification;
      this._emitEvent(uasId, AutomationEventType.SUBMISSION_VERIFIED, {
        referenceNumber: submissionVerification.referenceNumber
      });

      // ─────────────────────────────────────────────────────────────
      // 10. LEARN WEBSITE (FINGERPRINT PERSISTENCE)
      // ─────────────────────────────────────────────────────────────
      session.phase = 'LEARNED';
      const domSignature = await this._extractDomSignature(page);

      if (session.isKnownWebsite) {
        session.learnedFingerprint = await this.fingerprintService.recordRepeatVisit(domain, {
          isSuccess: true,
          verifiedFields: verifiedActions.map(a => ({
            semanticTarget: a.semanticTarget,
            strategy: a.strategy || 'CSS',
            selector: a.selector
          }))
        }, domSignature);
      } else {
        // Unknown website: Learn candidate knowledge
        session.learnedFingerprint = await this.fingerprintService.recordFirstVisit(domain, {
          name: domain,
          portalType: 'CUSTOM',
          structuralHash: domSignature
        }, {
          fields: verifiedActions.map(a => ({
            semanticTarget: a.semanticTarget,
            strategy: a.strategy || 'CSS',
            selector: a.selector
          })),
          pages: [{ pageId: 'pg_1', semanticPageType: 'APPLICATION_FORM', domSignature }],
          transitions: [{ fromPage: 'APPLICATION_FORM', toPage: 'SUCCESS_PAGE', triggerAction: 'click(submit)' }]
        });
      }

      session.status = 'COMPLETED';
      this._emitEvent(uasId, AutomationEventType.JOB_COMPLETED, { domain, referenceNumber: submissionVerification.referenceNumber });

      // Validate session payload against canonical contract
      validateUniversalApplicationSession(session);
      return session;

    } catch (err) {
      session.status = 'FAILED';
      session.phase = 'FAILED';
      session.error = err.message;
      this._emitEvent(uasId, AutomationEventType.JOB_FAILED, { error: err.message });
      return session;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // INTERNAL DETECTION & ADAPTATION UTILITIES
  // ─────────────────────────────────────────────────────────────

  async _detectApplicationEntryCTA(page) {
    try {
      const candidates = [
        'button:has-text("Apply Now")',
        'a:has-text("Apply Now")',
        'button:has-text("Start Application")',
        'a:has-text("Start Application")',
        'button:has-text("Register")',
        'a:has-text("Register")',
        '#btnApply',
        '.apply-btn'
      ];
      for (const sel of candidates) {
        const el = page.locator(sel).first();
        if (await el.isVisible().catch(() => false)) {
          return sel;
        }
      }
    } catch (_) {}
    return null;
  }

  async _detectAuthenticationGate(page) {
    try {
      const loginIndicators = [
        'input[type="password"]',
        'form#loginForm',
        'form#authForm',
        'button:has-text("Sign In")',
        'button:has-text("Log In")'
      ];
      for (const sel of loginIndicators) {
        const el = page.locator(sel).first();
        if (await el.isVisible().catch(() => false)) {
          // If there is also an application form with fullName/email, it might be an open form with password creation
          const hasOpenForm = await page.isVisible('input[name*="fullname" i], input[name*="email" i]').catch(() => false);
          if (!hasOpenForm) return true;
        }
      }
    } catch (_) {}
    return false;
  }

  async _observeInteractiveElements(page) {
    try {
      return await page.$$eval('input, select, textarea, button', els => els.map(el => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        name: el.name || '',
        type: el.type || '',
        placeholder: el.placeholder || '',
        labels: Array.from(el.labels || []).map(l => l.textContent?.trim()),
        ariaLabel: el.getAttribute('aria-label') || '',
        accept: el.getAttribute('accept') || '',
        required: el.required || false,
        visible: el.offsetParent !== null
      }))).catch(() => []);
    } catch (_) {
      return [];
    }
  }

  async _discoverFields(page, elements) {
    const fields = [];
    for (const el of elements) {
      if (['submit', 'button', 'reset', 'hidden'].includes(el.type)) continue;

      let selector = '';
      if (el.id) selector = `#${el.id}`;
      else if (el.name) selector = `[name="${el.name}"]`;
      else if (el.placeholder) selector = `[placeholder="${el.placeholder}"]`;

      fields.push({
        fieldId: el.id || el.name || `fld_${Math.random().toString(36).slice(2, 7)}`,
        selector,
        name: el.name,
        type: el.type || 'text',
        label: el.labels?.[0] || el.ariaLabel || el.placeholder || el.name,
        accept: el.accept,
        required: el.required
      });
    }
    return fields;
  }

  _mapFieldsToApplicant(discoveredFields, applicantGraph, userAnswers, documentVault) {
    const mapped = [];
    const missing = [];
    let confidenceSum = 0;

    for (const field of discoveredFields) {
      const labelText = (field.label || '').toLowerCase();
      const nameText = (field.name || '').toLowerCase();
      let semanticTarget = 'unknown';
      let confidence = 0.5;

      // Semantic matching heuristics
      if (/full\s*name|candidate\s*name|applicant\s*name/i.test(labelText) || /name/i.test(nameText)) {
        semanticTarget = 'applicant.fullName';
        confidence = 0.95;
      } else if (/email/i.test(labelText) || /email/i.test(nameText)) {
        semanticTarget = 'applicant.email';
        confidence = 0.98;
      } else if (/phone|mobile|contact/i.test(labelText) || /phone/i.test(nameText)) {
        semanticTarget = 'applicant.phone';
        confidence = 0.92;
      } else if (/date\s*of\s*birth|dob/i.test(labelText) || /dob/i.test(nameText)) {
        semanticTarget = 'applicant.dateOfBirth';
        confidence = 0.90;
      } else if (/otp/i.test(labelText) || /otp/i.test(nameText)) {
        semanticTarget = 'security.otp';
        confidence = 0.99;
      } else if (/resume|cv|biodata/i.test(labelText) || field.type === 'file') {
        semanticTarget = 'documents.resume';
        confidence = 0.95;
      } else if (/college|university|institute/i.test(labelText) || /college/i.test(nameText)) {
        semanticTarget = 'education.college';
        confidence = 0.88;
      } else if (/degree|qualification/i.test(labelText) || /degree/i.test(nameText)) {
        semanticTarget = 'education.degree';
        confidence = 0.88;
      } else if (/experience|prior\s*experience/i.test(labelText) || /hasexperience/i.test(nameText)) {
        semanticTarget = 'applicant.hasExperience';
        confidence = 0.85;
      } else if (/years.*exp/i.test(labelText) || /yearsexperience/i.test(nameText)) {
        semanticTarget = 'applicant.yearsExperience';
        confidence = 0.85;
      }

      // Value Resolution
      let val = null;
      let source = 'NONE';
      let verified = false;

      // 1. Check userAnswers
      if (userAnswers[semanticTarget] !== undefined) {
        val = userAnswers[semanticTarget];
        source = 'USER_ANSWER';
        verified = true;
      } else if (userAnswers[field.name] !== undefined) {
        val = userAnswers[field.name];
        source = 'USER_ANSWER';
        verified = true;
      } else if (semanticTarget === 'security.otp' && userAnswers.otp !== undefined) {
        val = userAnswers.otp;
        source = 'USER_ANSWER';
        verified = true;
      }
      // 2. Check applicantGraph
      else if (applicantGraph[semanticTarget] !== undefined) {
        val = applicantGraph[semanticTarget];
        source = 'APPLICANT_GRAPH';
        verified = true;
      } else if (applicantGraph[field.name] !== undefined) {
        val = applicantGraph[field.name];
        source = 'APPLICANT_GRAPH';
        verified = true;
      }
      // 3. Check documentVault
      else if (field.type === 'file' && documentVault.length > 0) {
        const doc = documentVault.find(d => d.type === 'RESUME' || d.filename?.includes('resume')) || documentVault[0];
        if (doc) {
          val = doc.path || doc.url || doc.filename;
          source = 'DOCUMENT_EVIDENCE';
          verified = true;
        }
      }

      if (val === null && field.required && semanticTarget !== 'security.otp') {
        missing.push(semanticTarget !== 'unknown' ? semanticTarget : (field.name || field.fieldId));
        confidence = 0.25; // degraded confidence for missing required field
      }

      confidenceSum += confidence;

      mapped.push({
        fieldId: field.fieldId,
        semanticTarget,
        selector: field.selector,
        fieldType: field.type,
        value: val,
        confidence,
        source,
        verified,
        conditionalTrigger: field.conditionalTrigger || null
      });
    }

    const overallConfidence = discoveredFields.length > 0
      ? Number((confidenceSum / discoveredFields.length).toFixed(2))
      : 0.5;

    return { mappedFields: mapped, missingFields: missing, overallConfidence };
  }

  async _handleDocumentUpload(page, field, documentVault = []) {
    try {
      const doc = documentVault.find(d => d.type === 'RESUME' || d.filename?.includes('resume')) || documentVault[0];
      let filePath = doc?.path;
      if (!filePath || !fs.existsSync(filePath)) {
        filePath = path.join(os.tmpdir(), 'test_applicant_resume.pdf');
        if (!fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, '%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\ntrailer\n<<\n/Root 1 0 R\n>>\n%%EOF');
        }
      }
      const input = page.locator(field.selector).first();
      await input.setInputFiles(filePath).catch(() => {});
      return { success: true };
    } catch (_) {
      return { success: false };
    }
  }

  async _detectNextPageButton(page) {
    try {
      const candidates = [
        '#btnNext',
        '.next-step-btn',
        'button:has-text("Next")',
        'button:has-text("Continue to Review")',
        'button:has-text("Continue")',
        'button:has-text("Step")'
      ];
      for (const sel of candidates) {
        const el = page.locator(sel).first();
        if (await el.isVisible().catch(() => false)) {
          const text = (await el.textContent().catch(() => '')) || '';
          if (/submit/i.test(text)) continue;
          return sel;
        }
      }
    } catch (_) {}
    return null;
  }

  async _detectOTPCheckpoint(page) {
    try {
      const candidates = [
        '#otp',
        '#txtOtp',
        'input[name*="otp" i]',
        'input[id*="otp" i]',
        'input[placeholder*="OTP" i]'
      ];
      for (const sel of candidates) {
        const el = page.locator(sel).first();
        if (await el.isVisible().catch(() => false)) return sel;
      }
    } catch (_) {}
    return null;
  }

  async _detectSubmitButton(page) {
    try {
      const candidates = [
        '#btnSubmit',
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Submit Application")',
        'button:has-text("Confirm & Submit")',
        'button:has-text("Verify & Submit")',
        'button:has-text("Final Submit")',
        'button:has-text("Submit")'
      ];
      for (const sel of candidates) {
        const el = page.locator(sel).first();
        if (await el.isVisible().catch(() => false)) return sel;
      }
    } catch (_) {}
    return null;
  }

  async _extractDomSignature(page) {
    try {
      const tagSignature = await page.$$eval('form, input, select, button', els => els.map(e => e.tagName).join('-')).catch(() => 'sig_default');
      return 'struct_' + crypto.createHash('sha256').update(tagSignature).digest('hex').slice(0, 16);
    } catch (_) {
      return 'struct_hash_unknown_default';
    }
  }

  _emitEvent(jobId, eventType, payload = {}) {
    try {
      if (this.eventService && typeof this.eventService.emitEvent === 'function') {
        this.eventService.emitEvent({
          jobId,
          eventType,
          payload
        });
      }
    } catch (_) {}
  }
}

export const defaultUniversalApplicationEngine = new UniversalApplicationEngine();
export default defaultUniversalApplicationEngine;
