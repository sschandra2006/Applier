/**
 * Evidence-Based Application Review Service
 * Applier 2.0 — Phase 13: Evidence-Based Application Review
 *
 * Core Principles:
 * 1. VALUE, SOURCE, CONFIDENCE, VALIDATION, STATUS for every field.
 * 2. Dedicated Conflict UI support: show both values, sources, require explicit resolution.
 * 3. Clearly partition missing data: Missing, Required, Optional, Needs Confirmation.
 * 4. Explicit user confirmation: issues cryptographic confirmation token.
 * 5. Submission Lock:
 *    - DO NOT silently alter values after confirmation.
 *    - DO NOT allow AI to change confirmed values.
 *    - Invalidate confirmation token immediately on post-confirmation mutation.
 */

import crypto from 'crypto';
import { InterviewState } from '../interview/interview-state.model.js';
import { Workflow } from '../workflow/workflow.model.js';
import { Document } from '../documents/document.model.js';
import { ApplicantKnowledgeGraph, defaultKnowledgeGraphService } from '../knowledge/index.js';
import { defaultConfirmationTokenService } from '../../../browser-worker/policy/confirmation-token.service.js';
import {
  ReviewStatus,
  ReviewFieldStatus,
  ReviewValidationStatus,
  KnowledgeVerificationStatus,
  PolicyViolationReason
} from '../../../shared/enums/index.js';
import { validateApplicationReview } from '../../../shared/validators/index.js';

export class ApplicationReviewService {
  constructor(options = {}) {
    this.tokenService = options.tokenService || defaultConfirmationTokenService;
    this.knowledgeService = options.knowledgeService || defaultKnowledgeGraphService;
  }

  /**
   * Builds the comprehensive, evidence-based application review representation.
   */
  async buildApplicationReview({ userId, workflowId, interviewStateId, applicationId = null }) {
    let state = null;
    let workflow = null;

    if (interviewStateId) {
      state = await InterviewState.findById(interviewStateId).populate('workflowId');
      if (state && !workflowId && state.workflowId) {
        workflow = state.workflowId;
        workflowId = workflow._id;
      }
    }

    if (!workflow && workflowId) {
      workflow = await Workflow.findById(workflowId);
    }

    // Answers from interview state
    const answers = new Map();
    if (state?.answers) {
      if (state.answers instanceof Map) {
        for (const [k, v] of state.answers.entries()) answers.set(k, v);
      } else if (typeof state.answers === 'object') {
        for (const [k, v] of Object.entries(state.answers)) answers.set(k, v);
      }
    }

    // Fetch Applicant Knowledge Graph
    let graph = null;
    try {
      const graphDoc = await ApplicantKnowledgeGraph.findOne({ userId });
      graph = graphDoc ? (graphDoc.toObject ? graphDoc.toObject() : graphDoc) : null;
    } catch (_) {}

    if (!graph) {
      graph = this.knowledgeService.createEmptyGraph({ userId });
    }

    // Extract workflow fields metadata
    const workflowFields = this._extractWorkflowFields(workflow);

    // Build fields review entries
    const fields = [];
    let verifiedCount = 0;
    let missingRequiredCount = 0;
    let missingOptionalCount = 0;
    let conflictsCount = 0;
    let needsConfirmationCount = 0;

    for (const target of workflowFields) {
      const fieldEntry = this._buildFieldReviewEntry({
        target,
        answers,
        graph,
        userId
      });

      fields.push(fieldEntry);

      if (fieldEntry.status === ReviewFieldStatus.VERIFIED) {
        verifiedCount++;
      } else if (fieldEntry.status === ReviewFieldStatus.CONFLICT) {
        conflictsCount++;
      } else if (fieldEntry.status === ReviewFieldStatus.CONFIRMATION_REQUIRED) {
        needsConfirmationCount++;
      } else if (fieldEntry.isMissing) {
        if (fieldEntry.isRequired) {
          missingRequiredCount++;
        } else {
          missingOptionalCount++;
        }
      }
    }

    const canConfirm = missingRequiredCount === 0 && conflictsCount === 0;

    // Evaluate Confirmation & Submission Lock Status
    let confirmationInfo = null;
    let reviewStatus = ReviewStatus.PENDING_REVIEW;

    if (state?.confirmationToken) {
      const answersObj = Object.fromEntries(answers.entries());
      const verifyRes = this.tokenService.verifyConfirmationToken({
        token: state.confirmationToken,
        currentFieldState: answersObj,
        applicationId: applicationId || state.applicationId || 'app_default',
        userId: String(userId)
      });

      if (verifyRes.valid) {
        reviewStatus = ReviewStatus.CONFIRMED;
        confirmationInfo = {
          confirmationId: verifyRes.confirmationId,
          token: state.confirmationToken,
          fieldStateHash: verifyRes.fieldStateHash,
          confirmedAt: state.confirmedAt ? new Date(state.confirmedAt).toISOString() : new Date().toISOString(),
          confirmedBy: String(userId),
          isLocked: true,
          status: 'ISSUED'
        };
      } else {
        reviewStatus = ReviewStatus.MUTATED_INVALIDATED;
        confirmationInfo = {
          confirmationId: verifyRes.confirmationId || 'conf_invalidated',
          token: state.confirmationToken,
          fieldStateHash: verifyRes.currentHash || null,
          confirmedAt: state.confirmedAt ? new Date(state.confirmedAt).toISOString() : null,
          confirmedBy: String(userId),
          isLocked: false,
          status: 'INVALIDATED'
        };
      }
    } else {
      if (canConfirm) {
        reviewStatus = ReviewStatus.READY_FOR_CONFIRMATION;
      } else if (conflictsCount > 0) {
        reviewStatus = ReviewStatus.HAS_CONFLICTS;
      } else {
        reviewStatus = ReviewStatus.INCOMPLETE;
      }
    }

    const reviewPayload = {
      schemaVersion: '2.0.0',
      reviewId: `rev_${crypto.randomUUID()}`,
      applicationId: String(applicationId || state?.applicationId || workflowId || 'app_default'),
      workflowId: String(workflowId || 'wf_default'),
      userId: String(userId),
      status: reviewStatus,
      fields,
      summary: {
        totalFields: fields.length,
        verifiedFields: verifiedCount,
        missingRequired: missingRequiredCount,
        missingOptional: missingOptionalCount,
        conflictsCount,
        needsConfirmationCount,
        canConfirm
      },
      confirmation: confirmationInfo,
      timestamp: new Date().toISOString()
    };

    const validation = validateApplicationReview(reviewPayload);
    if (!validation.valid) {
      console.warn('[ApplicationReviewService] Schema validation warning:', validation.errors);
    }

    return reviewPayload;
  }

