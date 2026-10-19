/**
 * Execution State Controller & Checkpoint Persistence
 * Applier 2.0 — Phases 10 & 16: Observe → Plan → Act → Verify & Durable Execution Checkpoints
 *
 * Manages runtime state transitions, answers snapshot, verification records,
 * completed fields tracking, and serializable durable checkpoint persistence.
 */

import crypto from 'crypto';
import { JobStatus } from '../../shared/enums/index.js';
import { defaultCheckpointManager } from '../browser/checkpoint-manager.js';
import { defaultDurableCheckpointManager } from './durable-checkpoint.manager.js';

export class ExecutionState {
  constructor(params = {}) {
    this.jobId = params.jobId || `job_${crypto.randomUUID()}`;
    this.applicationId = params.applicationId || null;
    this.userId = params.userId || 'default_user';
    this.sessionId = params.sessionId || `sess_${crypto.randomUUID()}`;
    this.status = JobStatus.RUNNING;
    this.currentStepIndex = params.startFromIndex ?? 0;
    this.totalSteps = params.totalSteps ?? 0;
    this.answers = { ...(params.answers || {}) };
    this.verifiedSteps = [];
    this.completedFields = new Set(params.completedFields || []);
    this.lastVerifiedAction = params.lastVerifiedAction || null;
    this.checkpoints = [];
    this.latestObservation = null;
    this.previousObservation = null;
    this.pauseContext = null;
    this.checkpointManager = params.checkpointManager || defaultCheckpointManager;
    this.durableCheckpointManager = params.durableCheckpointManager || defaultDurableCheckpointManager;
  }

  /**
   * Records a verification outcome for a completed action and tracks completed fields.
   */
  recordVerification(verificationResult, step = {}) {
    const record = {
      ...verificationResult,
      stepIndex: step.stepIndex ?? this.currentStepIndex,
      actionType: step.type,
      target: step.semanticTarget || step.selector || step.field,
      recordedAt: new Date().toISOString()
    };

    this.verifiedSteps.push(record);

    if (verificationResult.passed) {
      const fieldKey = step.semanticTarget || step.field;
      if (fieldKey) {
        this.completedFields.add(fieldKey);
      }
      this.lastVerifiedAction = {
        actionType: step.type || 'unknown',
        target: fieldKey || step.selector || 'target',
        verifiedAt: record.recordedAt,
        verificationResult: {
          passed: true,
          status: verificationResult.status || 'SUCCESS'
        }
      };
    }
  }

  /**
   * Updates an answer in the state.
   */
  updateAnswer(field, value) {
    if (field) {
      this.answers[field] = value;
    }
  }

  /**
   * Records a DOM / browser observation.
   */
  updateObservation(observation) {
    this.previousObservation = this.latestObservation;
    this.latestObservation = observation;
  }

  /**
   * Determines whether the DOM has meaningfully changed between observations.
   */
  hasDomChanged() {
    if (!this.previousObservation || !this.latestObservation) return false;
    return this.previousObservation.domHash !== this.latestObservation.domHash;
  }

  /**
   * Persists an execution checkpoint after a significant action.
   * Employs both CheckpointManager and DurableCheckpointManager for guaranteed recovery.
   */
  async persistCheckpoint(page, { stepIndex, actionType, description, currentField, step } = {}) {
    try {
      const actualStepIndex = stepIndex ?? this.currentStepIndex;
      const targetField = currentField || step?.semanticTarget || step?.field || null;

      // 1. Capture via legacy CheckpointManager for backward compatibility
      const pageRecord = { page, pageId: `page_${this.sessionId}` };
      const legacyCheckpoint = await this.checkpointManager.captureCheckpoint({
        sessionId: this.sessionId,
        pageRecord,
        contextInstance: page.context ? page.context() : null,
        workflowStep: actualStepIndex,
        executionStep: actualStepIndex,
        checkpointState: {
          jobId: this.jobId,
          status: this.status,
          actionType: actionType || 'significant_action',
          description: description || '',
          answers: { ...this.answers },
          verifiedCount: this.verifiedSteps.length
        }
      }).catch(() => null);

      // 2. Capture canonical Durable Execution Checkpoint (Phase 16)
      const durableCheckpoint = await this.durableCheckpointManager.captureDurableCheckpoint({
        page,
        context: page && typeof page.context === 'function' ? page.context() : null,
        jobId: this.jobId,
        applicationId: this.applicationId,
        stepIndex: actualStepIndex,
        currentField: targetField,
        completedFields: Array.from(this.completedFields),
        lastVerifiedAction: this.lastVerifiedAction,
        answers: { ...this.answers },
        status: this.status,
        pendingCheckpoint: this.pauseContext,
        semanticPage: this.latestObservation?.semanticPage || null
      });

      this.checkpoints.push(legacyCheckpoint || durableCheckpoint);
      return durableCheckpoint;
    } catch (err) {
      console.warn('[ExecutionState] Checkpoint capture warning:', err.message);
      return null;
    }
  }

  /**
   * Sets paused state with pause context (OTP/CAPTCHA) and persists durable checkpoint.
   */
  async pause(reason, context = {}, page = null) {
    this.status = reason === 'CAPTCHA' ? JobStatus.PAUSED_CAPTCHA : JobStatus.PAUSED_OTP;
    this.pauseContext = {
      pauseReason: reason,
      ...context,
      pausedAt: new Date().toISOString()
    };

    if (page) {
      await this.persistCheckpoint(page, {
        stepIndex: context.stepIndex ?? this.currentStepIndex,
        actionType: 'pause',
        description: `Paused for ${reason}`,
        currentField: context.fieldName
      }).catch(() => {});
    }
  }

  /**
   * Marks execution as completed.
   */
  complete() {
    this.status = JobStatus.COMPLETED;
  }

  /**
   * Marks execution as failed.
   */
  fail(error) {
    this.status = JobStatus.FAILED;
    this.error = error;
  }
}

export default ExecutionState;
