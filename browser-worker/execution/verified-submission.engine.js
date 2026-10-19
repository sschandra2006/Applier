/**
 * Verified Submission & Receipt Capture Engine
 * Applier 2.0 — Phase 17: Verified Submission and Receipt Capture
 *
 * Core Principles:
 * 1. A successful click is NOT equivalent to successful submission.
 * 2. Multi-Signal Verification:
 *    - Success page
 *    - Confirmation text
 *    - Application / reference number
 *    - Receipt / download link
 *    - URL transition
 *    - DOM state
 *    - (Never rely on screenshot alone)
 * 3. Ambiguity Protocol:
 *    - If submission status is ambiguous -> DO NOT claim success.
 *    - Move to: SUBMISSION_UNCERTAIN and require recovery / human review.
 * 4. Duplicate Submission Protection:
 *    - Block re-submission of already verified & submitted applications.
 * 5. Full Persistence of Receipt & Evidence.
 */

import crypto from 'crypto';
import mongoose from 'mongoose';
import {
  SubmissionStatus,
  SubmissionSignalType,
  ApplicationStatus,
  validateVerifiedSubmission
} from '../../shared/src/index.js';
import { defaultConfirmationTokenService } from '../policy/confirmation-token.service.js';
import { defaultRuntimeLocatorResolver } from '../locator/runtime-locator.resolver.js';

export class DuplicateSubmissionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'DuplicateSubmissionError';
    this.details = details;
  }
}

export class VerifiedSubmissionEngine {
  constructor(options = {}) {
    this.tokenService = options.tokenService || defaultConfirmationTokenService;
    this.locatorResolver = options.locatorResolver || defaultRuntimeLocatorResolver;
    this.applicationModel = options.applicationModel || null;
  }

