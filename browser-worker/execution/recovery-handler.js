/**
 * Recovery Handler Engine
 * Applier 2.0 — Phase 10: Observe → Plan → Act → Verify Execution Engine
 *
 * Invoked when ActionVerifier fails.
 * "If verification fails: do not blindly continue. Send to recovery."
 *
 * Strategies:
 * 1. Clear & re-type (handles masked / reactive inputs)
 * 2. DOM Event Dispatch fallback (bypasses virtual DOM event capture barriers)
 * 3. Dynamic DOM Re-observation & Semantic Locator Re-resolution (for changed DOM / dynamic IDs)
 * 4. Value Format Normalization (for validation errors)
 * 5. Safe Abort / Pause with complete diagnostic evidence
 */

import { RecoveryStrategy, ActionVerificationStatus } from '../../shared/enums/index.js';
import { defaultRuntimeLocatorResolver } from '../locator/runtime-locator.resolver.js';

export class RecoveryHandler {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries ?? 2;
    this.locatorResolver = options.locatorResolver || defaultRuntimeLocatorResolver;
  }

  /**
   * Primary recovery entrypoint.
   */
  async handleFailure({
    page,
    step,
    verificationResult,
    attempt = 1,
    actionVerifier,
    executeActionFn
  }) {
    const errorType = verificationResult?.error || 'UNKNOWN_VERIFICATION_FAILURE';

    // 1. Terminal Rejection Checks (Cannot be blindly retried)
    if (errorType === 'UPLOAD_REJECTED') {
      return {
        recovered: false,
        strategy: RecoveryStrategy.ABORT,
        reason: 'File upload was rejected by portal validation rules. Manual review required.',
        error: errorType,
        verificationResult
      };
    }

    if (attempt > this.maxRetries) {
      return {
        recovered: false,
        strategy: RecoveryStrategy.ABORT,
        reason: `Exceeded maximum recovery attempts (${this.maxRetries}) for error "${errorType}".`,
        error: 'MAX_RETRIES_EXCEEDED',
        verificationResult
      };
    }

    // 2. Route Recovery by Failure Mode
    switch (errorType) {
      case 'FILL_VALUE_MISMATCH':
      case 'ELEMENT_READ_ERROR':
        return await this._recoverFailedFill({
          page,
          step,
          attempt,
          actionVerifier,
          executeActionFn
        });

      case 'LOCATOR_NOT_FOUND':
      case 'LOCATOR_UNAVAILABLE':
      case 'STALE_ELEMENT':
      case 'DOM_CHANGED':
        return await this._recoverChangedDom({
          page,
          step,
          attempt,
          actionVerifier,
          executeActionFn
        });

      case 'VALIDATION_ERROR':
        return await this._recoverValidationError({
          page,
          step,
          attempt,
          verificationResult,
          actionVerifier,
          executeActionFn
        });

      case 'NAVIGATION_FAILED':
        return await this._recoverNavigationFailure({
          page,
          step,
          attempt,
          actionVerifier,
          executeActionFn
        });

      default:
        // Generic retry
        return await this._genericRetry({
          page,
          step,
          attempt,
          actionVerifier,
          executeActionFn
        });
    }
  }

  /**
   * Recovers a failed fill action.
   */
  async _recoverFailedFill({ page, step, attempt, actionVerifier, executeActionFn }) {
    const targetSel = step.selector;
    const value = String(step.value ?? '');

    // Strategy A (Attempt 1): Focus, select all, clear, and press sequentially
    if (attempt === 1 && targetSel) {
      try {
        const locator = page.locator(targetSel).first();
        if ((await locator.count()) > 0) {
          await locator.click();
          await page.keyboard.press('Control+A');
          await page.keyboard.press('Backspace');
          await page.waitForTimeout(100);
          await locator.pressSequentially(value, { delay: 20 });
          await page.waitForTimeout(200);

          const verifyRes = await actionVerifier.verify({
            page,
            actionType: 'fill',
            stepIndex: step.stepIndex,
            target: targetSel,
            expected: value,
            options: { locator, recoveryAttempted: true, recoveryOutcome: 'CLEAR_AND_RETYPE' }
          });

          if (verifyRes.passed) {
            return {
              recovered: true,
              strategy: RecoveryStrategy.CLEAR_AND_RETYPE,
              attempt,
              verificationResult: { ...verifyRes, status: ActionVerificationStatus.RECOVERED }
            };
          }
        }
      } catch (_) {}
    }

    // Strategy B (Attempt 2): Direct DOM evaluation and event dispatch
    try {
      await page.evaluate(
        ({ sel, val }) => {
          const el = document.querySelector(sel);
          if (el) {
            el.focus();
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
              el.value = val;
            } else if (el.isContentEditable || el.getAttribute('role') === 'textbox') {
              el.textContent = val;
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
          }
        },
        { sel: targetSel, val: value }
      );
      await page.waitForTimeout(200);

      const verifyRes = await actionVerifier.verify({
        page,
        actionType: 'fill',
        stepIndex: step.stepIndex,
        target: targetSel,
        expected: value,
        options: { recoveryAttempted: true, recoveryOutcome: 'DOM_DISPATCH' }
      });

      if (verifyRes.passed) {
        return {
          recovered: true,
          strategy: RecoveryStrategy.DOM_DISPATCH,
          attempt,
          verificationResult: { ...verifyRes, status: ActionVerificationStatus.RECOVERED }
        };
      }
    } catch (_) {}

    return {
      recovered: false,
      strategy: RecoveryStrategy.ABORT,
      reason: `Fill recovery exhausted all strategies for field "${step.field || targetSel}".`,
      error: 'FILL_RECOVERY_EXHAUSTED'
    };
  }

  /**
   * Recovers when DOM mutated or selector became stale.
   * Leverages Phase 9 RuntimeLocatorResolver to discover the updated element.
   */
  async _recoverChangedDom({ page, step, attempt, actionVerifier, executeActionFn }) {
    const semanticTarget = step.semanticTarget || step.field;
    if (semanticTarget) {
      try {
        const resolution = await this.locatorResolver.resolveLocator(page, semanticTarget);
        if (resolution && resolution.found && resolution.element) {
          // Re-execute action with newly resolved locator
          step.resolvedLocator = resolution.element;
          if (step.type === 'fill') {
            await this.locatorResolver.resolveAndFill(page, semanticTarget, step.value);
          } else if (step.type === 'click') {
            await resolution.element.click();
          }

          const verifyRes = await actionVerifier.verify({
            page,
            actionType: step.type,
            stepIndex: step.stepIndex,
            target: semanticTarget,
            expected: step.value,
            options: {
              locator: resolution.element,
              recoveryAttempted: true,
              recoveryOutcome: 'RE_RESOLVE_LOCATOR'
            }
          });

          if (verifyRes.passed) {
            return {
              recovered: true,
              strategy: RecoveryStrategy.RE_RESOLVE_LOCATOR,
              attempt,
              verificationResult: { ...verifyRes, status: ActionVerificationStatus.RECOVERED },
              newLocator: resolution
            };
          }
        }
      } catch (_) {}
    }

    return {
      recovered: false,
      strategy: RecoveryStrategy.ABORT,
      reason: `Could not recover changed DOM for target "${semanticTarget || step.selector}".`,
      error: 'CHANGED_DOM_RECOVERY_FAILED'
    };
  }

  /**
   * Recovers from validation errors (e.g. phone formatting, date normalization, trimming).
   */
  async _recoverValidationError({ page, step, attempt, verificationResult, actionVerifier, executeActionFn }) {
    const originalValue = String(step.value ?? '');
    let normalizedValue = originalValue.trim();

    // Normalization heuristic: if numeric/phone format rejected due to spaces or dashes
    if (/[\s\-\(\)]/.test(originalValue) && /\d/.test(originalValue)) {
      normalizedValue = originalValue.replace(/[^\d+]/g, '');
    }

    if (normalizedValue !== originalValue) {
      step.value = normalizedValue;
      try {
        await executeActionFn(step);
        const verifyRes = await actionVerifier.verify({
          page,
          actionType: step.type,
          stepIndex: step.stepIndex,
          target: step.selector,
          expected: normalizedValue,
          options: { recoveryAttempted: true, recoveryOutcome: 'ADAPT_VALUE_FORMAT' }
        });

        if (verifyRes.passed) {
          return {
            recovered: true,
            strategy: RecoveryStrategy.ADAPT_VALUE_FORMAT,
            attempt,
            verificationResult: { ...verifyRes, status: ActionVerificationStatus.RECOVERED },
            normalizedValue
          };
        }
      } catch (_) {}
    }

    return {
      recovered: false,
      strategy: RecoveryStrategy.ABORT,
      reason: `Validation error could not be recovered: ${verificationResult.evidence}`,
      error: 'VALIDATION_ERROR_UNRECOVERABLE',
      verificationResult
    };
  }

  /**
   * Recovers from navigation failure.
   */
  async _recoverNavigationFailure({ page, step, attempt, actionVerifier }) {
    try {
      await page.waitForTimeout(1000);
      await page.goto(step.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const verifyRes = await actionVerifier.verify({
        page,
        actionType: 'navigate',
        stepIndex: step.stepIndex,
        expected: step.url,
        options: { recoveryAttempted: true, recoveryOutcome: 'RETRY' }
      });

      if (verifyRes.passed) {
        return {
          recovered: true,
          strategy: RecoveryStrategy.RETRY,
          attempt,
          verificationResult: { ...verifyRes, status: ActionVerificationStatus.RECOVERED }
        };
      }
    } catch (_) {}

    return {
      recovered: false,
      strategy: RecoveryStrategy.ABORT,
      reason: `Navigation to "${step.url}" failed after retry.`,
      error: 'NAVIGATION_RECOVERY_FAILED'
    };
  }

  /**
   * Generic retry with short backoff.
   */
  async _genericRetry({ page, step, attempt, actionVerifier, executeActionFn }) {
    try {
      await page.waitForTimeout(500 * attempt);
      await executeActionFn(step);
      const verifyRes = await actionVerifier.verify({
        page,
        actionType: step.type,
        stepIndex: step.stepIndex,
        target: step.selector,
        expected: step.value,
        options: { recoveryAttempted: true, recoveryOutcome: 'RETRY' }
      });

      if (verifyRes.passed) {
        return {
          recovered: true,
          strategy: RecoveryStrategy.RETRY,
          attempt,
          verificationResult: { ...verifyRes, status: ActionVerificationStatus.RECOVERED }
        };
      }
    } catch (_) {}

    return {
      recovered: false,
      strategy: RecoveryStrategy.ABORT,
      reason: `Action failed after retry attempt ${attempt}.`,
      error: 'RETRY_EXHAUSTED'
    };
  }
}

export const defaultRecoveryHandler = new RecoveryHandler();
