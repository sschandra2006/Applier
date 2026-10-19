/**
 * Multi-Level Browser Recovery Engine
 * Applier 2.0 — Phase 15: Multi-Level Browser Recovery
 *
 * Implements deterministic and AI-assisted recovery conforming to the
 * 6-level Recovery Tree:
 *
 * Failure
 *  ↓ Level 1: Retry same action
 *  ↓ Level 2: Re-observe
 *  ↓ Level 3: Re-resolve locator
 *  ↓ Retry
 *  ↓ Level 4: Adaptive browser reasoning
 *  ↓ Retry
 *  ↓ Level 5: Refresh/recover session
 *  ↓ Level 6: Human checkpoint
 *
 * Core Guarantees:
 * 1. Strict Classification across all 10 canonical failure types.
 * 2. Immutable User Data Invariant: Recovery must NEVER modify user data silently.
 * 3. Loop Detection & Max Attempts Limit: Prevents cyclical recovery loops.
 * 4. Comprehensive Structured Logging: Every attempt records original action,
 *    failure, strategy, result, attempt, and duration.
 */

import crypto from 'crypto';
import {
  FailureClass,
  RecoveryLevel,
  RecoveryResultStatus
} from '../../shared/enums/index.js';
import { validateRecoveryRecord } from '../../shared/validators/index.js';
import { defaultRuntimeLocatorResolver } from '../locator/runtime-locator.resolver.js';
import { defaultActionVerifier } from './action-verifier.js';

export class MultiLevelRecoveryEngine {
  constructor(options = {}) {
    this.maxAttempts = options.maxAttempts ?? 6;
    this.maxRetriesPerLevel = options.maxRetriesPerLevel ?? 1;
    this.locatorResolver = options.locatorResolver || defaultRuntimeLocatorResolver;
    this.actionVerifier = options.actionVerifier || defaultActionVerifier;
    this.browserManager = options.browserManager || null;
    this.adaptiveReasoningAgent = options.adaptiveReasoningAgent || null;

    // In-memory audit log of all recovery records
    this.recoveryLog = [];
  }

