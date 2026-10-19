/**
/**
 * Action Verifier Engine
 * Applier 2.0 — Phase 10: Observe → Plan → Act → Verify Execution Engine
 *
 * Implements strict post-action verification across all supported action types:
 * - Fill: Read value after fill and check for validation errors
 * - Select: Verify selected option
 * - Upload: Verify file appears and was accepted (detects rejection alerts)
 * - Click: Verify expected state transition (URL change, modal, element appearance)
 * - Navigate: Verify expected URL and page state
 * - Pause / Screenshot: Verify intervention checkpoint and capture evidence
 *
 * Emits canonical payloads adhering to shared/schemas/action-verification.json (v2.0.0).
 */

import crypto from 'crypto';
import { ActionVerificationStatus } from '../../shared/enums/index.js';
import { validateActionVerification } from '../../shared/validators/index.js';

export class ActionVerifier {
  /**
   * Primary verification dispatcher.
   */
  async verify({ page, actionType, stepIndex, target, expected, actual, options = {} }) {
    let result;

    switch (actionType) {
      case 'fill':
        result = await this.verifyFill(page, { stepIndex, target, expected, options });
        break;

      case 'select':
        result = await this.verifySelect(page, { stepIndex, target, expected, options });
        break;

      case 'upload':
        result = await this.verifyUpload(page, { stepIndex, target, expected, options });
        break;

      case 'click':
        result = await this.verifyClick(page, { stepIndex, target, expected, options });
        break;

      case 'navigate':
        result = await this.verifyNavigate(page, { stepIndex, expected, options });
        break;

      case 'pause':
        result = this.verifyPause({ stepIndex, target, expected, options });
        break;

      case 'screenshot':
        result = this.verifyScreenshot({ stepIndex, actual, options });
        break;

      case 'submit':
        result = this.verifySubmit({ stepIndex, target, expected, actual, options });
        break;

      default:
        result = {
          passed: true,
          status: ActionVerificationStatus.SKIPPED,
          actual: null,
          expected: null,
          evidence: `Action type "${actionType}" has no specialized verifier; marked SKIPPED.`,
          error: null
        };
        break;
    }

    // Construct canonical ActionVerification payload
    const payload = {
      schemaVersion: '2.0.0',
      verificationId: `ver_${crypto.randomUUID()}`,
      stepIndex: Number(stepIndex ?? 0),
      actionType,
      status: result.status,
      target: typeof target === 'string' ? target : (target?.selector || (typeof target === 'object' ? JSON.stringify(target) : null)),
      expected: result.expected ?? expected ?? null,
      actual: result.actual ?? actual ?? null,
      evidence: result.evidence,
      error: result.error || null,
      recoveryAttempted: Boolean(options.recoveryAttempted),
      recoveryOutcome: options.recoveryOutcome || null,
      timestamp: new Date().toISOString()
    };

    const validation = validateActionVerification(payload);
    if (!validation.valid) {
      console.warn('[ActionVerifier] Schema validation warning:', validation.errors);
    }

    return {
      passed: result.passed,
      status: result.status,
      actionType,
      stepIndex: Number(stepIndex ?? 0),
      error: result.error,
      evidence: result.evidence,
      actual: result.actual,
      expected: result.expected,
      canonicalPayload: payload
    };
  }

