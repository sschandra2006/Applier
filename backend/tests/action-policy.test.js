/**
 * Action Policy & Submission Safety Test Suite
 * Applier 2.0 — Phase 12: Browser Action Policy and Submission Safety
 *
 * Verifies that:
 * 1. Attempt submission without confirmation -> BLOCKED.
 * 2. Attempt submission after form mutation -> BLOCKED (token invalidated).
 * 3. Attempt low-confidence field execution -> BLOCKED.
 * 4. Attempt unresolved conflict -> BLOCKED.
 * 5. Successful submission with valid token & matching form hash -> ALLOWED.
 * 6. Action risk tier classification (LOW_RISK, NORMAL, SENSITIVE, CRITICAL).
 * 7. Page state mismatch on submission -> BLOCKED.
 * 8. AI cannot bypass policy in VerifiedExecutionEngine.
 * 9. Canonical contracts validation for ActionPolicy and SubmissionConfirmation (v2.0.0).
 */

import { jest } from '@jest/globals';
import { chromium } from 'playwright';
import {
  ActionPolicyEngine,
  ConfirmationTokenService,
  defaultActionPolicyEngine,
  defaultConfirmationTokenService
} from '../../browser-worker/policy/index.js';
import { VerifiedExecutionEngine } from '../../browser-worker/execution/index.js';
import {
  ActionRiskCategory,
  PolicyDecision,
  PolicyViolationReason
} from '../../shared/enums/index.js';
import {
  validateActionPolicy,
  validateSubmissionConfirmation
} from '../../shared/validators/index.js';

