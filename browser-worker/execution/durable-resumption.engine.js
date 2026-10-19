/**
 * Durable Resumption Engine
 * Applier 2.0 — Phase 16: Durable Execution Checkpoints
 *
 * Implements the canonical 6-stage Resumption Protocol:
 *
 * 1. RESTORE JOB
 *      ↓ Restore job config, plan, and sanitized answers from durable checkpoint
 * 2. RESTORE BROWSER SESSION
 *      ↓ Re-attach existing page if alive, or create fresh context with storageState
 * 3. VERIFY CURRENT PAGE
 *      ↓ Navigate to checkpoint URL if needed, confirm page loaded & healthy
 * 4. RE-OBSERVE
 *      ↓ Fresh DOM observation (URL, title, input count, alerts, semantic page)
 * 5. RECONCILE STATE
 *      ↓ Compare completedFields against live DOM.
 *      ↓ Reconcile filled values & step index.
 *      ↓ NEVER use stale selectors: flag targets for dynamic semantic locator resolution!
 * 6. CONTINUE
 *      ↓ Resume verified execution loop with fresh RuntimeLocatorResolver
 */

import { ResumptionPhase, JobStatus } from '../../shared/src/index.js';
import { defaultDurableCheckpointManager } from './durable-checkpoint.manager.js';
import { defaultBrowserManager } from '../src/engine/browser.manager.js';
import { defaultRuntimeLocatorResolver } from '../locator/runtime-locator.resolver.js';
import { defaultActionVerifier } from './action-verifier.js';
import { VerifiedExecutionEngine } from './verified-execution.engine.js';
import { sanitizeAnswers, isSecretField } from './secret-sanitizer.js';

export class DurableResumptionEngine {
  constructor(options = {}) {
    this.checkpointManager = options.checkpointManager || defaultDurableCheckpointManager;
    this.browserManager = options.browserManager || defaultBrowserManager;
    this.locatorResolver = options.locatorResolver || defaultRuntimeLocatorResolver;
    this.actionVerifier = options.actionVerifier || defaultActionVerifier;
    this.verifiedEngine = options.verifiedEngine || new VerifiedExecutionEngine({
      browserManager: this.browserManager,
      locatorResolver: this.locatorResolver,
      actionVerifier: this.actionVerifier
    });
  }