  /**
   * Lazily loads Application Mongoose model if database is active
   */
  async _getApplicationModel() {
    if (this.applicationModel) return this.applicationModel;
    try {
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        const { Application } = await import('../../backend/src/tracking/application.model.js');
        this.applicationModel = Application;
        return this.applicationModel;
      }
    } catch (_) {}
    return null;
  }

  /**
   * Executes verified submission according to the canonical flow:
   * Ready → final validation → user confirmation → submit → observe
   *       → detect success → verify reference number → capture receipt → persist result
   */
  async submitAndVerify({
    page,
    action = {},
    context = {},
    options = {}
  }) {
    const applicationId = context.applicationId || `app_${crypto.randomUUID().slice(0, 8)}`;
    const jobId = context.jobId || `job_${crypto.randomUUID().slice(0, 8)}`;
    const settleTimeoutMs = options.settleTimeoutMs ?? 2000;
    const preventDuplicate = options.preventDuplicate ?? true;

    // ─────────────────────────────────────────────────────────────
    // STEP 1: READY & FINAL VALIDATION + DUPLICATE PROTECTION
    // ─────────────────────────────────────────────────────────────
    if (preventDuplicate) {
      const duplicateCheck = await this._checkDuplicateSubmission(applicationId, context);
      if (duplicateCheck.isDuplicate) {
        return this._createDuplicateResult({
          applicationId,
          jobId,
          existingRecord: duplicateCheck.existingRecord,
          page
        });
      }
    }

    // Check pre-submission requirements & conflicts
    if (context.hasConflicts === true) {
      return this._createFailedResult({
        applicationId,
        jobId,
        page,
        reason: 'Unresolved conflicts present in application review state.',
        errorSignal: 'UNRESOLVED_CONFLICTS'
      });
    }

    if (context.hasValidationErrors === true) {
      return this._createFailedResult({
        applicationId,
        jobId,
        page,
        reason: 'Form validation errors present before submission.',
        errorSignal: 'PRE_SUBMISSION_VALIDATION_ERROR'
      });
    }

    // ─────────────────────────────────────────────────────────────
    // STEP 2: USER CONFIRMATION TOKEN VERIFICATION
    // ─────────────────────────────────────────────────────────────
    const confirmationToken = action.confirmationToken || context.confirmationToken;
    const tokenCheck = await this._verifyConfirmationToken(confirmationToken, context);
    if (!tokenCheck.allowed) {
      return this._createFailedResult({
        applicationId,
        jobId,
        page,
        reason: tokenCheck.reason || 'Missing or invalid user confirmation token.',
        errorSignal: 'TOKEN_INVALID'
      });
    }

    // ─────────────────────────────────────────────────────────────
    // STEP 3: SUBMIT ACTION DISPATCH
    // ─────────────────────────────────────────────────────────────
    const preSubmitUrl = page && typeof page.url === 'function' ? page.url() : 'about:blank';
    const submittedAt = new Date().toISOString();

    let submitError = null;
    let isTimeout = false;

    try {
      await this._executeSubmitClick(page, action);
    } catch (err) {
      submitError = err;
      if (err.name === 'TimeoutError' || err.message?.toLowerCase().includes('timeout')) {
        isTimeout = true;
      }
    }

    // ─────────────────────────────────────────────────────────────
    // STEP 4: OBSERVE POST-SUBMISSION STATE
    // ─────────────────────────────────────────────────────────────
    let observation = null;
    try {
      observation = await this._observePostSubmission(page, {
        preSubmitUrl,
        settleTimeoutMs
      });
    } catch (obsErr) {
      if (obsErr.name === 'TimeoutError' || obsErr.message?.toLowerCase().includes('timeout')) {
        isTimeout = true;
      }
      observation = {
        url: page && typeof page.url === 'function' ? page.url() : preSubmitUrl,
        pageTitle: '',
        bodyText: '',
        headings: [],
        alerts: [],
        domStateHash: 'timeout_hash',
        urlTransitioned: false
      };
    }

    // ─────────────────────────────────────────────────────────────
    // STEP 5: DETECT SUCCESS & ERROR SIGNALS (Multi-Signal Analysis)
    // ─────────────────────────────────────────────────────────────
    const signalAnalysis = this._detectSignals(observation, {
      preSubmitUrl,
      customSuccessPatterns: options.customSuccessPatterns,
      customErrorPatterns: options.customErrorPatterns
    });

    const { signalsDetected, errorSignals, confirmationHeading, confirmationText } = signalAnalysis;

    if (submitError && !isTimeout) {
      errorSignals.push(`Submit execution error: ${submitError.message}`);
    }

    // ─────────────────────────────────────────────────────────────
    // STEP 6: VERIFY APPLICATION / REFERENCE NUMBER
    // ─────────────────────────────────────────────────────────────
    const refNumberResult = this._extractAndVerifyReferenceNumber(observation);
    const referenceNumber = refNumberResult.referenceNumber;

    if (referenceNumber) {
      signalsDetected.push(SubmissionSignalType.APPLICATION_NUMBER);
    }

    // ─────────────────────────────────────────────────────────────
    // STEP 7: CAPTURE RECEIPT & RECEIPT SCREENSHOT
    // (Never rely on screenshot alone!)
    // ─────────────────────────────────────────────────────────────
    const receiptEvidence = await this._captureReceiptEvidence(page, observation);
    if (receiptEvidence.receipt?.available) {
      signalsDetected.push(SubmissionSignalType.RECEIPT_DOWNLOAD);
    }

    // ─────────────────────────────────────────────────────────────
    // STEP 8: DETERMINE FINAL SUBMISSION STATUS
    // (If submission status is ambiguous -> SUBMISSION_UNCERTAIN)
    // ─────────────────────────────────────────────────────────────
    const finalEvaluation = this._determineFinalStatus({
      signalsDetected,
      errorSignals,
      referenceNumber,
      isTimeout,
      submitError,
      observation,
      preSubmitUrl
    });

    const { submissionStatus, confidence, requiresHumanReview } = finalEvaluation;

    // ─────────────────────────────────────────────────────────────
    // STEP 9: PERSIST RESULT
    // ─────────────────────────────────────────────────────────────
    const resultRecord = {
      schemaVersion: '2.0.0',
      submissionId: `sub_${crypto.randomUUID()}`,
      applicationId: String(applicationId),
      jobId: String(jobId),
      submissionStatus,
      submittedAt,
      referenceNumber: referenceNumber || null,
      confirmationUrl: observation.url || preSubmitUrl,
      receipt: receiptEvidence.receipt,
      receiptScreenshot: receiptEvidence.receiptScreenshot,
      finalPageEvidence: {
        url: observation.url || preSubmitUrl,
        pageTitle: observation.pageTitle || '',
        confirmationHeading: confirmationHeading || null,
        confirmationText: confirmationText || null,
        signalsDetected: Array.from(new Set(signalsDetected)),
        errorSignals: Array.from(new Set(errorSignals)),
        urlTransitioned: observation.urlTransitioned || false,
        domStateHash: observation.domStateHash || ''
      },
      confidence,
      requiresHumanReview
    };

    // Contract Schema Validation
    const validation = validateVerifiedSubmission(resultRecord);
    if (!validation.valid) {
      console.warn('[VerifiedSubmissionEngine] Contract validation warnings:', validation.errors);
    }

    // Persist to Database / Application Record
    await this._persistToDatabase(resultRecord, context);

    return resultRecord;
  }

  // ─────────────────────────────────────────────────────────────
  // HELPER METHODS
  // ─────────────────────────────────────────────────────────────

  async _checkDuplicateSubmission(applicationId, context = {}) {
    // 1. Check in-memory application record provided
    if (context.applicationRecord) {
      const rec = context.applicationRecord;
      if (
        (rec.status === ApplicationStatus.SUBMITTED || rec.submissionStatus === SubmissionStatus.SUBMITTED) &&
        (rec.referenceNumber || rec.applicationNumber)
      ) {
        return { isDuplicate: true, existingRecord: rec };
      }
    }

    // 2. Query MongoDB if connected
    try {
      const AppModel = await this._getApplicationModel();
      if (AppModel && applicationId) {
        const existingApp = await AppModel.findOne({
          $or: [{ _id: applicationId }, { applicationId }]
        });
        if (
          existingApp &&
          (existingApp.status === ApplicationStatus.SUBMITTED || existingApp.submissionStatus === SubmissionStatus.SUBMITTED) &&
          (existingApp.referenceNumber || existingApp.applicationNumber)
        ) {
          return { isDuplicate: true, existingRecord: existingApp };
        }
      }
    } catch (_) {}

    return { isDuplicate: false, existingRecord: null };
  }

  async _verifyConfirmationToken(token, context = {}) {
    if (!token) {
      return { allowed: false, reason: 'Explicit user confirmation token is required.' };
    }

    if (this.tokenService && typeof this.tokenService.verifyConfirmationToken === 'function') {
      const verified = this.tokenService.verifyConfirmationToken({
        token,
        applicationId: context.applicationId,
        userId: context.userId,
        currentFieldState: context.answers || context.fieldState || {}
      });
      if (!verified.valid) {
        return { allowed: false, reason: verified.error || verified.reason || 'Confirmation token is invalid or expired.' };
      }
    } else if (this.tokenService && typeof this.tokenService.verifyToken === 'function') {
      const verified = this.tokenService.verifyToken(token, {
        applicationId: context.applicationId,
        fieldState: context.answers || context.fieldState || {}
      });
      if (!verified.isValid && !verified.valid) {
        return { allowed: false, reason: verified.reason || 'Confirmation token is invalid or expired.' };
      }
    }

    return { allowed: true };
  }

  async _executeSubmitClick(page, action = {}) {
    if (!page) return;

    // A. If semantic locator or target provided, resolve dynamically
    if (action.semanticTarget && this.locatorResolver) {
      const resolution = await this.locatorResolver.resolveLocator(page, action.semanticTarget);
      if (resolution && resolution.found && resolution.element) {
        await resolution.element.click();
        return;
      }
    }

    // B. If selector provided
    if (action.selector) {
      const el = page.locator(action.selector).first();
      if ((await el.count()) > 0) {
        await el.click();
        return;
      }
    }

    // C. Conventional submit buttons
    const submitBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Confirm & Submit")').first();
    if ((await submitBtn.count()) > 0) {
      await submitBtn.click();
      return;
    }

    // D. Direct form dispatch
    await page.evaluate(() => {
      const form = document.querySelector('form');
      if (form) {
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.submit();
      }
    });
  }

  async _observePostSubmission(page, { preSubmitUrl, settleTimeoutMs }) {
    if (!page) {
      return {
        url: preSubmitUrl,
        pageTitle: '',
        bodyText: '',
        headings: [],
        alerts: [],
        domStateHash: 'blank_hash',
        urlTransitioned: false
      };
    }

    // Wait for post-submit navigation or DOM settle
    try {
      if (typeof page.waitForLoadState === 'function') {
        await page.waitForLoadState('domcontentloaded', { timeout: settleTimeoutMs }).catch(() => {});
      }
      if (typeof page.waitForTimeout === 'function') {
        await page.waitForTimeout(300);
      }
    } catch (_) {}

    const observation = await page.evaluate((origUrl) => {
      const url = window.location.href;
      const pageTitle = document.title || '';
      const bodyText = document.body ? document.body.innerText : '';

      const headings = Array.from(document.querySelectorAll('h1, h2, h3, [role="heading"]'))
        .map(h => h.textContent.trim())
        .filter(Boolean);

      const alerts = Array.from(
        document.querySelectorAll('[role="alert"], .alert, .error, .alert-danger, .alert-success, .success, .status-message, .badge')
      )
        .map(a => a.textContent.trim())
        .filter(Boolean);

      const urlTransitioned = url !== origUrl && !url.includes('about:blank');
      const inputCount = document.querySelectorAll('input:not([type="hidden"]), select, textarea').length;
      const domStateHash = `${url}|${headings.join(';')}|${alerts.join(';')}|inputs:${inputCount}`;

      return {
        url,
        pageTitle,
        bodyText,
        headings,
        alerts,
        domStateHash,
        urlTransitioned,
        inputCount
      };
    }, preSubmitUrl);

    return observation;
  }

  _detectSignals(observation, { preSubmitUrl, customSuccessPatterns = [], customErrorPatterns = [] }) {
    const signalsDetected = [];
    const errorSignals = [];

    let confirmationHeading = null;
    let confirmationText = null;

    const lowerUrl = (observation.url || '').toLowerCase();
    const lowerTitle = (observation.pageTitle || '').toLowerCase();
    const fullText = (observation.bodyText || '').toLowerCase();
    const allHeadings = observation.headings || [];
    const allAlerts = observation.alerts || [];

    // 1. SUCCESS_PAGE Signal (Headings & Titles)
    const successPageRegex = /application.*submitted|submission.*successful|thank.*you|confirmation|application.*received|success|application.*complete/i;
    for (const h of allHeadings) {
      if (successPageRegex.test(h)) {
        signalsDetected.push(SubmissionSignalType.SUCCESS_PAGE);
        confirmationHeading = h;
        break;
      }
    }
    if (!confirmationHeading && (successPageRegex.test(lowerTitle) || successPageRegex.test(lowerUrl))) {
      signalsDetected.push(SubmissionSignalType.SUCCESS_PAGE);
      confirmationHeading = observation.pageTitle;
    }

    // 2. CONFIRMATION_TEXT Signal
    const confirmationPhrases = [
      /your application has been (?:successfully )?submitted/i,
      /we have received your application/i,
      /your submission is complete/i,
      /application received successfully/i,
      /thank you for (?:submitting|your application)/i,
      /acknowledgement receipt/i,
      /successfully submitted/i
    ];

    for (const pattern of confirmationPhrases) {
      const match = fullText.match(pattern);
      if (match) {
        signalsDetected.push(SubmissionSignalType.CONFIRMATION_TEXT);
        confirmationText = match[0];
        break;
      }
    }

    // Check custom success patterns
    for (const pat of customSuccessPatterns) {
      const r = typeof pat === 'string' ? new RegExp(pat, 'i') : pat;
      if (r.test(fullText)) {
        signalsDetected.push(SubmissionSignalType.CONFIRMATION_TEXT);
      }
    }

    // 3. URL_TRANSITION Signal
    const isSuccessUrl =
      observation.urlTransitioned &&
      /confirmation|success|submitted|receipt|ack|complete|thank-you/i.test(lowerUrl);

    if (isSuccessUrl) {
      signalsDetected.push(SubmissionSignalType.URL_TRANSITION);
    }

    // 4. DOM_STATE Signal (Form replaced by receipt / status view)
    if (observation.inputCount !== undefined && observation.inputCount === 0 && observation.urlTransitioned) {
      signalsDetected.push(SubmissionSignalType.DOM_STATE);
    }

    // 5. ERROR SIGNALS Detection
    const fatalErrorRegexes = [
      /submission failed/i,
      /validation error/i,
      /please fix the errors/i,
      /invalid.*(?:document|input|field|format)/i,
      /something went wrong/i,
      /internal server error/i,
      /error 500/i,
      /failed to submit/i,
      /payment failed/i,
      /transaction declined/i
    ];

    for (const alert of allAlerts) {
      for (const errPat of fatalErrorRegexes) {
        if (errPat.test(alert)) {
          errorSignals.push(alert);
          break;
        }
      }
    }

    for (const errPat of fatalErrorRegexes) {
      if (errPat.test(fullText)) {
        const match = fullText.match(errPat);
        if (match && !errorSignals.includes(match[0])) {
          errorSignals.push(match[0]);
        }
      }
    }

    // Error URLs
    if (/error|fail|invalid|500|net::err/i.test(lowerUrl)) {
      errorSignals.push(`Error URL navigated: ${lowerUrl}`);
    }

    return {
      signalsDetected: Array.from(new Set(signalsDetected)),
      errorSignals: Array.from(new Set(errorSignals)),
      confirmationHeading,
      confirmationText
    };
  }

  _extractAndVerifyReferenceNumber(observation) {
    const textToScan = `${observation.headings?.join(' ')} ${observation.alerts?.join(' ')} ${observation.bodyText || ''}`;

    const reservedWords = new Set([
      'NUMBER', 'DETAILS', 'SUBMITTED', 'SUCCESS', 'CONFIRMATION',
      'STUDENT', 'FAILED', 'APPLICATION', 'REFERENCE', 'SUBMISSION',
      'REGISTRATION', 'ACKNOWLEDGEMENT', 'TRACKING', 'RECEIPT'
    ]);

    // Priority 1: Explicit labeled reference numbers (e.g., Application Reference: APP-2026-987654)
    const labeledRegex = /\b(?:application|reference|acknowledgement|tracking|registration|file|app)(?:\s+(?:reference|no|number|id|ref|code))*\s*(?:is\s*)?[:#=-]\s*([A-Z0-9][A-Z0-9\-_]{2,32})/gi;
    for (const match of textToScan.matchAll(labeledRegex)) {
      const candidate = match[1]?.trim();
      if (
        candidate &&
        candidate.length >= 4 &&
        /\d/.test(candidate) &&
        !reservedWords.has(candidate.toUpperCase())
      ) {
        return { referenceNumber: candidate, confidence: 0.99 };
      }
    }

    // Priority 2: Structured IDs like APP-2026-987654 or REF-2026-NODOWNLOAD-1122
    const structuredRegex = /\b([A-Z]{2,5}(?:[-_][A-Z0-9]+){1,4})\b/g;
    for (const match of textToScan.matchAll(structuredRegex)) {
      const candidate = match[1]?.trim();
      if (
        candidate &&
        candidate.length >= 5 &&
        /\d/.test(candidate) &&
        !reservedWords.has(candidate.toUpperCase())
      ) {
        return { referenceNumber: candidate, confidence: 0.95 };
      }
    }

    // Priority 3: Fallback single-pattern check
    const fallbackRegex = /\b(APP[-_]?\d{4,12})\b/i;
    const fallbackMatch = textToScan.match(fallbackRegex);
    if (fallbackMatch && fallbackMatch[1]) {
      return { referenceNumber: fallbackMatch[1].trim(), confidence: 0.90 };
    }

    return { referenceNumber: null, confidence: 0 };
  }

  async _captureReceiptEvidence(page, observation) {
    if (!page) {
      return { receipt: { available: false, reason: 'NO_PAGE_INSTANCE' }, receiptScreenshot: null };
    }

    let receipt = {
      available: false,
      receiptUrl: null,
      receiptFilename: null,
      receiptType: null,
      receiptSummary: null,
      capturedAt: new Date().toISOString(),
      reason: 'NO_RECEIPT_DOWNLOAD_FOUND'
    };

    // 1. Search for downloadable receipt elements
    try {
      const downloadLink = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('a[href*="download"], a[href*="receipt"], a[href*="acknowledgement"], a[href*=".pdf"], a[download], button'));
        for (const el of elements) {
          const href = el.getAttribute('href') || el.href || '';
          const text = (el.textContent || '').trim();
          const isButtonMatch =
            el.tagName === 'BUTTON' &&
            (/download.*receipt/i.test(text) || /print/i.test(text) || /receipt/i.test(text));

          if ((href && !href.startsWith('javascript:')) || isButtonMatch) {
            return {
              href: el.href || href || 'https://applier.ai/receipt/download',
              text,
              isPdf: href.toLowerCase().endsWith('.pdf') || text.toLowerCase().includes('pdf')
            };
          }
        }
        return null;
      });

      if (downloadLink) {
        receipt = {
          available: true,
          receiptUrl: downloadLink.href,
          receiptFilename: `receipt_${crypto.randomUUID().slice(0, 6)}.${downloadLink.isPdf ? 'pdf' : 'html'}`,
          receiptType: downloadLink.isPdf ? 'PDF' : 'HTML',
          receiptSummary: downloadLink.text || 'Official Application Receipt',
          capturedAt: new Date().toISOString()
        };
      }
    } catch (_) {}

    // 2. Capture receipt screenshot (Never rely on screenshot alone)
    let receiptScreenshot = null;
    try {
      if (typeof page.screenshot === 'function') {
        const buf = await page.screenshot({ fullPage: true }).catch(() => null);
        if (buf) {
          receiptScreenshot = buf.toString('base64');
        }
      }
    } catch (_) {}

    return { receipt, receiptScreenshot };
  }

  _determineFinalStatus({
    signalsDetected,
    errorSignals,
    referenceNumber,
    isTimeout,
    submitError,
    observation,
    preSubmitUrl
  }) {
    // 1. Fatal Error Signals
    if (errorSignals && errorSignals.length > 0) {
      return {
        submissionStatus: SubmissionStatus.SUBMISSION_FAILED,
        confidence: 0.95,
        requiresHumanReview: true
      };
    }

    // 2. Timeout
    if (isTimeout && signalsDetected.length === 0) {
      return {
        submissionStatus: SubmissionStatus.SUBMISSION_TIMEOUT,
        confidence: 0.90,
        requiresHumanReview: true
      };
    }

    // 3. Clear Success
    // Strong signals: (Confirmation text OR Success page OR Reference number) AND no error signals
    const hasStrongSuccessSignals =
      signalsDetected.includes(SubmissionSignalType.CONFIRMATION_TEXT) ||
      (signalsDetected.includes(SubmissionSignalType.SUCCESS_PAGE) && referenceNumber) ||
      (signalsDetected.length >= 2 && referenceNumber);

    if (hasStrongSuccessSignals) {
      return {
        submissionStatus: SubmissionStatus.SUBMITTED,
        confidence: referenceNumber ? 0.99 : 0.92,
        requiresHumanReview: false
      };
    }

    // 4. Ambiguity Protocol:
    // If submission status is ambiguous -> DO NOT claim success.
    // Move to: SUBMISSION_UNCERTAIN and require recovery / human review.
    return {
      submissionStatus: SubmissionStatus.SUBMISSION_UNCERTAIN,
      confidence: 0.40,
      requiresHumanReview: true
    };
  }

  _createDuplicateResult({ applicationId, jobId, existingRecord, page }) {
    const ref = existingRecord.referenceNumber || existingRecord.applicationNumber || 'APP_ALREADY_VERIFIED';
    return {
      schemaVersion: '2.0.0',
      submissionId: `sub_${crypto.randomUUID()}`,
      applicationId: String(applicationId),
      jobId: String(jobId),
      submissionStatus: SubmissionStatus.SUBMISSION_DUPLICATE_BLOCKED,
      submittedAt: existingRecord.submittedAt ? new Date(existingRecord.submittedAt).toISOString() : new Date().toISOString(),
      referenceNumber: ref,
      confirmationUrl: existingRecord.confirmationUrl || (page && typeof page.url === 'function' ? page.url() : 'about:blank'),
      receipt: existingRecord.receipt || null,
      receiptScreenshot: existingRecord.receiptScreenshot || null,
      finalPageEvidence: {
        url: existingRecord.confirmationUrl || 'about:blank',
        pageTitle: 'Duplicate Submission Guard',
        confirmationHeading: 'Application Already Submitted',
        confirmationText: `Application ${ref} was previously submitted and verified. Duplicate submission blocked.`,
        signalsDetected: [SubmissionSignalType.APPLICATION_NUMBER],
        errorSignals: ['DUPLICATE_SUBMISSION_ATTEMPT'],
        urlTransitioned: false,
        domStateHash: 'duplicate_blocked'
      },
      confidence: 1.0,
      requiresHumanReview: false
    };
  }

  _createFailedResult({ applicationId, jobId, page, reason, errorSignal }) {
    const currentUrl = page && typeof page.url === 'function' ? page.url() : 'about:blank';
    return {
      schemaVersion: '2.0.0',
      submissionId: `sub_${crypto.randomUUID()}`,
      applicationId: String(applicationId),
      jobId: String(jobId),
      submissionStatus: SubmissionStatus.SUBMISSION_FAILED,
      submittedAt: new Date().toISOString(),
      referenceNumber: null,
      confirmationUrl: currentUrl,
      receipt: null,
      receiptScreenshot: null,
      finalPageEvidence: {
        url: currentUrl,
        pageTitle: 'Submission Failed',
        confirmationHeading: null,
        confirmationText: null,
        signalsDetected: [],
        errorSignals: [errorSignal || reason],
        urlTransitioned: false,
        domStateHash: 'failed_hash'
      },
      confidence: 0.95,
      requiresHumanReview: true
    };
  }

  async _persistToDatabase(resultRecord, context = {}) {
    try {
      const AppModel = await this._getApplicationModel();
      if (AppModel && resultRecord.applicationId) {
        const appStatus =
          resultRecord.submissionStatus === SubmissionStatus.SUBMITTED
            ? ApplicationStatus.SUBMITTED
            : resultRecord.submissionStatus === SubmissionStatus.SUBMISSION_UNCERTAIN
            ? ApplicationStatus.SUBMISSION_UNCERTAIN
            : ApplicationStatus.SUBMISSION_FAILED;

        await AppModel.findOneAndUpdate(
          { _id: resultRecord.applicationId },
          {
            status: appStatus,
            submissionStatus: resultRecord.submissionStatus,
            applicationNumber: resultRecord.referenceNumber,
            referenceNumber: resultRecord.referenceNumber,
            confirmationUrl: resultRecord.confirmationUrl,
            receiptUrl: resultRecord.receipt?.receiptUrl || null,
            receipt: resultRecord.receipt,
            receiptScreenshot: resultRecord.receiptScreenshot,
            finalPageEvidence: resultRecord.finalPageEvidence,
            submittedAt: new Date(resultRecord.submittedAt),
            completedAt: resultRecord.submissionStatus === SubmissionStatus.SUBMITTED ? new Date() : null
          },
          { upsert: true, returnDocument: 'after' }
        ).catch(() => {});
      }
    } catch (_) {}
  }
}

export const defaultVerifiedSubmissionEngine = new VerifiedSubmissionEngine();
export default VerifiedSubmissionEngine;
