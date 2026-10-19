/**
 * Verified Execution Engine
 * Applier 2.0 — Phase 10: Observe → Plan → Act → Verify Execution Engine
 *
 * Replaces static "execute the entire plan blindly" behavior with incremental
 * verified execution.
 *
 * Canonical Loop:
 * OBSERVE
 *   ↓
 * PLAN NEXT ACTION
 *   ↓
 * POLICY CHECK
 *   ↓
 * ACT
 *   ↓
 * VERIFY
 *   ↓
 * UPDATE STATE
 *   ↓
 * CHECKPOINT (Significant Actions)
 *   ↓
 * OBSERVE AGAIN
 *
 * Failure Protocol:
 * If verification fails, do NOT blindly continue. Send to recovery.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { defaultActionVerifier } from './action-verifier.js';
import { defaultPolicyChecker } from './policy-checker.js';
import { defaultRecoveryHandler } from './recovery-handler.js';
import { ExecutionState } from './execution-state.js';
import { defaultRuntimeLocatorResolver } from '../locator/runtime-locator.resolver.js';
import { defaultBrowserManager } from '../src/engine/browser.manager.js';
import { defaultActionPolicyEngine } from '../policy/index.js';
import { defaultVerifiedSubmissionEngine } from './verified-submission.engine.js';
import { WORKER_STATUS } from '../../backend/src/queue/queue.constants.js';
import { AutomationEventType } from '../../shared/enums/index.js';

export class VerifiedExecutionEngine {
  constructor(options = {}) {
    this.actionVerifier = options.actionVerifier || defaultActionVerifier;
    this.policyChecker = options.policyChecker || defaultPolicyChecker;
    this.recoveryHandler = options.recoveryHandler || defaultRecoveryHandler;
    this.locatorResolver = options.locatorResolver || defaultRuntimeLocatorResolver;
    this.browserManager = options.browserManager || defaultBrowserManager;
    this.actionPolicyEngine = options.actionPolicyEngine || defaultActionPolicyEngine;
    this.verifiedSubmissionEngine = options.verifiedSubmissionEngine || defaultVerifiedSubmissionEngine;
    this.eventService = options.eventService || null;
    this.maxRetries = options.maxRetries ?? 2;
  }

  /**
   * Main entrypoint: Executes a sequence of steps through the verified execution loop.
   */
  async execute({
    jobId,
    targetUrl,
    steps = [],
    answers = {},
    startFromIndex = 0,
    workerId = 'worker-1',
    applicationId = null,
    userId = null,
    confirmationToken = null,
    requiredFields = null,
    expectedPageState = null,
    hasConflicts = false,
    hasValidationErrors = false,
    page: providedPage = null,
    onProgress = async () => {},
    onStatusUpdate = async () => {},
    onPause = async () => {},
    onHeartbeat = async () => {},
    onEvent = async () => {}
  }) {
    let browser = null;
    let page = providedPage;

    if (!page) {
      browser = await this.browserManager.launchBrowser();
      page = await browser.newPage();
    }

    const state = new ExecutionState({
      jobId,
      applicationId,
      userId: userId || 'default_user',
      startFromIndex,
      totalSteps: steps.length,
      answers
    });

    let heartbeatTimer = null;

    try {
      if (jobId) {
        heartbeatTimer = setInterval(() => {
          onHeartbeat(jobId).catch(() => {});
        }, 10000);
      }

      await onStatusUpdate(jobId, 'RUNNING', `Starting verified execution from step ${startFromIndex + 1}/${steps.length}`, {
        workerStatus: WORKER_STATUS.RUNNING,
        workerId
      });

      await this._emitEvent(onEvent, {
        jobId,
        applicationId,
        eventType: AutomationEventType.JOB_STARTED,
        payload: { targetUrl, totalSteps: steps.length, workerId }
      });

      // ─────────────────────────────────────────────────────────
      // THE VERIFIED EXECUTION LOOP
      // ─────────────────────────────────────────────────────────
      for (let i = startFromIndex; i < steps.length; i++) {
        state.currentStepIndex = i;
        const rawStep = steps[i];

        // 1. OBSERVE
        const observation = await this.observe(page);
        state.updateObservation(observation);

        if (observation.url) {
          await this._emitEvent(onEvent, {
            jobId,
            applicationId,
            eventType: AutomationEventType.PAGE_CHANGED,
            payload: { url: observation.url, title: observation.title, inputCount: observation.inputCount }
          });
        }

        // 2. PLAN NEXT ACTION
        const step = this.planNextAction(rawStep, state.answers, targetUrl, i);

        if (step.semanticTarget || step.field) {
          await this._emitEvent(onEvent, {
            jobId,
            applicationId,
            eventType: AutomationEventType.FIELD_DETECTED,
            payload: { target: step.semanticTarget || step.field, selector: step.selector, type: step.type }
          });
        }

        await onProgress(jobId, {
          currentStepIndex: i,
          currentStep: i + 1,
          totalSteps: steps.length,
          stepDescription: step.description || step.type
        });

        await onStatusUpdate(
          jobId,
          'RUNNING',
          `Step ${i + 1}/${steps.length} (${step.type}): ${step.description || ''}`
        );

        // 3. POLICY CHECK
        const basePolicyResult = this.policyChecker.check({
          step,
          currentUrl: observation.url,
          retryCount: 0
        });

        if (basePolicyResult.requiresPause) {
          // Gated action (e.g. CAPTCHA/OTP detected on automated step)
          return await this._handlePauseStep(page, step, basePolicyResult.pauseReason, i, jobId, onPause, state);
        }

        if (!basePolicyResult.allowed) {
          state.fail(`Policy violation: ${basePolicyResult.reason}`);
          await onStatusUpdate(jobId, 'FAILED', `Blocked by policy: ${basePolicyResult.reason}`);
          return {
            status: 'FAILED',
            error: basePolicyResult.reason,
            failedStep: i,
            policyViolation: basePolicyResult.policyName
          };
        }

        // Action Policy Evaluation (Risk tiers, sensitive confidence, critical confirmation)
        const actionPolicyResult = this.actionPolicyEngine.evaluateAction({
          action: step,
          context: {
            applicationId: applicationId || state.jobId,
            userId: userId || 'default_user',
            fieldState: state.answers,
            answers: state.answers,
            confirmationToken: step.confirmationToken || confirmationToken,
            requiredFields,
            expectedPageState,
            currentPageState: observation.title || 'APPLICATION_FORM',
            hasConflicts: step.hasConflict ?? hasConflicts,
            hasValidationErrors: step.hasValidationErrors ?? hasValidationErrors,
            confidence: step.confidence
          }
        });

        if (!actionPolicyResult.allowed) {
          state.fail(`Action policy violation: ${actionPolicyResult.reason}`);
          await onStatusUpdate(jobId, 'FAILED', `Blocked by policy: ${actionPolicyResult.reason}`);
          return {
            status: 'FAILED',
            error: actionPolicyResult.reason,
            failedStep: i,
            policyViolation: actionPolicyResult.violationCode,
            policyResult: actionPolicyResult
          };
        }

        // 4. ACT
        let actError = null;
        try {
          await this.act(page, step, state);
        } catch (err) {
          actError = err;
        }

        if (!actError) {
          if (step.type === 'fill') {
            await this._emitEvent(onEvent, {
              jobId,
              applicationId,
              eventType: AutomationEventType.FIELD_FILLED,
              payload: { field: step.field || step.semanticTarget, selector: step.selector, value: step.value }
            });
          } else if (step.type === 'upload') {
            await this._emitEvent(onEvent, {
              jobId,
              applicationId,
              eventType: AutomationEventType.DOCUMENT_UPLOADED,
              payload: { field: step.field, selector: step.selector }
            });
          } else if (step.type === 'submit') {
            await this._emitEvent(onEvent, {
              jobId,
              applicationId,
              eventType: AutomationEventType.SUBMISSION_STARTED,
              payload: { selector: step.selector }
            });
            if (step.submissionResult) {
              await this._emitEvent(onEvent, {
                jobId,
                applicationId,
                eventType: AutomationEventType.SUBMISSION_VERIFIED,
                payload: {
                  status: step.submissionResult.submissionStatus,
                  referenceNumber: step.submissionResult.referenceNumber,
                  receipt: step.submissionResult.receipt
                }
              });
            }
          }
        }

        // Special handling for Pause step
        if (step.type === 'pause') {
          await this._emitEvent(onEvent, {
            jobId,
            applicationId,
            eventType: AutomationEventType.USER_INPUT_REQUIRED,
            payload: { pauseReason: step.pauseReason || 'OTP', fieldName: step.field || step.selector }
          });
          return await this._handlePauseStep(page, step, step.pauseReason || 'OTP', i, jobId, onPause, state);
        }

        // 5. VERIFY
        let verificationResult;
        if (actError) {
          verificationResult = {
            passed: false,
            status: 'FAILED',
            error: actError.message.includes('not found') ? 'LOCATOR_NOT_FOUND' : 'ACT_ERROR',
            evidence: `Action thrown before completion: ${actError.message}`,
            expected: step.value || step.url,
            actual: null
          };
        } else {
          verificationResult = await this.actionVerifier.verify({
            page,
            actionType: step.type,
            stepIndex: i,
            target: step.semanticTarget || step.selector,
            expected: step.value || step.url || step.expectedUrl,
            actual: step.actualResult,
            options: {
              locator: step.resolvedLocator,
              selector: step.selector,
              expectedUrl: step.expectedUrl,
              expectedSelector: step.expectedSelector,
              url: step.url,
              pauseReason: step.pauseReason
            }
          });
        }

        await this._emitEvent(onEvent, {
          jobId,
          applicationId,
          eventType: AutomationEventType.FIELD_VERIFIED,
          payload: {
            stepIndex: i,
            actionType: step.type,
            target: step.semanticTarget || step.selector,
            status: verificationResult.status,
            passed: verificationResult.passed,
            evidence: verificationResult.evidence
          }
        });

        // 6. FAILURE & RECOVERY (Do NOT blindly continue!)
        if (!verificationResult.passed) {
          await onStatusUpdate(
            jobId,
            'RUNNING',
            `Verification failed on step ${i + 1} (${verificationResult.error}). Sending to recovery...`
          );

          await this._emitEvent(onEvent, {
            jobId,
            applicationId,
            eventType: AutomationEventType.RECOVERY_STARTED,
            payload: { stepIndex: i, error: verificationResult.error, reason: verificationResult.evidence }
          });

          const recoveryResult = await this.recoveryHandler.handleFailure({
            page,
            step,
            verificationResult,
            attempt: 1,
            actionVerifier: this.actionVerifier,
            executeActionFn: (s) => this.act(page, s, state)
          });

          if (recoveryResult.recovered) {
            await onStatusUpdate(
              jobId,
              'RUNNING',
              `Recovery succeeded via strategy: ${recoveryResult.strategy}`
            );

            await this._emitEvent(onEvent, {
              jobId,
              applicationId,
              eventType: AutomationEventType.RECOVERY_COMPLETED,
              payload: { stepIndex: i, strategy: recoveryResult.strategy }
            });

            verificationResult = recoveryResult.verificationResult;
          } else {
            // Unrecoverable failure: Halt cleanly
            state.fail(recoveryResult.reason || verificationResult.evidence);
            await onStatusUpdate(
              jobId,
              'FAILED',
              `Execution stopped: ${recoveryResult.reason || verificationResult.evidence}`
            );

            await this._emitEvent(onEvent, {
              jobId,
              applicationId,
              eventType: AutomationEventType.JOB_FAILED,
              payload: { failedStep: i, reason: recoveryResult.reason || verificationResult.evidence }
            });

            return {
              status: 'FAILED',
              failedStep: i,
              error: recoveryResult.error || verificationResult.error,
              evidence: recoveryResult.reason || verificationResult.evidence,
              verificationResult
            };
          }
        }

        // 7. UPDATE STATE
        state.recordVerification(verificationResult, step);

        // 8. CHECKPOINT (Persist execution checkpoint after significant actions)
        if (this._isSignificantAction(step.type)) {
          await state.persistCheckpoint(page, {
            stepIndex: i,
            actionType: step.type,
            description: step.description,
            currentField: step.semanticTarget || step.field,
            step
          });

          await this._emitEvent(onEvent, {
            jobId,
            applicationId,
            eventType: AutomationEventType.CHECKPOINT_REQUIRED,
            payload: { stepIndex: i, actionType: step.type, currentField: step.semanticTarget || step.field }
          });
        }

        const waitTime = step.waitAfterMs ?? 200;
        if (waitTime > 0) {
          await page.waitForTimeout(waitTime);
        }
      }

      // Final completion receipt
      let finalReceipt = null;
      try {
        const buf = await page.screenshot({ fullPage: true });
        finalReceipt = buf.toString('base64');
      } catch (_) {}

      state.complete();
      await onStatusUpdate(jobId, 'COMPLETED', 'Execution verified and completed successfully!', {
        workerStatus: WORKER_STATUS.COMPLETED,
        ...(finalReceipt ? { base64Receipt: finalReceipt } : {})
      });

      await this._emitEvent(onEvent, {
        jobId,
        applicationId,
        eventType: AutomationEventType.JOB_COMPLETED,
        payload: {
          verifiedStepsCount: state.verifiedSteps.length,
          checkpointsCount: state.checkpoints.length,
          hasReceipt: Boolean(finalReceipt)
        }
      });

      return {
        status: 'COMPLETED',
        finalReceipt,
        verifiedStepsCount: state.verifiedSteps.length,
        checkpointsCount: state.checkpoints.length,
        state
      };
    } finally {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (browser) {
        await this.browserManager.closeBrowser(browser);
      }
    }
  }

  /**
   * OBSERVE: Captures live browser state, DOM signature, and error signals.
   */
  async observe(page) {
    try {
      return await page.evaluate(() => {
        const url = window.location.href;
        const title = document.title;
        const inputCount = document.querySelectorAll('input, select, textarea').length;
        const alerts = Array.from(
          document.querySelectorAll('[role="alert"], .error, .alert, .invalid-feedback')
        )
          .filter((el) => el.offsetParent !== null)
          .map((el) => el.textContent.trim());

        const domHash = `${url}|${title}|${inputCount}|${alerts.join(';')}`;
        return {
          url,
          title,
          inputCount,
          alerts,
          domHash,
          timestamp: Date.now()
        };
      });
    } catch (_) {
      return {
        url: page.url(),
        title: '',
        inputCount: 0,
        alerts: [],
        domHash: page.url(),
        timestamp: Date.now()
      };
    }
  }

  /**
   * PLAN NEXT ACTION: Prepares parameters and resolves values for the step.
   */
  planNextAction(rawStep, answers, targetUrl, stepIndex) {
    const step = { ...rawStep, stepIndex };

    // Resolve value from answers dictionary if present
    if (step.field && answers[step.field] !== undefined) {
      step.value = answers[step.field];
    }

    if (step.type === 'navigate' && !step.url && targetUrl) {
      step.url = targetUrl;
    }

    return step;
  }

  /**
   * ACT: Executes the concrete action inside Playwright.
   * Supports: navigate, fill, select, upload, click, pause, screenshot
   */
  async act(page, step, state) {
    switch (step.type) {
      case 'navigate': {
        const dest = step.url;
        await page.goto(dest, { waitUntil: 'domcontentloaded', timeout: 30000 });
        try {
          await page.waitForLoadState('networkidle', { timeout: 5000 });
        } catch (_) {}
        break;
      }

      case 'fill': {
        const val = String(step.value ?? '');
        // 1. If semantic target specified, resolve via RuntimeLocatorResolver
        if (step.semanticTarget) {
          const res = await this.locatorResolver.resolveAndFill(page, step.semanticTarget, val).catch(() => null);
          if (res && res.success) {
            step.resolvedLocator = res.element;
            break;
          }
        }

        // 2. Fallback to selector
        if (step.selector) {
          const locator = page.locator(step.selector).first();
          const isContentEditable = await locator.evaluate((n) => n.isContentEditable).catch(() => false);

          if (isContentEditable) {
            await locator.click();
            await locator.evaluate((n, v) => {
              n.textContent = v;
              n.dispatchEvent(new Event('input', { bubbles: true }));
              n.dispatchEvent(new Event('change', { bubbles: true }));
            }, val);
          } else {
            try {
              await locator.fill(val, { timeout: 8000 });
            } catch (err) {
              // DOM event dispatch fallback
              await locator.evaluate((n, v) => {
                n.value = v;
                n.dispatchEvent(new Event('input', { bubbles: true }));
                n.dispatchEvent(new Event('change', { bubbles: true }));
              }, val);
            }
          }
        }
        break;
      }

      case 'select': {
        const val = String(step.value ?? '');
        if (step.selector) {
          try {
            await page.selectOption(step.selector, val, { timeout: 3000 });
          } catch (_) {
            // Secondary strategy: evaluate options
            await page.evaluate(
              ({ sel, targetVal }) => {
                const el = document.querySelector(sel);
                if (el && el.tagName === 'SELECT') {
                  for (const opt of el.options) {
                    if (
                      opt.value === targetVal ||
                      opt.textContent.trim().toLowerCase() === targetVal.toLowerCase()
                    ) {
                      el.value = opt.value;
                      el.dispatchEvent(new Event('input', { bubbles: true }));
                      el.dispatchEvent(new Event('change', { bubbles: true }));
                      break;
                    }
                  }
                }
              },
              { sel: step.selector, targetVal: val }
            );
          }
        }
        break;
      }

      case 'upload': {
        const documentUrl = step.value || state.answers[step.field];
        if (documentUrl && step.selector) {
          let localFilePath = null;
          if (documentUrl.startsWith('http://') || documentUrl.startsWith('https://')) {
            const res = await fetch(documentUrl);
            const arrayBuf = await res.arrayBuffer();
            const tempPath = path.join(os.tmpdir(), `upload_${Date.now()}_doc.pdf`);
            fs.writeFileSync(tempPath, Buffer.from(arrayBuf));
            localFilePath = tempPath;
          } else if (fs.existsSync(documentUrl)) {
            localFilePath = documentUrl;
          }

          if (localFilePath) {
            await page.setInputFiles(step.selector, localFilePath);
          }
        }
        break;
      }

      case 'click': {
        if (step.selector) {
          await page.click(step.selector, { timeout: 10000 });
        }
        break;
      }

      case 'screenshot': {
        const buf = await page.screenshot({ fullPage: true });
        step.actualResult = buf.toString('base64');
        break;
      }

      case 'submit': {
        const submitResult = await this.verifiedSubmissionEngine.submitAndVerify({
          page,
          action: step,
          context: {
            jobId: state?.jobId || step.jobId,
            applicationId: state?.applicationId || step.applicationId,
            userId: state?.userId || step.userId || 'default_user',
            confirmationToken: step.confirmationToken || state?.confirmationToken,
            answers: state?.answers || step.answers || {},
            hasConflicts: step.hasConflicts ?? false,
            hasValidationErrors: step.hasValidationErrors ?? false,
            expectedPageState: step.expectedPageState
          }
        });
        step.actualResult = submitResult;
        step.submissionResult = submitResult;
        break;
      }

      case 'pause':
      case 'wait':
        break;

      default:
        throw new Error(`Unsupported action type: "${step.type}"`);
    }
  }

  /**
   * Significant actions trigger checkpoint persistence.
   */
  _isSignificantAction(actionType) {
    return ['navigate', 'fill', 'select', 'upload', 'pause', 'submit'].includes(actionType);
  }

  /**
   * Handles human intervention pause steps (OTP/CAPTCHA).
   */
  async _handlePauseStep(page, step, pauseReason, stepIndex, jobId, onPause, state = null) {
    const pauseStatus = pauseReason === 'CAPTCHA' ? 'PAUSED_CAPTCHA' : 'PAUSED_OTP';
    const fieldName = step.field || step.selector || 'verification';

    let captchaImageBase64 = null;
    if (pauseReason === 'CAPTCHA' && step.captchaSelector) {
      try {
        const el = await page.$(step.captchaSelector);
        if (el) {
          const buf = await el.screenshot();
          captchaImageBase64 = buf.toString('base64');
        }
      } catch (_) {}
    }

    let pageScreenshotBase64 = null;
    try {
      const pBuf = await page.screenshot({ fullPage: false });
      pageScreenshotBase64 = pBuf.toString('base64');
    } catch (_) {}

    const pauseContext = {
      fieldName,
      pauseReason,
      captchaImageBase64,
      pageScreenshotBase64,
      stepIndex,
      resumeFromIndex: stepIndex + 1
    };

    if (state && typeof state.pause === 'function') {
      await state.pause(pauseReason, pauseContext, page).catch(() => {});
    }

    await onPause(jobId, pauseStatus, pauseContext, {
      ...(captchaImageBase64 ? { captchaImageBase64 } : {}),
      ...(pageScreenshotBase64 ? { base64Receipt: pageScreenshotBase64 } : {})
    });

    return {
      status: pauseStatus,
      pausedAtStep: stepIndex,
      resumeFromIndex: stepIndex + 1,
      pauseContext
    };
  }

  /**
   * Dispatches execution events to callback and optional event service.
   */
  async _emitEvent(onEvent, { jobId, applicationId, eventType, payload = {} }) {
    const event = {
      jobId,
      applicationId,
      eventType,
      payload
    };

    if (typeof onEvent === 'function') {
      try {
        await onEvent(event);
      } catch (_) {}
    }

    if (this.eventService && typeof this.eventService.emitEvent === 'function') {
      try {
        this.eventService.emitEvent(event);
      } catch (_) {}
    }
  }
}

export const defaultVerifiedExecutionEngine = new VerifiedExecutionEngine();