  /**
   * Classifies an arbitrary runtime error, Playwright exception, or verification result
   * into one of the 10 canonical FailureClass values.
   */
  classifyFailure(error, context = {}) {
    if (!error) {
      return {
        type: FailureClass.ELEMENT_MISSING,
        message: 'Unspecified failure occurred',
        evidence: context?.evidence || null
      };
    }

    const errorMsg = typeof error === 'string' ? error : (error.message || String(error));
    const lower = errorMsg.toLowerCase();
    const explicitError = context?.verificationResult?.error || context?.error;

    // 1. Selector failure
    if (
      explicitError === 'SELECTOR_FAILURE' ||
      lower.includes('is not a valid selector') ||
      lower.includes('syntaxerror') ||
      lower.includes('failed to execute queryselector') ||
      lower.includes('unexpected token in selector') ||
      lower.includes('invalid selector')
    ) {
      return {
        type: FailureClass.SELECTOR_FAILURE,
        message: errorMsg,
        evidence: context?.evidence || 'Selector syntax invalid or unsupported'
      };
    }

    // 2. Element missing
    if (
      explicitError === 'LOCATOR_NOT_FOUND' ||
      explicitError === 'ELEMENT_MISSING' ||
      lower.includes('element missing') ||
      lower.includes('no element found') ||
      lower.includes('element not found') ||
      lower.includes('count is 0') ||
      lower.includes('target element does not exist')
    ) {
      return {
        type: FailureClass.ELEMENT_MISSING,
        message: errorMsg,
        evidence: context?.evidence || 'Target element was not found in the DOM'
      };
    }

    // 3. Timeout
    if (
      explicitError === 'TIMEOUT' ||
      lower.includes('timeout') ||
      lower.includes('timeouterror') ||
      lower.includes('waiting for locator') ||
      lower.includes('exceeded') ||
      lower.includes('timed out')
    ) {
      return {
        type: FailureClass.TIMEOUT,
        message: errorMsg,
        evidence: context?.evidence || 'Operation exceeded timeout limit'
      };
    }

    // 4. Navigation failure
    if (
      explicitError === 'NAVIGATION_FAILED' ||
      lower.includes('navigation failure') ||
      lower.includes('navigation failed') ||
      lower.includes('net::err') ||
      lower.includes('cannot navigate') ||
      lower.includes('navigation error') ||
      lower.includes('err_connection')
    ) {
      return {
        type: FailureClass.NAVIGATION_FAILURE,
        message: errorMsg,
        evidence: context?.evidence || 'Page navigation failed or aborted'
      };
    }

    // 5. Session expired
    if (
      explicitError === 'SESSION_EXPIRED' ||
      lower.includes('session expired') ||
      lower.includes('session timeout') ||
      lower.includes('logged out') ||
      lower.includes('login required') ||
      lower.includes('unauthorized') ||
      lower.includes('401') ||
      lower.includes('403') ||
      lower.includes('csrf token')
    ) {
      return {
        type: FailureClass.SESSION_EXPIRED,
        message: errorMsg,
        evidence: context?.evidence || 'Portal session expired or invalidated'
      };
    }

    // 6. Unexpected modal
    if (
      explicitError === 'UNEXPECTED_MODAL' ||
      lower.includes('unexpected modal') ||
      lower.includes('modal') ||
      lower.includes('dialog') ||
      lower.includes('intercepts pointer events') ||
      lower.includes('another element would receive the click') ||
      lower.includes('backdrop') ||
      lower.includes('cookie banner') ||
      lower.includes('overlay')
    ) {
      return {
        type: FailureClass.UNEXPECTED_MODAL,
        message: errorMsg,
        evidence: context?.evidence || 'Unexpected modal or overlay intercepted interaction'
      };
    }

    // 7. Validation failure
    if (
      explicitError === 'VALIDATION_ERROR' ||
      explicitError === 'VALIDATION_FAILURE' ||
      lower.includes('validation failure') ||
      lower.includes('validation error') ||
      lower.includes('invalid format') ||
      lower.includes('required field') ||
      lower.includes('please enter a valid') ||
      lower.includes('constraint') ||
      lower.includes('pattern mismatch')
    ) {
      return {
        type: FailureClass.VALIDATION_FAILURE,
        message: errorMsg,
        evidence: context?.evidence || 'Form field rejected by validation constraints'
      };
    }

    // 8. Upload rejection
    if (
      explicitError === 'UPLOAD_REJECTED' ||
      explicitError === 'UPLOAD_REJECTION' ||
      lower.includes('upload rejection') ||
      lower.includes('upload rejected') ||
      lower.includes('file type not supported') ||
      lower.includes('file too large') ||
      lower.includes('exceeds file size')
    ) {
      return {
        type: FailureClass.UPLOAD_REJECTION,
        message: errorMsg,
        evidence: context?.evidence || 'File upload rejected by portal requirements'
      };
    }

    // 9. Page changed
    if (
      explicitError === 'DOM_CHANGED' ||
      explicitError === 'PAGE_CHANGED' ||
      lower.includes('page changed') ||
      lower.includes('dom changed') ||
      lower.includes('stale element reference') ||
      lower.includes('node is detached from document') ||
      lower.includes('url changed') ||
      lower.includes('route changed')
    ) {
      return {
        type: FailureClass.PAGE_CHANGED,
        message: errorMsg,
        evidence: context?.evidence || 'Page structure or route mutated dynamically'
      };
    }

    // 10. Browser crash
    if (
      explicitError === 'BROWSER_CRASH' ||
      lower.includes('browser crash') ||
      lower.includes('targetclosederror') ||
      lower.includes('browser has been closed') ||
      lower.includes('connection closed') ||
      lower.includes('crashed') ||
      lower.includes('target page, context or browser has been closed')
    ) {
      return {
        type: FailureClass.BROWSER_CRASH,
        message: errorMsg,
        evidence: context?.evidence || 'Browser process crashed or closed unexpectedly'
      };
    }

    // Default fallback: element missing
    return {
      type: FailureClass.ELEMENT_MISSING,
      message: errorMsg,
      evidence: context?.evidence || 'Element interaction failed'
    };
  }