describe('Applier 2.0 — Phase 12: Browser Action Policy and Submission Safety', () => {
  let tokenService;
  let policyEngine;

  beforeEach(() => {
    tokenService = new ConfirmationTokenService({
      secret: 'test_phase_12_secret_key_2026'
    });
    policyEngine = new ActionPolicyEngine({
      tokenService,
      minSensitiveConfidence: 0.85
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 1. TEST SUBMISSION WITHOUT CONFIRMATION
  // ─────────────────────────────────────────────────────────────
  describe('1. Attempt Submission Without Confirmation', () => {
    it('should strictly block final submission when no confirmation token is provided', () => {
      const submissionAction = {
        type: 'submit',
        target: '#btnFinalSubmit',
        description: 'Submit final scholarship application'
      };

      const context = {
        applicationId: 'app_1001',
        userId: 'user_5001',
        fieldState: { 'applicant.fullName': 'Rahul Kumar', 'identity.aadhaarNumber': '123456789012' },
        requiredFields: ['applicant.fullName', 'identity.aadhaarNumber'],
        hasValidationErrors: false,
        hasConflicts: false,
        confirmationToken: null // Missing explicit user confirmation
      };

      const result = policyEngine.evaluateAction({ action: submissionAction, context });

      expect(result.allowed).toBe(false);
      expect(result.decision).toBe(PolicyDecision.BLOCKED);
      expect(result.riskCategory).toBe(ActionRiskCategory.CRITICAL);
      expect(result.violationCode).toBe(PolicyViolationReason.MISSING_USER_CONFIRMATION);
      expect(result.reason).toContain('requires explicit user confirmation');

      // Canonical schema validation
      const validation = validateActionPolicy(result.canonicalPayload);
      expect(validation.valid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. TEST SUBMISSION AFTER FORM MUTATION
  // ─────────────────────────────────────────────────────────────
  describe('2. Attempt Submission After Form Mutation', () => {
    it('should invalidate confirmation and block submission when form fields change after confirmation', () => {
      const initialFieldState = {
        'applicant.fullName': 'Rahul Kumar',
        'identity.aadhaarNumber': '123456789012',
        'financial.annualIncome': '250000'
      };

      // 1. User grants confirmation on initial form state
      const confirmation = tokenService.generateConfirmationToken({
        applicationId: 'app_1001',
        userId: 'user_5001',
        fieldState: initialFieldState
      });

      expect(confirmation.isValid).toBe(true);
      expect(confirmation.token).toBeDefined();

      // 2. Form is materially mutated afterwards (applicant name or income altered)
      const mutatedFieldState = {
        ...initialFieldState,
        'applicant.fullName': 'Rahul Sharma' // Material mutation!
      };

      // 3. AI / runner attempts final submission with the old confirmation token
      const submissionAction = {
        type: 'click',
        selector: '#btnSubmitApplication',
        description: 'Submit application to government portal',
        isFinalSubmission: true
      };

      const context = {
        applicationId: 'app_1001',
        userId: 'user_5001',
        fieldState: mutatedFieldState, // Form has changed
        requiredFields: ['applicant.fullName', 'identity.aadhaarNumber'],
        confirmationToken: confirmation.token,
        hasValidationErrors: false,
        hasConflicts: false
      };

      const result = policyEngine.evaluateAction({ action: submissionAction, context });

      expect(result.allowed).toBe(false);
      expect(result.decision).toBe(PolicyDecision.BLOCKED);
      expect(result.riskCategory).toBe(ActionRiskCategory.CRITICAL);
      expect(result.violationCode).toBe(PolicyViolationReason.FORM_MUTATED_AFTER_CONFIRMATION);
      expect(result.reason).toContain('Form fields materially changed');

      // 4. Token is now permanently invalidated
      const secondCheck = tokenService.verifyConfirmationToken({
        token: confirmation.token,
        currentFieldState: initialFieldState,
        applicationId: 'app_1001',
        userId: 'user_5001'
      });
      expect(secondCheck.valid).toBe(false);
      expect(secondCheck.reason).toBe('TOKEN_EXPLICITLY_INVALIDATED');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. TEST LOW-CONFIDENCE FIELD EXECUTION
  // ─────────────────────────────────────────────────────────────
  describe('3. Attempt Low-Confidence Field Execution', () => {
    it('should block execution of sensitive financial fields when confidence is below 0.85', () => {
      const sensitiveAction = {
        type: 'fill',
        semanticTarget: 'financial.annualIncome',
        value: '350000',
        confidence: 0.62 // Insufficient confidence for sensitive financial field
      };

      const result = policyEngine.evaluateAction({
        action: sensitiveAction,
        context: { hasConflicts: false }
      });

      expect(result.allowed).toBe(false);
      expect(result.decision).toBe(PolicyDecision.BLOCKED);
      expect(result.riskCategory).toBe(ActionRiskCategory.SENSITIVE);
      expect(result.violationCode).toBe(PolicyViolationReason.LOW_CONFIDENCE_FIELD);
      expect(result.reason).toContain('insufficient mapping confidence');
      expect(result.reason).toContain('0.62 < 0.85');
    });

    it('should block execution of sensitive identity fields when confidence is below 0.85', () => {
      const sensitiveAction = {
        type: 'fill',
        semanticTarget: 'identity.aadhaarNumber',
        value: '998877665544',
        confidence: 0.75 // Insufficient confidence
      };

      const result = policyEngine.evaluateAction({
        action: sensitiveAction,
        context: { hasConflicts: false }
      });

      expect(result.allowed).toBe(false);
      expect(result.decision).toBe(PolicyDecision.BLOCKED);
      expect(result.riskCategory).toBe(ActionRiskCategory.SENSITIVE);
      expect(result.violationCode).toBe(PolicyViolationReason.LOW_CONFIDENCE_FIELD);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. TEST UNRESOLVED CONFLICT
  // ─────────────────────────────────────────────────────────────
  describe('4. Attempt Unresolved Conflict Execution', () => {
    it('should block sensitive field execution when knowledge graph has unresolved conflicts', () => {
      const sensitiveAction = {
        type: 'fill',
        semanticTarget: 'identity.panNumber',
        value: 'ABCDE1234F',
        confidence: 0.99
      };

      const context = {
        hasConflicts: true, // Knowledge graph has active conflict between documents
        fieldConflict: true
      };

      const result = policyEngine.evaluateAction({ action: sensitiveAction, context });

      expect(result.allowed).toBe(false);
      expect(result.decision).toBe(PolicyDecision.BLOCKED);
      expect(result.riskCategory).toBe(ActionRiskCategory.SENSITIVE);
      expect(result.violationCode).toBe(PolicyViolationReason.UNRESOLVED_CONFLICT);
      expect(result.reason).toContain('unresolved conflicting evidence');
    });

    it('should block final submission when applicant knowledge graph has unresolved conflicts', () => {
      const fieldState = { 'applicant.fullName': 'Ananya Sharma', 'identity.aadhaarNumber': '123456789012' };
      const confirmation = tokenService.generateConfirmationToken({
        applicationId: 'app_1001',
        userId: 'user_5001',
        fieldState
      });

      const submissionAction = {
        type: 'submit',
        description: 'Submit application'
      };

      const context = {
        applicationId: 'app_1001',
        userId: 'user_5001',
        fieldState,
        requiredFields: ['applicant.fullName', 'identity.aadhaarNumber'],
        confirmationToken: confirmation.token,
        hasValidationErrors: false,
        hasConflicts: true // Active conflict in knowledge graph!
      };

      const result = policyEngine.evaluateAction({ action: submissionAction, context });

      expect(result.allowed).toBe(false);
      expect(result.decision).toBe(PolicyDecision.BLOCKED);
      expect(result.riskCategory).toBe(ActionRiskCategory.CRITICAL);
      expect(result.violationCode).toBe(PolicyViolationReason.UNRESOLVED_CONFLICT);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. TEST SUCCESSFUL CONFIRMED SUBMISSION
  // ─────────────────────────────────────────────────────────────
  describe('5. Successful Confirmed Submission', () => {
    it('should approve final submission when all 5 requirements are satisfied', () => {
      const fieldState = {
        'applicant.fullName': 'Rahul Kumar',
        'identity.aadhaarNumber': '123456789012',
        'contact.email': 'rahul@example.com'
      };

      const confirmation = tokenService.generateConfirmationToken({
        applicationId: 'app_1001',
        userId: 'user_5001',
        fieldState
      });

      const submissionAction = {
        type: 'click',
        selector: '#btnSubmitApplication',
        description: 'Submit application to government portal',
        isFinalSubmission: true
      };

      const context = {
        applicationId: 'app_1001',
        userId: 'user_5001',
        fieldState,
        requiredFields: ['applicant.fullName', 'identity.aadhaarNumber', 'contact.email'],
        confirmationToken: confirmation.token,
        hasValidationErrors: false,
        hasConflicts: false,
        expectedPageState: 'REVIEW',
        currentPageState: 'REVIEW'
      };

      const result = policyEngine.evaluateAction({ action: submissionAction, context });

      expect(result.allowed).toBe(true);
      expect(result.decision).toBe(PolicyDecision.ALLOWED);
      expect(result.riskCategory).toBe(ActionRiskCategory.CRITICAL);
      expect(result.reason).toContain('All submission safety requirements verified');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. ACTION RISK TIER CLASSIFICATION
  // ─────────────────────────────────────────────────────────────
  describe('6. Action Risk Tier Classification', () => {
    it('should classify read, observe, screenshot as LOW_RISK', () => {
      expect(policyEngine.classifyAction({ type: 'read' })).toBe(ActionRiskCategory.LOW_RISK);
      expect(policyEngine.classifyAction({ type: 'observe' })).toBe(ActionRiskCategory.LOW_RISK);
      expect(policyEngine.classifyAction({ type: 'screenshot' })).toBe(ActionRiskCategory.LOW_RISK);
    });

    it('should classify standard fill, select, upload, navigate as NORMAL', () => {
      expect(policyEngine.classifyAction({ type: 'fill', selector: '#txtCity' })).toBe(
        ActionRiskCategory.NORMAL
      );
      expect(policyEngine.classifyAction({ type: 'select', selector: '#selState' })).toBe(
        ActionRiskCategory.NORMAL
      );
      expect(policyEngine.classifyAction({ type: 'upload', selector: '#fileResume' })).toBe(
        ActionRiskCategory.NORMAL
      );
      expect(policyEngine.classifyAction({ type: 'navigate', url: 'https://example.com' })).toBe(
        ActionRiskCategory.NORMAL
      );
    });

    it('should classify account credentials, financial, and identity fields as SENSITIVE', () => {
      expect(
        policyEngine.classifyAction({ type: 'fill', semanticTarget: 'financial.annualIncome' })
      ).toBe(ActionRiskCategory.SENSITIVE);
      expect(
        policyEngine.classifyAction({ type: 'fill', semanticTarget: 'identity.aadhaarNumber' })
      ).toBe(ActionRiskCategory.SENSITIVE);
      expect(
        policyEngine.classifyAction({ type: 'fill', selector: '#txtPassword', name: 'user_password' })
      ).toBe(ActionRiskCategory.SENSITIVE);
    });

    it('should classify submit, payment, and final confirmation as CRITICAL', () => {
      expect(policyEngine.classifyAction({ type: 'submit' })).toBe(ActionRiskCategory.CRITICAL);
      expect(policyEngine.classifyAction({ type: 'payment' })).toBe(ActionRiskCategory.CRITICAL);
      expect(policyEngine.classifyAction({ type: 'click', isFinalSubmission: true })).toBe(
        ActionRiskCategory.CRITICAL
      );
      expect(
        policyEngine.classifyAction({
          type: 'click',
          description: 'Click final submit application button'
        })
      ).toBe(ActionRiskCategory.CRITICAL);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 7. PAGE STATE MISMATCH ON SUBMISSION
  // ─────────────────────────────────────────────────────────────
  describe('7. Page State Mismatch On Submission', () => {
    it('should block submission if current page state does not match expected submission step', () => {
      const fieldState = { 'applicant.fullName': 'Rahul Kumar' };
      const confirmation = tokenService.generateConfirmationToken({
        applicationId: 'app_1001',
        userId: 'user_5001',
        fieldState
      });

      const submissionAction = { type: 'submit' };
      const context = {
        applicationId: 'app_1001',
        userId: 'user_5001',
        fieldState,
        confirmationToken: confirmation.token,
        hasValidationErrors: false,
        hasConflicts: false,
        expectedPageState: 'REVIEW',
        currentPageState: 'LANDING' // Mismatch: browser is still on landing page!
      };

      const result = policyEngine.evaluateAction({ action: submissionAction, context });

      expect(result.allowed).toBe(false);
      expect(result.decision).toBe(PolicyDecision.BLOCKED);
      expect(result.violationCode).toBe(PolicyViolationReason.PAGE_STATE_MISMATCH);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 8. AI CANNOT BYPASS POLICY IN EXECUTION LOOP
  // ─────────────────────────────────────────────────────────────
  describe('8. AI Cannot Bypass Policy in VerifiedExecutionEngine', () => {
    it('should halt execution loop immediately when proposed action violates action policy', async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const html = `data:text/html,<!DOCTYPE html><html><head><title>Secure Portal</title></head><body>
          <button id="finalSubmitBtn" type="button" onclick="window.__submitted = true;">Final Submit</button>
        </body></html>`;

        await page.goto(html);

        const steps = [
          {
            type: 'click',
            selector: '#finalSubmitBtn',
            isFinalSubmission: true,
            description: 'Submit final application'
          }
        ];

        const engine = new VerifiedExecutionEngine({
          actionPolicyEngine: policyEngine
        });

        // Execute without confirmation token
        const result = await engine.execute({
          jobId: 'job_bypass_test',
          page,
          steps,
          confirmationToken: null // No confirmation token
        });

        expect(result.status).toBe('FAILED');
        expect(result.policyViolation).toBe(PolicyViolationReason.MISSING_USER_CONFIRMATION);

        // Verify button was never clicked in browser
        const submitted = await page.evaluate(() => window.__submitted);
        expect(submitted).toBeUndefined();
      } finally {
        await browser.close().catch(() => {});
      }
    }, 20000);
  });

  // ─────────────────────────────────────────────────────────────
  // 9. CANONICAL CONTRACT COMPLIANCE
  // ─────────────────────────────────────────────────────────────
  describe('9. Canonical Contract Compliance', () => {
    it('should generate valid SubmissionConfirmation payloads adhering to v2.0.0 schema', () => {
      const token = tokenService.generateConfirmationToken({
        applicationId: 'app_canonical_1',
        userId: 'user_canonical_1',
        fieldState: { name: 'Aarav' }
      });

      const validation = validateSubmissionConfirmation(token);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(token.schemaVersion).toBe('2.0.0');
    });

    it('should generate valid ActionPolicy evaluation payloads adhering to v2.0.0 schema', () => {
      const evaluation = policyEngine.evaluateAction({
        action: { type: 'read', selector: '#preview' },
        context: {}
      });

      const validation = validateActionPolicy(evaluation.canonicalPayload);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(evaluation.canonicalPayload.schemaVersion).toBe('2.0.0');
    });
  });
});
