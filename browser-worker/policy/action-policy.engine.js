/**
 * Action Policy Engine & Submission Safety Controller
 * Applier 2.0 — Phase 12: Browser Action Policy and Submission Safety
 *
 * Sits strictly between AI/adaptive reasoning and browser execution:
 *   AI / Proposed Action → Policy → Executor → Verification
 *
 * Rules:
 * 1. AI cannot bypass policy.
 * 2. Action Risk Tiers:
 *    - LOW_RISK: read, observe, screenshot
 *    - NORMAL: fill, select, upload, navigate
 *    - SENSITIVE: change account information, financial fields, identity fields
 *    - CRITICAL: submit, payment, final confirmation
 * 3. Final submission requires:
 *    - All required fields resolved
 *    - Validation passed
 *    - No unresolved conflicts
 *    - Explicit user confirmation
 *    - Current page matches expected submission state
 * 4. Confirmation token invalidation on form mutation
 */

import crypto from 'crypto';
import {
  ActionRiskCategory,
  PolicyDecision,
  PolicyViolationReason,
  KnowledgeVerificationStatus
} from '../../shared/enums/index.js';
import { validateActionPolicy } from '../../shared/validators/index.js';
import { defaultConfirmationTokenService } from './confirmation-token.service.js';

export class ActionPolicyEngine {
  constructor(options = {}) {
    this.tokenService = options.tokenService || defaultConfirmationTokenService;
    this.minSensitiveConfidence = options.minSensitiveConfidence ?? 0.85;
  }

  /**
   * Classifies a proposed browser action into its risk category.
   *
   * @param {object} action
   * @param {object} context
   * @returns {string} ActionRiskCategory (LOW_RISK | NORMAL | SENSITIVE | CRITICAL)
   */
  classifyAction(action, context = {}) {
    const type = String(action.type || '').toLowerCase();
    const targetName = String(
      action.semanticTarget || action.field || action.selector || action.name || ''
    ).toLowerCase();
    const actionDesc = String(action.description || '').toLowerCase();

    // ─────────────────────────────────────────────────────────
    // 1. CRITICAL: submit, payment, final confirmation
    // ─────────────────────────────────────────────────────────
    if (
      action.isFinalSubmission === true ||
      action.isCritical === true ||
      type === 'submit' ||
      type === 'payment'
    ) {
      return ActionRiskCategory.CRITICAL;
    }

    if (type === 'click') {
      const isSubmitBtn =
        /final_submit|confirm_submission|submit_application|final_confirm|proceed_to_payment|pay_now/i.test(targetName) ||
        /final.*submit|submit.*application|confirm.*submission|final.*confirmation|payment/i.test(actionDesc);

      if (isSubmitBtn) {
        return ActionRiskCategory.CRITICAL;
      }
    }

    // ─────────────────────────────────────────────────────────
    // 2. LOW_RISK: read, observe, screenshot
    // ─────────────────────────────────────────────────────────
    if (type === 'read' || type === 'observe' || type === 'screenshot') {
      return ActionRiskCategory.LOW_RISK;
    }

    // ─────────────────────────────────────────────────────────
    // 3. SENSITIVE: account credentials, financial, identity
    // ─────────────────────────────────────────────────────────
    // A. Account credentials
    const isAccount =
      /password|passcode|secret|auth_token|security_pin|change_password|reset_credentials/i.test(targetName);

    // B. Financial fields
    const isFinancial =
      targetName.startsWith('financial.') ||
      /income|annualincome|salary|bankaccount|ifsc|account_no|card_number|cvv|bank_name/i.test(targetName);

    // C. Identity fields
    const isIdentity =
      targetName.startsWith('identity.') ||
      /aadhaar|aadhar|uid|pan|pannumber|passport|passportnumber|ssn|voter_id|national_id/i.test(targetName);

    if (isAccount || isFinancial || isIdentity || action.isSensitive === true) {
      return ActionRiskCategory.SENSITIVE;
    }

    // ─────────────────────────────────────────────────────────
    // 4. NORMAL: fill, select, upload, navigate
    // ─────────────────────────────────────────────────────────
    return ActionRiskCategory.NORMAL;
  }