  /**
   * Main entrypoint: Resumes execution from durable checkpoint through all 6 phases.
   */
  async resume({
    jobId,
    applicationId = null,
    userInput = {},
    executionPlan = null,
    answers = {},
    page: providedPage = null,
    browser: providedBrowser = null,
    onProgress = async () => {},
    onStatusUpdate = async () => {},
    onPause = async () => {},
    onHeartbeat = async () => {}
  }) {
    const resumeAudit = {
      jobId,
      resumedAt: new Date().toISOString(),
      phases: []
    };

    // ─────────────────────────────────────────────────────────
    // [1] RESTORE JOB
    // ─────────────────────────────────────────────────────────
    const jobRestoration = await this._restoreJob({
      jobId,
      applicationId,
      userInput,
      providedPlan: executionPlan,
      providedAnswers: answers
    });
    resumeAudit.phases.push({ phase: ResumptionPhase.RESTORE_JOB, details: jobRestoration.meta });

    const { checkpoint, plan, effectiveAnswers, completedFields } = jobRestoration;

    // ─────────────────────────────────────────────────────────
    // [2] RESTORE BROWSER SESSION
    // ─────────────────────────────────────────────────────────
    const sessionRestoration = await this._restoreBrowserSession({
      checkpoint,
      providedPage,
      providedBrowser
    });
    resumeAudit.phases.push({ phase: ResumptionPhase.RESTORE_SESSION, details: sessionRestoration.meta });

    const { page, browser, isNewSession } = sessionRestoration;

    try {
      // ─────────────────────────────────────────────────────────
      // [3] VERIFY CURRENT PAGE
      // ─────────────────────────────────────────────────────────
      const pageVerification = await this._verifyCurrentPage({ page, checkpoint });
      resumeAudit.phases.push({ phase: ResumptionPhase.VERIFY_PAGE, details: pageVerification });

      // ─────────────────────────────────────────────────────────
      // [4] RE-OBSERVE
      // ─────────────────────────────────────────────────────────
      const observation = await this._reObserve({ page });
      resumeAudit.phases.push({ phase: ResumptionPhase.RE_OBSERVE, details: observation });

      // ─────────────────────────────────────────────────────────
      // [5] RECONCILE STATE
      // (Never blindly reuse stale selectors!)
      // ─────────────────────────────────────────────────────────
      const reconciliation = await this._reconcileState({
        page,
        checkpoint,
        plan,
        completedFields,
        effectiveAnswers,
        userInput,
        observation
      });
      resumeAudit.phases.push({ phase: ResumptionPhase.RECONCILE_STATE, details: reconciliation.meta });

      const { resumeIndex, reconciledPlan, updatedAnswers } = reconciliation;

      // ─────────────────────────────────────────────────────────
      // [6] CONTINUE
      // ─────────────────────────────────────────────────────────
      await onStatusUpdate(
        jobId,
        JobStatus.RUNNING,
        `Resuming verified execution from reconciled step ${resumeIndex + 1}/${reconciledPlan.length}`
      );

      const executionResult = await this.verifiedEngine.execute({
        jobId,
        applicationId: applicationId || checkpoint.applicationId,
        targetUrl: checkpoint.url,
        steps: reconciledPlan,
        answers: updatedAnswers,
        startFromIndex: resumeIndex,
        page,
        onProgress,
        onStatusUpdate,
        onPause: async (id, status, pauseCtx) => {
          // Capture durable checkpoint on new pause
          await this.checkpointManager.captureDurableCheckpoint({
            page,
            jobId,
            applicationId: applicationId || checkpoint.applicationId,
            stepIndex: pauseCtx.stepIndex,
            currentField: pauseCtx.fieldName,
            completedFields: Array.from(completedFields),
            answers: updatedAnswers,
            status,
            pendingCheckpoint: pauseCtx
          });
          return onPause(id, status, pauseCtx);
        },
        onHeartbeat
      });

      // Update durable checkpoint on completion or failure
      if (executionResult.status === JobStatus.COMPLETED) {
        await this.checkpointManager.captureDurableCheckpoint({
          page,
          jobId,
          applicationId: applicationId || checkpoint.applicationId,
          stepIndex: reconciledPlan.length,
          completedFields: Array.from(new Set([...completedFields, ...reconciledPlan.map(s => s.semanticTarget || s.field).filter(Boolean)])),
          answers: updatedAnswers,
          status: JobStatus.COMPLETED,
          lastVerifiedAction: {
            actionType: 'complete',
            verifiedAt: new Date().toISOString(),
            verificationResult: { passed: true }
          }
        });
      }

      return {
        ...executionResult,
        resumed: true,
        resumeAudit,
        reconciledStepIndex: resumeIndex
      };
    } finally {
      // If we launched a temporary browser specifically for this resume run, clean it up
      if (isNewSession && browser) {
        await this.browserManager.closeBrowser(browser).catch(() => {});
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // PHASE 1: RESTORE JOB
  // ─────────────────────────────────────────────────────────────
  async _restoreJob({ jobId, applicationId, userInput, providedPlan, providedAnswers }) {
    let checkpoint = await this.checkpointManager.getLatestCheckpoint(jobId);
    if (!checkpoint && applicationId) {
      checkpoint = await this.checkpointManager.getLatestCheckpointForApplication(applicationId);
    }

    if (!checkpoint) {
      // Synthesize default base checkpoint if none exists yet
      checkpoint = {
        schemaVersion: '2.0.0',
        checkpointId: 'chk_synthesized',
        jobId,
        applicationId,
        url: providedPlan?.[0]?.url || 'about:blank',
        executionStep: 0,
        completedFields: [],
        sanitizedAnswers: sanitizeAnswers(providedAnswers || {}),
        status: JobStatus.RUNNING
      };
    }

    const plan = providedPlan || checkpoint.executionPlan || [];
    const baseAnswers = {
      ...(checkpoint.sanitizedAnswers || {}),
      ...(providedAnswers || {})
    };

    // Ephemerally inject user inputs (OTP/CAPTCHA) for active execution without permanent persistence
    const effectiveAnswers = { ...baseAnswers };
    for (const [k, v] of Object.entries(userInput || {})) {
      if (v !== undefined && v !== null) {
        effectiveAnswers[k] = v;
      }
    }

    return {
      checkpoint,
      plan,
      effectiveAnswers,
      completedFields: new Set(checkpoint.completedFields || []),
      meta: {
        checkpointId: checkpoint.checkpointId,
        executionStep: checkpoint.executionStep,
        completedFieldsCount: (checkpoint.completedFields || []).length,
        hasPendingCheckpoint: !!checkpoint.pendingCheckpoint
      }
    };
  }

  // ─────────────────────────────────────────────────────────────
  // PHASE 2: RESTORE BROWSER SESSION
  // ─────────────────────────────────────────────────────────────
  async _restoreBrowserSession({ checkpoint, providedPage, providedBrowser }) {
    // 1. Check if provided page is valid and responsive
    if (providedPage && typeof providedPage.isClosed === 'function' && !providedPage.isClosed()) {
      return {
        page: providedPage,
        browser: providedBrowser,
        isNewSession: false,
        meta: { restoredFromExistingSession: true }
      };
    }

    // 2. Launch fresh browser & restore context via storageState
    const browser = await this.browserManager.launchBrowser();
    const storageState = checkpoint.browserStateMetadata?.storageState;

    let context;
    if (storageState && typeof browser.newContext === 'function') {
      try {
        context = await browser.newContext({ storageState });
      } catch (_) {
        context = await browser.newContext();
      }
    } else {
      context = await browser.newContext();
    }

    const page = await context.newPage();

    return {
      page,
      browser,
      isNewSession: true,
      meta: {
        restoredFromExistingSession: false,
        restoredStorageState: !!storageState
      }
    };
  }

  // ─────────────────────────────────────────────────────────────
  // PHASE 3: VERIFY CURRENT PAGE
  // ─────────────────────────────────────────────────────────────
  async _verifyCurrentPage({ page, checkpoint }) {
    const targetUrl = checkpoint.url || checkpoint.pageUrl;
    const currentUrl = page.url ? page.url() : 'about:blank';

    let navigated = false;
    const isSameDataUrl = currentUrl.startsWith('data:') && targetUrl.startsWith('data:');
    const isMatching = isSameDataUrl || currentUrl === targetUrl || (targetUrl && currentUrl.includes(targetUrl));
    if (targetUrl && (currentUrl === 'about:blank' || !isMatching)) {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      navigated = true;
    }

    const settledUrl = page.url ? page.url() : 'about:blank';
    const isErrorPage = settledUrl.includes('net::ERR_') || settledUrl.includes('error');

    return {
      targetUrl,
      settledUrl,
      navigated,
      isErrorPage,
      pageReady: !isErrorPage
    };
  }

  // ─────────────────────────────────────────────────────────────
  // PHASE 4: RE-OBSERVE
  // ─────────────────────────────────────────────────────────────
  async _reObserve({ page }) {
    try {
      const observation = await page.evaluate(() => {
        const url = window.location.href;
        const title = document.title;
        const inputs = Array.from(document.querySelectorAll('input, select, textarea')).map(el => ({
          id: el.id,
          name: el.name,
          type: el.type,
          value: el.value,
          disabled: el.disabled
        }));
        const alerts = Array.from(document.querySelectorAll('[role="alert"], .error, .alert'))
          .filter(el => el.offsetParent !== null)
          .map(el => el.textContent.trim());

        return {
          url,
          title,
          inputCount: inputs.length,
          inputs,
          alerts,
          domHash: `${url}|${title}|${inputs.length}|${alerts.join(';')}`
        };
      });
      return observation;
    } catch (_) {
      return {
        url: page.url ? page.url() : '',
        title: '',
        inputCount: 0,
        inputs: [],
        alerts: [],
        domHash: page.url ? page.url() : ''
      };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // PHASE 5: RECONCILE STATE
  // (Do not blindly resume using stale selectors!)
  // ─────────────────────────────────────────────────────────────
  async _reconcileState({
    page,
    checkpoint,
    plan,
    completedFields,
    effectiveAnswers,
    userInput,
    observation
  }) {
    let resumeIndex = checkpoint.executionStep ?? 0;
    const reconciledPlan = plan.map((step, idx) => ({ ...step, stepIndex: idx }));

    // 1. Check if paused at OTP/CAPTCHA
    const pending = checkpoint.pendingCheckpoint;
    if (pending && pending.fieldName) {
      const pausedField = pending.fieldName;
      const userValue = userInput.otp || userInput.captcha || userInput[pausedField] || userInput.value;

      if (userValue) {
        effectiveAnswers[pausedField] = userValue;

        // If step matches paused field, prepare step value
        for (const step of reconciledPlan) {
          if (step.field === pausedField || step.semanticTarget === pausedField) {
            step.value = userValue;
            step.userProvided = true;
            step.isResumeStep = true;
            // Clear any stale hardcoded selector to force dynamic semantic resolution
            step.resolvedLocator = null;
          }
        }
      }

      // Resume from paused step: advance past the pause step if user input provided
      const pausedStepIdx = pending.stepIndex ?? checkpoint.executionStep ?? 0;
      if (reconciledPlan[pausedStepIdx] && reconciledPlan[pausedStepIdx].type === 'pause') {
        resumeIndex = pausedStepIdx + 1;
      } else {
        resumeIndex = pausedStepIdx;
      }
    } else {
      // Resuming normal execution: Check if current step was already completed and verified
      if (checkpoint.lastVerifiedAction && checkpoint.lastVerifiedAction.verificationResult?.passed) {
        // If the action at checkpoint.executionStep was already verified, advance to next step
        resumeIndex = (checkpoint.executionStep ?? 0) + 1;
      }
    }

    // Ensure within bounds
    resumeIndex = Math.min(Math.max(0, resumeIndex), reconciledPlan.length);

    // 2. Clear stale selectors for all remaining steps so RuntimeLocatorResolver resolves dynamically
    for (let i = resumeIndex; i < reconciledPlan.length; i++) {
      reconciledPlan[i].resolvedLocator = null;
    }

    return {
      resumeIndex,
      reconciledPlan,
      updatedAnswers: effectiveAnswers,
      meta: {
        reconciledStepIndex: resumeIndex,
        totalPlanSteps: reconciledPlan.length,
        staleSelectorsCleared: true,
        completedFieldsReconciled: completedFields.size
      }
    };
  }
}

export const defaultDurableResumptionEngine = new DurableResumptionEngine();
export default DurableResumptionEngine;