  /**
   * Main recovery entrypoint: Traverses the deterministic and AI-assisted Recovery Tree.
   */
  async recover({
    page,
    action,
    error,
    verificationResult = null,
    step = {},
    executeActionFn = async () => {},
    maxAttempts = null
  }) {
    const totalMaxAttempts = maxAttempts || this.maxAttempts;
    const failure = this.classifyFailure(error || verificationResult?.error, {
      verificationResult,
      step
    });

    // Enforce Safety Invariant: Original user data must NEVER be mutated
    const originalActionSnapshot = JSON.parse(JSON.stringify(action || {}));
    const originalValue = originalActionSnapshot.value;

    let attempt = 0;
    const history = [];

    // Helper: Detect loop or repeating strategy cycle
    const detectLoop = (strategy) => {
      const recentSame = history.filter(h => h.strategy === strategy && h.failureType === failure.type);
      return recentSame.length >= 2;
    };

    // Helper: Record and validate structured recovery log entry
    const recordLog = ({ strategy, result, duration, details = {} }) => {
      // Strictly enforce invariant: user data must not be modified
      if (originalValue !== undefined && action.value !== originalValue) {
        throw new Error('DataInvariantViolation: Recovery must never modify user data silently');
      }

      const logEntry = {
        schemaVersion: '2.0.0',
        recoveryId: `rec_${crypto.randomUUID()}`,
        timestamp: new Date().toISOString(),
        originalAction: {
          type: originalActionSnapshot.type || 'unknown',
          target: originalActionSnapshot.target || originalActionSnapshot.selector || step.field || 'target',
          value: originalValue,
          url: originalActionSnapshot.url || step.url,
          stepIndex: step.stepIndex ?? 0
        },
        failure: {
          type: failure.type,
          message: failure.message,
          evidence: failure.evidence
        },
        strategy,
        result,
        attempt,
        duration: Math.max(0, Math.round(duration)),
        dataModified: false,
        details
      };

      const validation = validateRecoveryRecord(logEntry);
      if (!validation.valid) {
        console.warn('[MultiLevelRecovery] Log validation warning:', validation.errors);
      }

      this.recoveryLog.push(logEntry);
      history.push({ strategy, failureType: failure.type, result });
      return logEntry;
    };

    // Fast-path routing for immediate terminal/specialized failures:
    // Upload rejection is a portal constraint that cannot be brute-forced -> directly to Human Checkpoint
    if (failure.type === FailureClass.UPLOAD_REJECTION) {
      attempt++;
      const startTime = performance.now();
      const checkpoint = await this._createHumanCheckpoint({
        page,
        action,
        failure,
        step,
        pauseReason: 'MANUAL_REVIEW',
        reason: 'File upload was rejected by portal validation constraints'
      });
      const log = recordLog({
        strategy: RecoveryLevel.HUMAN_CHECKPOINT,
        result: RecoveryResultStatus.CHECKPOINT_CREATED,
        duration: performance.now() - startTime,
        details: { checkpointId: checkpoint.checkpointId, reason: checkpoint.reason }
      });

      return {
        recovered: false,
        strategy: RecoveryLevel.HUMAN_CHECKPOINT,
        failureType: failure.type,
        checkpoint,
        log,
        attempts: attempt
      };
    }

    // ─────────────────────────────────────────────────────────────
    // LEVEL 1: RETRY SAME ACTION
    // (Bypassed if failure is BROWSER_CRASH or SESSION_EXPIRED)
    // ─────────────────────────────────────────────────────────────
    const isLevel1Eligible = failure.type !== FailureClass.BROWSER_CRASH && failure.type !== FailureClass.SESSION_EXPIRED;
    if (isLevel1Eligible && attempt < totalMaxAttempts && !detectLoop(RecoveryLevel.RETRY_SAME_ACTION)) {
      attempt++;
      const startTime = performance.now();

      try {
        if (page && typeof page.waitForTimeout === 'function') {
          await page.waitForTimeout(100);
        }
        await executeActionFn(action);

        if (originalValue !== undefined && action.value !== originalValue) {
          throw new Error('DataInvariantViolation: Recovery must never modify user data silently');
        }

        const verify = await this._verifyAction(page, action, step);
        const duration = performance.now() - startTime;

        if (verify.passed) {
          const log = recordLog({
            strategy: RecoveryLevel.RETRY_SAME_ACTION,
            result: RecoveryResultStatus.SUCCESS,
            duration
          });
          return { recovered: true, strategy: RecoveryLevel.RETRY_SAME_ACTION, log, attempts: attempt };
        } else {
          recordLog({
            strategy: RecoveryLevel.RETRY_SAME_ACTION,
            result: RecoveryResultStatus.ESCALATED,
            duration,
            details: { reason: 'Immediate retry did not resolve failure' }
          });
        }
      } catch (lvl1Err) {
        if (lvl1Err.message && lvl1Err.message.includes('DataInvariantViolation')) {
          throw lvl1Err;
        }
        recordLog({
          strategy: RecoveryLevel.RETRY_SAME_ACTION,
          result: RecoveryResultStatus.ESCALATED,
          duration: performance.now() - startTime,
          details: { error: lvl1Err.message }
        });
      }
    }

    // ─────────────────────────────────────────────────────────────
    // LEVEL 2: RE-OBSERVE
    // ─────────────────────────────────────────────────────────────
    const isLevel2Eligible = failure.type !== FailureClass.BROWSER_CRASH && failure.type !== FailureClass.SESSION_EXPIRED;
    if (isLevel2Eligible && attempt < totalMaxAttempts && !detectLoop(RecoveryLevel.RE_OBSERVE)) {
      attempt++;
      const startTime = performance.now();

      try {
        let isFulfilled = false;
        if (page) {
          if (typeof page.waitForLoadState === 'function') {
            await page.waitForLoadState('domcontentloaded').catch(() => {});
          }

          if (action.type === 'navigate' && step.url) {
            const currentUrl = page.url ? page.url() : '';
            if (currentUrl.includes(step.url)) isFulfilled = true;
          } else if (action.type === 'fill' && (action.selector || action.target)) {
            const currentVal = await this._readInputValue(page, action.target || action.selector);
            if (currentVal === String(action.value ?? '')) isFulfilled = true;
          }
        }

        const duration = performance.now() - startTime;
        if (isFulfilled) {
          const log = recordLog({
            strategy: RecoveryLevel.RE_OBSERVE,
            result: RecoveryResultStatus.SUCCESS,
            duration,
            details: { reason: 'Action fulfilled upon re-observing settled state' }
          });
          return { recovered: true, strategy: RecoveryLevel.RE_OBSERVE, log, attempts: attempt };
        } else {
          recordLog({
            strategy: RecoveryLevel.RE_OBSERVE,
            result: RecoveryResultStatus.ESCALATED,
            duration,
            details: { reason: 'DOM re-observed, condition still unfulfilled' }
          });
        }
      } catch (lvl2Err) {
        if (lvl2Err.message && lvl2Err.message.includes('DataInvariantViolation')) {
          throw lvl2Err;
        }
        recordLog({
          strategy: RecoveryLevel.RE_OBSERVE,
          result: RecoveryResultStatus.ESCALATED,
          duration: performance.now() - startTime,
          details: { error: lvl2Err.message }
        });
      }
    }

    // ─────────────────────────────────────────────────────────────
    // LEVEL 3: RE-RESOLVE LOCATOR
    // ─────────────────────────────────────────────────────────────
    const isLevel3Eligible = failure.type !== FailureClass.BROWSER_CRASH && failure.type !== FailureClass.SESSION_EXPIRED;
    if (isLevel3Eligible && attempt < totalMaxAttempts && !detectLoop(RecoveryLevel.RE_RESOLVE_LOCATOR)) {
      attempt++;
      const startTime = performance.now();

      try {
        const semanticTarget = step.semanticTarget || action.semanticTarget || step.field || (action.target && action.target.includes('.') ? action.target : null) || action.target || action.selector;
        let resolvedNewLocator = null;

        if (this.locatorResolver && page && semanticTarget) {
          const resolution = await this.locatorResolver.resolveLocator(page, semanticTarget);
          if (resolution && resolution.found && resolution.element) {
            resolvedNewLocator = resolution;
            action.resolvedLocator = resolution.element;

            // Re-attempt action with newly resolved locator
            if (action.type === 'fill' && typeof resolution.element.fill === 'function') {
              await resolution.element.fill(String(action.value ?? ''));
            } else if (action.type === 'click' && typeof resolution.element.click === 'function') {
              await resolution.element.click();
            } else {
              await executeActionFn(action);
            }

            if (originalValue !== undefined && action.value !== originalValue) {
              throw new Error('DataInvariantViolation: Recovery must never modify user data silently');
            }

            const verify = await this._verifyAction(page, action, step);
            const duration = performance.now() - startTime;

            if (verify.passed) {
              const log = recordLog({
                strategy: RecoveryLevel.RE_RESOLVE_LOCATOR,
                result: RecoveryResultStatus.SUCCESS,
                duration,
                details: { resolvedStrategy: resolution.strategy, confidence: resolution.confidence }
              });
              return {
                recovered: true,
                strategy: RecoveryLevel.RE_RESOLVE_LOCATOR,
                newLocator: resolution,
                log,
                attempts: attempt
              };
            }
          }
        }

        recordLog({
          strategy: RecoveryLevel.RE_RESOLVE_LOCATOR,
          result: RecoveryResultStatus.ESCALATED,
          duration: performance.now() - startTime,
          details: { reason: 'Locator re-resolution failed or did not pass verification' }
        });
      } catch (lvl3Err) {
        if (lvl3Err.message && lvl3Err.message.includes('DataInvariantViolation')) {
          throw lvl3Err;
        }
        recordLog({
          strategy: RecoveryLevel.RE_RESOLVE_LOCATOR,
          result: RecoveryResultStatus.ESCALATED,
          duration: performance.now() - startTime,
          details: { error: lvl3Err.message }
        });
      }
    }

    // ─────────────────────────────────────────────────────────────
    // LEVEL 4: ADAPTIVE BROWSER REASONING
    // ─────────────────────────────────────────────────────────────
    const isLevel4Eligible = failure.type !== FailureClass.BROWSER_CRASH && failure.type !== FailureClass.SESSION_EXPIRED;
    if (isLevel4Eligible && attempt < totalMaxAttempts && !detectLoop(RecoveryLevel.ADAPTIVE_REASONING)) {
      attempt++;
      const startTime = performance.now();

      try {
        let adaptiveResolution = null;

        // 1. Detect & dismiss unexpected modals/overlays if present
        if (page && (failure.type === FailureClass.UNEXPECTED_MODAL || failure.type === FailureClass.ELEMENT_MISSING)) {
          const modalDismissed = await this._dismissUnexpectedModal(page);
          if (modalDismissed) {
            adaptiveResolution = { actionTaken: 'DISMISSED_MODAL', selector: modalDismissed };
          }
        }

        // 2. Call external adaptive reasoning agent if registered
        if (!adaptiveResolution && this.adaptiveReasoningAgent) {
          adaptiveResolution = await this.adaptiveReasoningAgent.reasonAndAdapt({
            page,
            action,
            failure,
            step
          });
        }

        // 3. Fallback heuristic: Scroll into view
        if (!adaptiveResolution && page && (action.target || action.selector)) {
          try {
            await page.evaluate((sel) => {
              const el = document.querySelector(sel);
              if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
            }, action.target || action.selector);
            adaptiveResolution = { actionTaken: 'SCROLL_INTO_VIEW' };
          } catch (_) {}
        }

        // Re-attempt action after adaptive intervention
        await executeActionFn(action);

        if (originalValue !== undefined && action.value !== originalValue) {
          throw new Error('DataInvariantViolation: Recovery must never modify user data silently');
        }

        const verify = await this._verifyAction(page, action, step);
        const duration = performance.now() - startTime;

        if (verify.passed) {
          const log = recordLog({
            strategy: RecoveryLevel.ADAPTIVE_REASONING,
            result: RecoveryResultStatus.SUCCESS,
            duration,
            details: adaptiveResolution || {}
          });
          return {
            recovered: true,
            strategy: RecoveryLevel.ADAPTIVE_REASONING,
            adaptation: adaptiveResolution,
            log,
            attempts: attempt
          };
        } else {
          recordLog({
            strategy: RecoveryLevel.ADAPTIVE_REASONING,
            result: RecoveryResultStatus.ESCALATED,
            duration,
            details: { reason: 'Adaptive reasoning applied but action still unverified' }
          });
        }
      } catch (lvl4Err) {
        if (lvl4Err.message && lvl4Err.message.includes('DataInvariantViolation')) {
          throw lvl4Err;
        }
        recordLog({
          strategy: RecoveryLevel.ADAPTIVE_REASONING,
          result: RecoveryResultStatus.ESCALATED,
          duration: performance.now() - startTime,
          details: { error: lvl4Err.message }
        });
      }
    }

    // ─────────────────────────────────────────────────────────────
    // LEVEL 5: REFRESH / RECOVER SESSION
    // ─────────────────────────────────────────────────────────────
    if (attempt < totalMaxAttempts && !detectLoop(RecoveryLevel.REFRESH_SESSION)) {
      attempt++;
      const startTime = performance.now();

      try {
        let sessionRecovered = false;

        // If browser crashed, trigger session reconstruction
        if (failure.type === FailureClass.BROWSER_CRASH && this.browserManager) {
          const newSession = await this.browserManager.recoverSession({ step, action });
          if (newSession && newSession.page) {
            page = newSession.page;
            sessionRecovered = true;
          }
        } else if (page && typeof page.reload === 'function') {
          // General session refresh / reload
          await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
          if (page.waitForTimeout) await page.waitForTimeout(100);
          sessionRecovered = true;
        }

        if (sessionRecovered) {
          // Retry action post-refresh
          await executeActionFn(action);

          if (originalValue !== undefined && action.value !== originalValue) {
            throw new Error('DataInvariantViolation: Recovery must never modify user data silently');
          }

          const verify = await this._verifyAction(page, action, step);
          const duration = performance.now() - startTime;

          if (verify.passed) {
            const log = recordLog({
              strategy: RecoveryLevel.REFRESH_SESSION,
              result: RecoveryResultStatus.SUCCESS,
              duration,
              details: { reason: 'Session refreshed and re-executed successfully' }
            });
            return {
              recovered: true,
              strategy: RecoveryLevel.REFRESH_SESSION,
              page,
              log,
              attempts: attempt
            };
          }
        }

        recordLog({
          strategy: RecoveryLevel.REFRESH_SESSION,
          result: RecoveryResultStatus.ESCALATED,
          duration: performance.now() - startTime,
          details: { reason: 'Session refresh did not resolve failure' }
        });
      } catch (lvl5Err) {
        if (lvl5Err.message && lvl5Err.message.includes('DataInvariantViolation')) {
          throw lvl5Err;
        }
        recordLog({
          strategy: RecoveryLevel.REFRESH_SESSION,
          result: RecoveryResultStatus.ESCALATED,
          duration: performance.now() - startTime,
          details: { error: lvl5Err.message }
        });
      }
    }

    // ─────────────────────────────────────────────────────────────
    // LEVEL 6: HUMAN CHECKPOINT (TERMINAL)
    // ─────────────────────────────────────────────────────────────
    attempt++;
    const finalStart = performance.now();

    const checkpointReason =
      failure.type === FailureClass.VALIDATION_FAILURE
        ? 'MANUAL_REVIEW'
        : failure.type === FailureClass.SESSION_EXPIRED
        ? 'OTP'
        : 'MANUAL_REVIEW';

    const checkpoint = await this._createHumanCheckpoint({
      page,
      action,
      failure,
      step,
      pauseReason: checkpointReason,
      reason: `All automated recovery levels exhausted for failure: ${failure.type} (${failure.message})`
    });

    const finalLog = recordLog({
      strategy: RecoveryLevel.HUMAN_CHECKPOINT,
      result: RecoveryResultStatus.CHECKPOINT_CREATED,
      duration: performance.now() - finalStart,
      details: {
        checkpointId: checkpoint.checkpointId,
        pauseReason: checkpoint.pauseReason,
        totalAttempts: attempt
      }
    });

    return {
      recovered: false,
      strategy: RecoveryLevel.HUMAN_CHECKPOINT,
      failureType: failure.type,
      checkpoint,
      log: finalLog,
      attempts: attempt
    };
  }