  /**
   * Resolves a conflicting field value in both the Applicant Knowledge Graph and active answers.
   */
  async resolveConflict({ userId, interviewStateId, fieldKey, resolvedValue, chosenSource = 'USER_INPUT' }) {
    if (!fieldKey) throw new Error('fieldKey is required for conflict resolution.');
    if (resolvedValue === undefined) throw new Error('resolvedValue is required for conflict resolution.');

    const state = await InterviewState.findById(interviewStateId);
    if (!state) throw new Error(`InterviewState not found for ID: ${interviewStateId}`);

    // If state was previously confirmed, mutating any field invalidates the prior confirmation token!
    if (state.confirmationToken) {
      this.tokenService.invalidateToken(state.confirmationToken, PolicyViolationReason.FORM_MUTATED_AFTER_CONFIRMATION);
      state.confirmationToken = null;
      state.fieldStateHash = null;
      state.isLocked = false;
      state.reviewStatus = ReviewStatus.MUTATED_INVALIDATED;
    }

    // 1. Update Knowledge Graph to resolve active conflict
    let graphDoc = await ApplicantKnowledgeGraph.findOne({ userId });
    let graph = graphDoc ? (graphDoc.toObject ? graphDoc.toObject() : graphDoc) : null;
    if (!graph) {
      graph = this.knowledgeService.createEmptyGraph({ userId });
    }

    // Mark conflict resolved in graph
    this.knowledgeService.resolveFieldConflict(graph, {
      path: fieldKey,
      resolvedValue,
      resolvedSource: chosenSource,
      evidence: `Resolved by applicant in Review Screen`
    });

    try {
      await ApplicantKnowledgeGraph.updateOne({ userId }, graph, { upsert: true });
    } catch (_) {}

    // 2. Update InterviewState answers
    if (!state.answers) state.answers = new Map();
    state.answers.set(fieldKey, resolvedValue);
    state.markModified('answers');
    await state.save();

    return this.buildApplicationReview({
      userId,
      workflowId: state.workflowId,
      interviewStateId: state._id,
      applicationId: state.applicationId
    });
  }