  /**
   * Primary Policy Evaluation:
   * Evaluates proposed action against policy rules before it reaches the Playwright runner.
   */
  evaluateAction({ action, context = {} }) {
    if (!action) {
      return this._buildResult({
        actionType: 'unknown',
        riskCategory: ActionRiskCategory.NORMAL,
        decision: PolicyDecision.BLOCKED,
        allowed: false,
        violationCode: 'ACTION_UNDEFINED',
        reason: 'No proposed action provided for policy evaluation.'
      });
    }

    const actionType = action.type || 'unknown';
    const target = action.semanticTarget || action.field || action.selector || null;
    const riskCategory = this.classifyAction(action, context);

    // 0. General Protocol Safety (applies to all actions)
    if (actionType === 'navigate' && action.url) {
      const urlStr = String(action.url).trim().toLowerCase();
      if (urlStr.startsWith('javascript:') || urlStr.startsWith('vbscript:')) {
        return this._buildResult({
          actionType,
          riskCategory,
          decision: PolicyDecision.BLOCKED,
          allowed: false,
          target,
          violationCode: PolicyViolationReason.UNSAFE_PROTOCOL,
          reason: `Navigation to unsafe protocol "${urlStr.slice(0, 15)}" is strictly prohibited by safety policy.`
        });
      }
    }

    // ─────────────────────────────────────────────────────────
    // RISK TIER 1: LOW_RISK
    // ─────────────────────────────────────────────────────────
    if (riskCategory === ActionRiskCategory.LOW_RISK) {
      return this._buildResult({
        actionType,
        riskCategory,
        decision: PolicyDecision.ALLOWED,
        allowed: true,
        target,
        confidence: 1.0,
        reason: 'Low risk action (read/observe/screenshot) approved for execution.'
      });
    }

    // ─────────────────────────────────────────────────────────
    // RISK TIER 2: NORMAL
    // ─────────────────────────────────────────────────────────
    if (riskCategory === ActionRiskCategory.NORMAL) {
      if ((actionType === 'fill' || actionType === 'select') && !action.isOptional) {
        if (action.value === undefined || action.value === null) {
          return this._buildResult({
            actionType,
            riskCategory,
            decision: PolicyDecision.BLOCKED,
            allowed: false,
            target,
            violationCode: PolicyViolationReason.UNRESOLVED_REQUIRED_FIELDS,
            reason: `Action for field "${target}" is missing required non-null value.`
          });
        }
      }

      return this._buildResult({
        actionType,
        riskCategory,
        decision: PolicyDecision.ALLOWED,
        allowed: true,
        target,
        confidence: action.confidence ?? 1.0,
        reason: 'Normal browser automation action approved for execution.'
      });
    }

    // ─────────────────────────────────────────────────────────
    // RISK TIER 3: SENSITIVE
    // ─────────────────────────────────────────────────────────
    if (riskCategory === ActionRiskCategory.SENSITIVE) {
      const confidence = action.confidence ?? context.confidence ?? 1.0;

      // Rule 3A: Confidence Threshold (min 0.85)
      if (confidence < this.minSensitiveConfidence) {
        return this._buildResult({
          actionType,
          riskCategory,
          decision: PolicyDecision.BLOCKED,
          allowed: false,
          target,
          confidence,
          violationCode: PolicyViolationReason.LOW_CONFIDENCE_FIELD,
          reason: `Sensitive field "${target}" has insufficient mapping confidence (${confidence} < ${this.minSensitiveConfidence}). Blocked by policy.`
        });
      }

      // Rule 3B: Unresolved Conflict Check
      const hasConflict =
        action.hasConflict === true ||
        context.hasConflicts === true ||
        context.fieldConflict === true ||
        context.knowledgeStatus === KnowledgeVerificationStatus.CONFLICT;

      if (hasConflict) {
        return this._buildResult({
          actionType,
          riskCategory,
          decision: PolicyDecision.BLOCKED,
          allowed: false,
          target,
          confidence,
          violationCode: PolicyViolationReason.UNRESOLVED_CONFLICT,
          reason: `Sensitive field "${target}" has unresolved conflicting evidence in the applicant knowledge graph. Blocked by policy.`
        });
      }

      return this._buildResult({
        actionType,
        riskCategory,
        decision: PolicyDecision.ALLOWED,
        allowed: true,
        target,
        confidence,
        reason: `Sensitive field "${target}" verified with high confidence (${confidence}) and no conflicting evidence.`
      });
    }

    // ─────────────────────────────────────────────────────────
    // RISK TIER 4: CRITICAL (Final submission / Payment)
    // ─────────────────────────────────────────────────────────
    if (riskCategory === ActionRiskCategory.CRITICAL) {
      return this._evaluateCriticalSubmission(action, context);
    }

    return this._buildResult({
      actionType,
      riskCategory,
      decision: PolicyDecision.ALLOWED,
      allowed: true,
      target,
      reason: 'Action approved.'
    });
  }