  // ─────────────────────────────────────────────────────────────
  // HELPER METHODS
  // ─────────────────────────────────────────────────────────────

  async _verifyAction(page, action, step) {
    if (!this.actionVerifier || typeof this.actionVerifier.verify !== 'function') {
      return { passed: true };
    }

    try {
      // 1. If resolved locator is available and this is a fill action, read directly from locator
      if (action.resolvedLocator && action.type === 'fill') {
        let val = null;
        if (typeof action.resolvedLocator.inputValue === 'function') {
          val = await action.resolvedLocator.inputValue().catch(() => null);
        }
        if (val === null && typeof action.resolvedLocator.evaluate === 'function') {
          val = await action.resolvedLocator.evaluate(n => n.value !== undefined ? n.value : n.textContent).catch(() => null);
        }

        if (val !== null && action.value !== undefined) {
          const passed = String(val).trim() === String(action.value).trim();
          if (passed) {
            return { passed: true, actual: val, expected: action.value };
          }
        }
      }

      // 2. If page is valid, verify via ActionVerifier
      if (page) {
        return await this.actionVerifier.verify({
          page,
          actionType: action.type,
          stepIndex: step.stepIndex ?? 0,
          target: action.target || action.selector,
          expected: action.value || action.url || step.expectedUrl,
          actual: null,
          options: {
            locator: action.resolvedLocator,
            selector: action.selector
          }
        });
      }

      return { passed: false, error: 'NO_ACTIVE_PAGE' };
    } catch (_) {
      return { passed: false, error: 'VERIFICATION_EXCEPTION' };
    }
  }