  /**
   * Updates a single field value.
   * STRICT SUBMISSION LOCK:
   * - AI cannot modify confirmed values.
   * - Post-confirmation mutation by user strictly invalidates the confirmation token.
   */
  async updateFieldValue({ userId, interviewStateId, fieldKey, value, source = 'USER_INPUT' }) {
    if (!fieldKey) throw new Error('fieldKey is required.');

    const state = await InterviewState.findById(interviewStateId);
    if (!state) throw new Error(`InterviewState not found for ID: ${interviewStateId}`);

    // Rule: AI cannot change confirmed values
    if (state.isLocked && (source === 'AI' || source === 'SYSTEM_DERIVED')) {
      const err = new Error(`AI cannot alter confirmed and locked values for field "${fieldKey}".`);
      err.code = 'CONFIRMED_VALUE_PROTECTED';
      throw err;
    }

    // Post-confirmation mutation invalidates the token
    if (state.confirmationToken) {
      this.tokenService.invalidateToken(state.confirmationToken, PolicyViolationReason.FORM_MUTATED_AFTER_CONFIRMATION);
      state.confirmationToken = null;
      state.fieldStateHash = null;
      state.isLocked = false;
      state.reviewStatus = ReviewStatus.MUTATED_INVALIDATED;
    }

    if (!state.answers) state.answers = new Map();
    state.answers.set(fieldKey, value);
    state.markModified('answers');
    await state.save();

    return this.buildApplicationReview({
      userId,
      workflowId: state.workflowId,
      interviewStateId: state._id,
      applicationId: state.applicationId
    });
  }

  /**
   * Explicitly confirms the application review state and issues a cryptographic confirmation token.
   */
  async confirmApplicationReview({ userId, interviewStateId, applicationId, workflowVersion = '2.0.0' }) {
    const review = await this.buildApplicationReview({
      userId,
      interviewStateId,
      applicationId
    });

    if (!review.summary.canConfirm) {
      const blockers = [];
      if (review.summary.missingRequired > 0) blockers.push(`${review.summary.missingRequired} required field(s) missing`);
      if (review.summary.conflictsCount > 0) blockers.push(`${review.summary.conflictsCount} unresolved conflict(s) remaining`);
      const err = new Error(`Cannot confirm application: ${blockers.join(', ')}.`);
      err.code = 'CONFIRMATION_BLOCKED';
      err.summary = review.summary;
      throw err;
    }

    const state = await InterviewState.findById(interviewStateId);
    if (!state) throw new Error(`InterviewState not found for ID: ${interviewStateId}`);

    const answersObj = state.answers instanceof Map
      ? Object.fromEntries(state.answers.entries())
      : (state.answers || {});

    // Generate cryptographic confirmation token bound to deterministic fieldStateHash
    const confirmation = this.tokenService.generateConfirmationToken({
      applicationId: applicationId || String(state.workflowId),
      workflowVersion,
      userId: String(userId),
      fieldState: answersObj
    });

    state.confirmationToken = confirmation.token;
    state.fieldStateHash = confirmation.fieldStateHash;
    state.isLocked = true;
    state.confirmedAt = new Date();
    state.reviewStatus = ReviewStatus.CONFIRMED;
    await state.save();

    const updatedReview = await this.buildApplicationReview({
      userId,
      interviewStateId,
      applicationId
    });

    return {
      success: true,
      confirmation,
      review: updatedReview
    };
  }