  /**
   * Enforces the 5 strict requirements for final submission.
   */
  _evaluateCriticalSubmission(action, context) {
    const actionType = action.type || 'submit';
    const target = action.semanticTarget || action.selector || 'final_submit';
    const fieldState = context.fieldState || context.answers || {};

    // 1. All required fields resolved
    if (Array.isArray(context.requiredFields) && context.requiredFields.length > 0) {
      const missing = context.requiredFields.filter((f) => {
        const val = fieldState[f];
        return val === undefined || val === null || String(val).trim() === '';
      });

      if (missing.length > 0) {
        return this._buildResult({
          actionType,
          riskCategory: ActionRiskCategory.CRITICAL,
          decision: PolicyDecision.BLOCKED,
          allowed: false,
          target,
          violationCode: PolicyViolationReason.UNRESOLVED_REQUIRED_FIELDS,
          reason: `Final submission blocked: Required fields [${missing.join(', ')}] are unresolved.`
        });
      }
    }

    // 2. Validation passed
    if (context.hasValidationErrors === true || context.validationStatus === 'FAILED') {
      return this._buildResult({
        actionType,
        riskCategory: ActionRiskCategory.CRITICAL,
        decision: PolicyDecision.BLOCKED,
        allowed: false,
        target,
        violationCode: 'VALIDATION_FAILED',
        reason: 'Final submission blocked: Form validation errors remain unresolved.'
      });
    }

    // 3. No unresolved conflicts
    if (context.hasConflicts === true) {
      return this._buildResult({
        actionType,
        riskCategory: ActionRiskCategory.CRITICAL,
        decision: PolicyDecision.BLOCKED,
        allowed: false,
        target,
        violationCode: PolicyViolationReason.UNRESOLVED_CONFLICT,
        reason: 'Final submission blocked: Active conflicts exist in applicant knowledge graph.'
      });
    }

    // 4. Explicit user confirmation & form mutation invalidation
    if (!context.confirmationToken) {
      return this._buildResult({
        actionType,
        riskCategory: ActionRiskCategory.CRITICAL,
        decision: PolicyDecision.BLOCKED,
        allowed: false,
        target,
        violationCode: PolicyViolationReason.MISSING_USER_CONFIRMATION,
        reason: 'Final submission requires explicit user confirmation. No confirmation token provided.'
      });
    }

    const tokenVerification = this.tokenService.verifyConfirmationToken({
      token: context.confirmationToken,
      currentFieldState: fieldState,
      applicationId: context.applicationId,
      userId: context.userId
    });

    if (!tokenVerification.valid) {
      return this._buildResult({
        actionType,
        riskCategory: ActionRiskCategory.CRITICAL,
        decision: PolicyDecision.BLOCKED,
        allowed: false,
        target,
        violationCode: tokenVerification.reason || PolicyViolationReason.INVALID_CONFIRMATION_TOKEN,
        reason: `Final submission blocked: ${tokenVerification.error || 'Confirmation token invalid.'}`,
        fieldStateHash: tokenVerification.currentHash || null,
        confirmationToken: context.confirmationToken
      });
    }

    // 5. Current page matches expected submission state
    if (context.expectedPageState) {
      const currentPageState = String(context.currentPageState || context.pageType || '').toUpperCase();
      const expectedPageState = String(context.expectedPageState).toUpperCase();

      if (currentPageState !== expectedPageState) {
        return this._buildResult({
          actionType,
          riskCategory: ActionRiskCategory.CRITICAL,
          decision: PolicyDecision.BLOCKED,
          allowed: false,
          target,
          violationCode: PolicyViolationReason.PAGE_STATE_MISMATCH,
          reason: `Current page state "${currentPageState}" does not match expected submission state "${expectedPageState}".`
        });
      }
    }

    // All 5 checks passed!
    return this._buildResult({
      actionType,
      riskCategory: ActionRiskCategory.CRITICAL,
      decision: PolicyDecision.ALLOWED,
      allowed: true,
      target,
      confidence: 1.0,
      fieldStateHash: tokenVerification.fieldStateHash,
      confirmationToken: context.confirmationToken,
      reason: 'All submission safety requirements verified: required fields resolved, validation passed, no conflicts, explicit confirmation token verified, page state matched.'
    });
  }

  /**
   * Constructs a canonical ActionPolicy evaluation result payload.
   */
  _buildResult({
    actionType,
    riskCategory,
    decision,
    allowed,
    target = null,
    violationCode = null,
    reason,
    confidence = 1.0,
    fieldStateHash = null,
    confirmationToken = null
  }) {
    const payload = {
      schemaVersion: '2.0.0',
      evaluationId: `pol_${crypto.randomUUID()}`,
      actionType: String(actionType),
      riskCategory,
      decision,
      target: target ? (typeof target === 'string' ? target : JSON.stringify(target)) : null,
      allowed: Boolean(allowed),
      violationCode: violationCode || null,
      reason,
      confidence: Number(confidence ?? 1.0),
      fieldStateHash: fieldStateHash || null,
      confirmationToken: confirmationToken || null,
      timestamp: new Date().toISOString()
    };

    const validation = validateActionPolicy(payload);
    if (!validation.valid) {
      console.warn('[ActionPolicyEngine] Schema validation warning:', validation.errors);
    }

    return {
      allowed: payload.allowed,
      decision: payload.decision,
      riskCategory: payload.riskCategory,
      violationCode: payload.violationCode,
      reason: payload.reason,
      confidence: payload.confidence,
      canonicalPayload: payload
    };
  }
}

export const defaultActionPolicyEngine = new ActionPolicyEngine();