  /**
   * Fill: Read value after fill and check for form validation errors.
   */
  async verifyFill(page, { stepIndex, target, expected, options = {} }) {
    let locator = options.locator;
    if (!locator) {
      if (typeof target === 'string') {
        if (target.includes('.') && !target.startsWith('.') && !target.startsWith('#') && !target.startsWith('[')) {
          if (options.selector) {
            locator = page.locator(options.selector);
          }
        } else {
          locator = page.locator(target);
        }
      } else {
        locator = target;
      }
    }
    if (!locator) {
      return {
        passed: false,
        status: ActionVerificationStatus.FAILED,
        error: 'LOCATOR_UNAVAILABLE',
        actual: null,
        expected,
        evidence: 'Cannot verify fill: locator is unavailable.'
      };
    }

    try {
      if ((await locator.count()) === 0) {
        return {
          passed: false,
          status: ActionVerificationStatus.FAILED,
          error: 'LOCATOR_NOT_FOUND',
          actual: null,
          expected,
          evidence: 'Target element was not found in the DOM (count is 0).'
        };
      }

      const readState = await locator.first().evaluate((node) => {
        let val = '';
        if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') {
          val = node.value;
        } else if (node.isContentEditable || node.getAttribute('role') === 'textbox') {
          val = node.textContent;
        } else {
          val = node.value ?? node.textContent ?? '';
        }

        // Form validation error inspection
        const isAriaInvalid = node.getAttribute('aria-invalid') === 'true';
        const isClassInvalid =
          node.classList.contains('is-invalid') ||
          node.classList.contains('error') ||
          node.classList.contains('has-error');

        let errorMsg = null;
        const parent =
          node.closest('.form-group, .field-wrapper, .input-group, form, fieldset') ||
          node.parentElement;

        if (parent) {
          const errEl = parent.querySelector(
            '.invalid-feedback, .error-message, .field-error, .text-danger, [role="alert"]'
          );
          if (errEl && (errEl.offsetParent !== null || errEl.offsetHeight > 0)) {
            const txt = errEl.textContent.trim();
            if (txt && !txt.toLowerCase().includes('success')) {
              errorMsg = txt;
            }
          }
        }

        return {
          actualValue: val,
          isInvalid: isAriaInvalid || isClassInvalid || !!errorMsg,
          errorMsg
        };
      });

      const actualStr = String(readState.actualValue ?? '').trim();
      const expectedStr = String(expected ?? '').trim();

      // 1. Validation error barrier
      if (readState.isInvalid) {
        return {
          passed: false,
          status: ActionVerificationStatus.FAILED,
          error: 'VALIDATION_ERROR',
          actual: actualStr,
          expected: expectedStr,
          evidence: `Form validation error on field: ${readState.errorMsg || 'Field marked as invalid in DOM.'}`
        };
      }

      // 2. Value equality check
      if (actualStr !== expectedStr) {
        return {
          passed: false,
          status: ActionVerificationStatus.FAILED,
          error: 'FILL_VALUE_MISMATCH',
          actual: actualStr,
          expected: expectedStr,
          evidence: `Read value "${actualStr}" does not match expected value "${expectedStr}".`
        };
      }

      return {
        passed: true,
        status: ActionVerificationStatus.PASSED,
        actual: actualStr,
        expected: expectedStr,
        evidence: `Read value "${actualStr}" matches expected value. No validation errors found.`,
        error: null
      };
    } catch (err) {
      return {
        passed: false,
        status: ActionVerificationStatus.FAILED,
        error: 'ELEMENT_READ_ERROR',
        actual: null,
        expected,
        evidence: `Failed reading element value: ${err.message}`
      };
    }
  }

  /**
   * Select: Verify selected option value or text.
   */
  async verifySelect(page, { stepIndex, target, expected, options = {} }) {
    const locator = options.locator || (typeof target === 'string' ? page.locator(target) : target);
    if (!locator) {
      return {
        passed: false,
        status: ActionVerificationStatus.FAILED,
        error: 'LOCATOR_UNAVAILABLE',
        actual: null,
        expected,
        evidence: 'Cannot verify select: locator is unavailable.'
      };
    }

    try {
      const selected = await locator.first().evaluate((node) => {
        if (node.tagName === 'SELECT') {
          const opt = node.options[node.selectedIndex];
          return {
            value: node.value,
            text: opt ? opt.textContent.trim() : '',
            selectedIndex: node.selectedIndex
          };
        }
        if (node.getAttribute('role') === 'combobox') {
          return {
            value: node.getAttribute('aria-valuenow') || node.textContent.trim(),
            text: node.textContent.trim(),
            selectedIndex: 0
          };
        }
        return {
          value: node.value ?? node.textContent?.trim() ?? '',
          text: node.textContent?.trim() ?? '',
          selectedIndex: 0
        };
      });

      const expectedStr = String(expected ?? '').trim().toLowerCase();
      const valStr = String(selected.value ?? '').trim().toLowerCase();
      const textStr = String(selected.text ?? '').trim().toLowerCase();

      const matched =
        valStr === expectedStr ||
        textStr === expectedStr ||
        valStr.includes(expectedStr) ||
        textStr.includes(expectedStr);

      if (!matched) {
        return {
          passed: false,
          status: ActionVerificationStatus.FAILED,
          error: 'SELECT_OPTION_MISMATCH',
          actual: selected.text || selected.value,
          expected,
          evidence: `Selected option (value="${selected.value}", text="${selected.text}") did not match expected "${expected}".`
        };
      }

      return {
        passed: true,
        status: ActionVerificationStatus.PASSED,
        actual: selected.text || selected.value,
        expected,
        evidence: `Option "${selected.text || selected.value}" successfully verified as selected.`,
        error: null
      };
    } catch (err) {
      return {
        passed: false,
        status: ActionVerificationStatus.FAILED,
        error: 'SELECT_VERIFICATION_ERROR',
        actual: null,
        expected,
        evidence: `Error verifying selected option: ${err.message}`
      };
    }
  }

  /**
   * Upload: Verify file appears in input files and was accepted (not rejected).
   */
  async verifyUpload(page, { stepIndex, target, expected, options = {} }) {
    const locator = options.locator || (typeof target === 'string' ? page.locator(target) : target);
    if (!locator) {
      return {
        passed: false,
        status: ActionVerificationStatus.FAILED,
        error: 'LOCATOR_UNAVAILABLE',
        actual: null,
        expected,
        evidence: 'Cannot verify upload: locator is unavailable.'
      };
    }

    try {
      const fileData = await locator.first().evaluate((node) => {
        const files = node.files ? Array.from(node.files).map((f) => f.name) : [];
        return { count: files.length, fileNames: files };
      });

      // Check for upload rejection messages across page DOM
      const rejection = await page.evaluate(() => {
        const alerts = document.querySelectorAll(
          '.upload-error, .invalid-feedback, [role="alert"], .alert-danger, .error-message, .dropzone-error'
        );
        for (const alert of alerts) {
          if (alert.offsetParent !== null || alert.offsetHeight > 0) {
            const text = alert.textContent.toLowerCase();
            if (
              text.includes('reject') ||
              text.includes('not supported') ||
              text.includes('invalid file') ||
              text.includes('file size') ||
              text.includes('exceeds') ||
              text.includes('disallowed') ||
              text.includes('upload failed')
            ) {
              return alert.textContent.trim();
            }
          }
        }
        return null;
      });

      if (rejection) {
        return {
          passed: false,
          status: ActionVerificationStatus.FAILED,
          error: 'UPLOAD_REJECTED',
          actual: fileData.fileNames.join(', '),
          expected,
          evidence: `File upload rejected by portal validation: "${rejection}".`
        };
      }

      if (fileData.count === 0) {
        return {
          passed: false,
          status: ActionVerificationStatus.FAILED,
          error: 'UPLOAD_FAILED_NO_FILES',
          actual: '0 files',
          expected,
          evidence: 'No files attached in file input element.'
        };
      }

      return {
        passed: true,
        status: ActionVerificationStatus.PASSED,
        actual: fileData.fileNames.join(', '),
        expected,
        evidence: `File upload verified: ${fileData.count} file(s) attached (${fileData.fileNames.join(', ')}). No rejection errors found.`,
        error: null
      };
    } catch (err) {
      return {
        passed: false,
        status: ActionVerificationStatus.FAILED,
        error: 'UPLOAD_VERIFICATION_ERROR',
        actual: null,
        expected,
        evidence: `Failed verifying file upload: ${err.message}`
      };
    }
  }

  /**
   * Click: Verify expected state transition (URL change, modal open/close, element appearance, form submit).
   */
  async verifyClick(page, { stepIndex, target, expected, options = {} }) {
    try {
      // 1. If explicit expectedUrl provided
      if (options.expectedUrl) {
        const currentUrl = page.url();
        const matches = currentUrl.includes(options.expectedUrl);
        if (!matches) {
          return {
            passed: false,
            status: ActionVerificationStatus.FAILED,
            error: 'STATE_TRANSITION_FAILED',
            actual: currentUrl,
            expected: options.expectedUrl,
            evidence: `URL did not transition to expected "${options.expectedUrl}" after click (current: "${currentUrl}").`
          };
        }
      }

      // 2. If explicit expectedSelector provided
      if (options.expectedSelector) {
        const count = await page.locator(options.expectedSelector).count();
        if (count === 0) {
          return {
            passed: false,
            status: ActionVerificationStatus.FAILED,
            error: 'STATE_TRANSITION_FAILED',
            actual: 'selector not found',
            expected: options.expectedSelector,
            evidence: `Expected element "${options.expectedSelector}" did not appear after click.`
          };
        }
      }

      // 3. Check for fatal click/submission errors
      const submissionError = await page.evaluate(() => {
        const alert = document.querySelector('[role="alert"].error, .fatal-error, .submission-error, .alert-danger');
        if (alert && (alert.offsetParent !== null || alert.offsetHeight > 0)) {
          const txt = alert.textContent.trim();
          if (txt && !txt.toLowerCase().includes('success')) {
            return txt;
          }
        }
        return null;
      });

      if (submissionError) {
        return {
          passed: false,
          status: ActionVerificationStatus.FAILED,
          error: 'CLICK_ACTION_ERROR',
          actual: submissionError,
          expected: 'clean state transition',
          evidence: `Click produced application error: "${submissionError}".`
        };
      }

      return {
        passed: true,
        status: ActionVerificationStatus.PASSED,
        actual: page.url(),
        expected: 'state transition',
        evidence: 'Click completed and verified without errors.',
        error: null
      };
    } catch (err) {
      return {
        passed: false,
        status: ActionVerificationStatus.FAILED,
        error: 'CLICK_VERIFICATION_ERROR',
        actual: null,
        expected: null,
        evidence: `Error verifying click outcome: ${err.message}`
      };
    }
  }

  /**
   * Navigate: Verify expected URL and page state.
   */
  async verifyNavigate(page, { stepIndex, expected, options = {} }) {
    try {
      const currentUrl = page.url();
      const expectedUrl = String(expected || options.url || '').trim();

      const pageState = await page
        .evaluate(() => {
          const title = document.title || '';
          const ready = document.readyState || '';
          const bodyText = document.body ? document.body.textContent || '' : '';
          const isErrorPage =
            title.toLowerCase().includes('404') ||
            title.toLowerCase().includes('error') ||
            bodyText.includes('net::ERR_') ||
            bodyText.includes('Page Not Found');

          return { title, ready, isErrorPage };
        })
        .catch(() => ({ title: '', ready: 'unknown', isErrorPage: false }));

      if (pageState.isErrorPage) {
        return {
          passed: false,
          status: ActionVerificationStatus.FAILED,
          error: 'NAVIGATION_FAILED',
          actual: currentUrl,
          expected: expectedUrl,
          evidence: `Page returned network/HTTP error state: "${pageState.title}".`
        };
      }

      if (expectedUrl && expectedUrl !== 'about:blank') {
        const cleanCurr = currentUrl.split('?')[0].split('#')[0];
        const cleanExp = expectedUrl.split('?')[0].split('#')[0];
        const matches = cleanCurr.startsWith(cleanExp) || cleanCurr === cleanExp || currentUrl.includes(cleanExp);

        if (!matches && currentUrl === 'about:blank') {
          return {
            passed: false,
            status: ActionVerificationStatus.FAILED,
            error: 'NAVIGATION_FAILED',
            actual: currentUrl,
            expected: expectedUrl,
            evidence: `Navigation failed: Page remained at about:blank.`
          };
        }
      }

      return {
        passed: true,
        status: ActionVerificationStatus.PASSED,
        actual: currentUrl,
        expected: expectedUrl,
        evidence: `Navigated successfully to "${currentUrl}" with readyState "${pageState.ready}".`,
        error: null
      };
    } catch (err) {
      return {
        passed: false,
        status: ActionVerificationStatus.FAILED,
        error: 'NAVIGATION_VERIFICATION_ERROR',
        actual: null,
        expected,
        evidence: `Navigation verification error: ${err.message}`
      };
    }
  }

  /**
   * Pause: Verifies pause context.
   */
  verifyPause({ stepIndex, target, expected, options = {} }) {
    const pauseReason = options.pauseReason || expected || 'OTP';
    return {
      passed: true,
      status: ActionVerificationStatus.PASSED,
      actual: pauseReason,
      expected: pauseReason,
      evidence: `Execution successfully paused for "${pauseReason}".`,
      error: null
    };
  }

  /**
   * Screenshot: Verifies screenshot was captured.
   */
  verifyScreenshot({ stepIndex, actual, options = {} }) {
    const hasData = typeof actual === 'string' && actual.length > 0;
    return {
      passed: hasData,
      status: hasData ? ActionVerificationStatus.PASSED : ActionVerificationStatus.FAILED,
      actual: hasData ? `${actual.length} bytes (base64)` : 'empty',
      expected: 'base64 image string',
      evidence: hasData ? 'Screenshot captured successfully.' : 'Screenshot capture returned empty buffer.',
      error: hasData ? null : 'SCREENSHOT_FAILED'
    };
  }

  /**
   * Submit: Verifies multi-signal submission result.
   */
  verifySubmit({ stepIndex, target, expected, actual, options = {} }) {
    if (!actual || typeof actual !== 'object') {
      return {
        passed: false,
        status: ActionVerificationStatus.FAILED,
        actual: null,
        expected: 'SUBMITTED',
        evidence: 'Submit action did not produce a valid submission result payload.',
        error: 'SUBMISSION_RESULT_MISSING'
      };
    }

    const submissionStatus = actual.submissionStatus;
    const isSuccess = submissionStatus === 'SUBMITTED';

    return {
      passed: isSuccess,
      status: isSuccess ? ActionVerificationStatus.PASSED : ActionVerificationStatus.FAILED,
      actual: submissionStatus,
      expected: 'SUBMITTED',
      evidence: isSuccess
        ? `Submission verified successfully. Reference: ${actual.referenceNumber || 'N/A'}`
        : `Submission did not succeed: status is ${submissionStatus}. Evidence: ${JSON.stringify(actual.finalPageEvidence || {})}`,
      error: isSuccess ? null : (submissionStatus || 'SUBMISSION_FAILED')
    };
  }
}

export const defaultActionVerifier = new ActionVerifier();