  /**
   * Verifies submission lock and token validity prior to live automation execution.
   */
  async verifySubmissionLock({ interviewStateId, currentAnswers }) {
    const state = await InterviewState.findById(interviewStateId);
    if (!state) {
      return { allowed: false, reason: 'INTERVIEW_STATE_NOT_FOUND' };
    }

    if (!state.isLocked || !state.confirmationToken) {
      return {
        allowed: false,
        reason: PolicyViolationReason.MISSING_USER_CONFIRMATION,
        message: 'Application review must be explicitly confirmed by user before execution.'
      };
    }

    const answersToCheck = currentAnswers || (
      state.answers instanceof Map ? Object.fromEntries(state.answers.entries()) : state.answers
    );

    const tokenVerification = this.tokenService.verifyConfirmationToken({
      token: state.confirmationToken,
      currentFieldState: answersToCheck,
      applicationId: String(state.applicationId || state.workflowId),
      userId: String(state.userId)
    });

    if (!tokenVerification.valid) {
      return {
        allowed: false,
        reason: tokenVerification.reason || PolicyViolationReason.INVALID_CONFIRMATION_TOKEN,
        message: tokenVerification.error || 'Confirmation token invalidated due to post-confirmation mutation.'
      };
    }

    return {
      allowed: true,
      confirmationToken: state.confirmationToken,
      fieldStateHash: tokenVerification.fieldStateHash
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────

  _extractWorkflowFields(workflow) {
    const fields = [];
    const seen = new Set();
    let idx = 0;

    if (workflow?.schemaDefinition?.pages) {
      workflow.schemaDefinition.pages.forEach(page => {
        page.steps?.forEach(step => {
          const stepType = (step.type || '').toLowerCase();
          const stepId = step.id
            || step.selector?.replace(/^#/, '').replace(/[^a-z0-9_]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
            || step.label?.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
            || `field_${idx + 1}`;

          const isIgnored = stepType === 'pause' || stepType === 'hidden' || stepType === 'button'
            || /captcha|recaptcha|token_number|consent|terms|declaration|disclaimer|agree|language|cookie/i.test(stepId);

          if (stepId && !isIgnored && !seen.has(stepId)) {
            seen.add(stepId);
            fields.push({
              key: stepId,
              label: this._cleanLabel(step.label || stepId),
              type: step.type || 'text',
              required: step.required !== false && !/optional/i.test(step.label || '')
            });
          }
          idx++;
        });
      });
    }

    return fields;
  }

  _cleanLabel(rawLabel) {
    if (!rawLabel) return 'Field';
    let cleaned = String(rawLabel)
      .replace(/#.*$/gi, '')
      .replace(/\*.*$/gi, '')
      .replace(/[\*#:]+$/g, '')
      .trim();
    if (!cleaned) return 'Field';
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  _buildFieldReviewEntry({ target, answers, graph, userId }) {
    const fieldKey = target.key;
    const label = target.label;
    const isRequired = Boolean(target.required);
    const isOptional = !isRequired;

    let value = answers.get(fieldKey);
    let source = 'NONE';
    let sourceDetails = 'Not provided';
    let confidence = 0.0;
    let status = ReviewFieldStatus.MISSING;
    let validation = isRequired ? 'Missing Required Field' : 'Optional';
    let conflict = null;
    let needsConfirmation = false;

    // 1. Check Applicant Knowledge Graph status for provenance and conflicts
    const graphStatus = this.knowledgeService.getFieldStatus(graph, fieldKey);

    if (graphStatus.status === KnowledgeVerificationStatus.CONFLICT) {
      const conf = graphStatus.conflict;
      status = ReviewFieldStatus.CONFLICT;
      validation = 'Conflicting Evidence Detected';
      conflict = {
        conflictId: conf.conflictId || `conf_${fieldKey}`,
        existingValue: {
          value: conf.existingValue?.value,
          source: conf.existingValue?.source || 'DOCUMENT',
          evidence: conf.existingValue?.evidence || 'Document A',
          confidence: conf.existingValue?.confidence ?? 0.95
        },
        conflictingValue: {
          value: conf.conflictingValue?.value,
          source: conf.conflictingValue?.source || 'DOCUMENT',
          evidence: conf.conflictingValue?.evidence || 'Document B',
          confidence: conf.conflictingValue?.confidence ?? 0.92
        },
        status: 'UNRESOLVED',
        resolvedValue: null
      };
      source = 'DOCUMENT';
      sourceDetails = `${conf.existingValue?.evidence || 'Record A'} vs ${conf.conflictingValue?.evidence || 'Record B'}`;
      confidence = 0.50; // Ambiguous confidence due to active conflict
    } else if (value !== undefined && value !== null && String(value).trim() !== '') {
      // Value exists in answers
      if (graphStatus.node) {
        source = graphStatus.node.source || 'DOCUMENT';
        sourceDetails = graphStatus.node.evidence || 'Applicant Records';
        confidence = graphStatus.node.confidence ?? 0.98;
      } else {
        source = 'USER_INPUT';
        sourceDetails = 'User Interview';
        confidence = 1.0;
      }

      if (confidence < 0.85) {
        status = ReviewFieldStatus.CONFIRMATION_REQUIRED;
        validation = 'Needs Confirmation';
        needsConfirmation = true;
      } else {
        status = ReviewFieldStatus.VERIFIED;
        validation = ReviewValidationStatus.VERIFIED;
      }
    } else {
      // Value missing
      if (graphStatus.node?.value) {
        // Recoverable from graph
        value = graphStatus.node.value;
        source = graphStatus.node.source || 'PROFILE';
        sourceDetails = graphStatus.node.evidence || 'User Profile';
        confidence = graphStatus.node.confidence ?? 0.95;
        status = ReviewFieldStatus.VERIFIED;
        validation = ReviewValidationStatus.VERIFIED;
      } else {
        value = null;
        if (isRequired) {
          status = ReviewFieldStatus.MISSING;
          validation = 'Missing Required Field';
        } else {
          status = ReviewFieldStatus.OPTIONAL_EMPTY;
          validation = 'Optional';
        }
      }
    }

    const isMissing = value === null || value === undefined || String(value).trim() === '';

    return {
      fieldKey,
      label,
      value: value || null,
      source,
      sourceDetails,
      confidence: Number(confidence.toFixed(2)),
      validation,
      status,
      isRequired,
      isOptional,
      isMissing,
      needsConfirmation,
      conflict
    };
  }
}

export const defaultApplicationReviewService = new ApplicationReviewService();