  async _readInputValue(page, selector) {
    if (!page || !selector) return null;
    try {
      return await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el ? (el.value !== undefined ? el.value : el.textContent) : null;
      }, selector);
    } catch (_) {
      return null;
    }
  }

  async _dismissUnexpectedModal(page) {
    if (!page) return null;
    const modalCloseSelectors = [
      'button[aria-label="Close"]',
      'button.close',
      '.modal .close',
      'button:has-text("Accept All")',
      'button:has-text("I Agree")',
      'button:has-text("Dismiss")',
      'button:has-text("OK")',
      'button:has-text("Close")',
      '.cookie-banner button'
    ];

    for (const sel of modalCloseSelectors) {
      try {
        const count = page.locator ? await page.locator(sel).count() : 0;
        if (count > 0) {
          const btn = page.locator(sel).first();
          await btn.click({ timeout: 500 });
          return sel;
        }
      } catch (_) {}
    }

    // Try pressing Escape
    try {
      if (page.keyboard && typeof page.keyboard.press === 'function') {
        await page.keyboard.press('Escape');
        return 'Escape';
      }
    } catch (_) {}

    return null;
  }

  async _createHumanCheckpoint({ page, action, failure, step, pauseReason = 'MANUAL_REVIEW', reason = '' }) {
    let screenshotBase64 = null;
    if (page && typeof page.screenshot === 'function') {
      try {
        const buf = await page.screenshot({ timeout: 500 }).catch(() => null);
        if (buf) screenshotBase64 = buf.toString('base64');
      } catch (_) {}
    }

    return {
      schemaVersion: '2.0.0',
      checkpointId: `cp_recovery_${crypto.randomUUID()}`,
      fieldName: action.target || step.field || 'unknown_field',
      pauseReason,
      reason,
      stepIndex: step.stepIndex ?? 0,
      resumeFromIndex: step.stepIndex ?? 0,
      pageScreenshotBase64: screenshotBase64,
      resolved: false,
      resolvedValue: null,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Returns recent recovery audit records.
   */
  getAuditLog() {
    return [...this.recoveryLog];
  }

  /**
   * Clears audit log.
   */
  clearAuditLog() {
    this.recoveryLog = [];
  }
}

export const defaultMultiLevelRecoveryEngine = new MultiLevelRecoveryEngine();
