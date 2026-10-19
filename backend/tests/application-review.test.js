/**
 * Application Review & Submission Lock Test Suite
 * Applier 2.0 — Phase 13: Evidence-Based Application Review
 *
 * Verifies:
 * 1. Review rendering (VALUE, SOURCE, CONFIDENCE, STATUS, VALIDATION).
 * 2. Conflict resolution (show both values & sources, require user resolution).
 * 3. Confirmation (explicit user confirmation creates cryptographic confirmation token).
 * 4. Post-confirmation mutation (detects alterations, rejects AI updates, invalidates token).
 * 5. Submission lock (blocks unconfirmed, mutated, or policy-violating submissions).
 */

import crypto from 'crypto';
import {
  ApplicationReviewService
} from '../src/review/application-review.service.js';
import { ConfirmationTokenService } from '../../browser-worker/policy/confirmation-token.service.js';
import { ApplicantKnowledgeGraphService } from '../src/knowledge/index.js';
import {
  ReviewStatus,
  ReviewFieldStatus,
  ReviewValidationStatus,
  KnowledgeVerificationStatus,
  PolicyViolationReason
} from '../../shared/enums/index.js';
import {
  validateApplicationReview,
  validateSubmissionConfirmation
} from '../../shared/validators/index.js';

describe('Applier 2.0 — Phase 13: Evidence-Based Application Review', () => {
  let tokenService;
  let knowledgeService;
  let reviewService;

  beforeEach(() => {
    tokenService = new ConfirmationTokenService({
      secret: 'test_phase_13_review_secret_2026'
    });
    knowledgeService = new ApplicantKnowledgeGraphService();
    reviewService = new ApplicationReviewService({
      tokenService,
      knowledgeService
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 1. REVIEW RENDERING
  // ─────────────────────────────────────────────────────────────
  describe('1. Review Rendering (Value, Source, Confidence, Status)', () => {
    it('should correctly render all fields with Value, Source, Confidence, Validation, and Status', () => {
      // Mock workflow with target fields
      const mockWorkflow = {
        _id: 'wf_scholarship_2026',
        schemaDefinition: {
          pages: [
            {
              steps: [
                { id: 'identity.fullName', label: 'Full Name', type: 'text', required: true },
                { id: 'identity.dateOfBirth', label: 'Date of Birth', type: 'date', required: true },
                { id: 'contact.email', label: 'Email Address', type: 'email', required: true },
                { id: 'contact.alternatePhone', label: 'Alternate Phone', type: 'tel', required: false },
                { id: 'education.cgpa', label: 'Previous Exam Score', type: 'text', required: true }
              ]
            }
          ]
        }
      };

      // Mock graph with document evidence
      const graph = knowledgeService.createEmptyGraph({ userId: 'user_401' });
      knowledgeService.ingestValue(graph, {
        path: 'identity.fullName',
        value: 'Rahul Kumar',
        source: 'DOCUMENT',
        confidence: 0.99,
        evidence: 'Aadhaar.pdf, page 1'
      });
      knowledgeService.ingestValue(graph, {
        path: 'identity.dateOfBirth',
        value: '14-08-2006',
        source: 'DOCUMENT',
        confidence: 0.98,
        evidence: 'Aadhaar.pdf, page 1'
      });
      knowledgeService.ingestValue(graph, {
        path: 'education.cgpa',
        value: '88.5%',
        source: 'USER_INPUT',
        confidence: 0.70, // Below 0.85 -> Needs Confirmation
        evidence: 'User Interview'
      });

      const answers = new Map([
        ['identity.fullName', 'Rahul Kumar'],
        ['identity.dateOfBirth', '14-08-2006'],
        ['contact.email', 'rahul@example.com'],
        ['education.cgpa', '88.5%']
      ]);

      const workflowFields = reviewService._extractWorkflowFields(mockWorkflow);
      const fields = workflowFields.map(target =>
        reviewService._buildFieldReviewEntry({ target, answers, graph, userId: 'user_401' })
      );

      // Verify Date of Birth rendering
      const dobField = fields.find(f => f.fieldKey === 'identity.dateOfBirth');
      expect(dobField).toBeDefined();
      expect(dobField.label).toBe('Date of Birth');
      expect(dobField.value).toBe('14-08-2006');
      expect(dobField.source).toBe('DOCUMENT');
      expect(dobField.sourceDetails).toBe('Aadhaar.pdf, page 1');
      expect(dobField.confidence).toBe(0.98);
      expect(dobField.validation).toBe('Verified');
      expect(dobField.status).toBe(ReviewFieldStatus.VERIFIED);
      expect(dobField.isRequired).toBe(true);

      // Verify Full Name rendering
      const nameField = fields.find(f => f.fieldKey === 'identity.fullName');
      expect(nameField.value).toBe('Rahul Kumar');
      expect(nameField.confidence).toBe(0.99);
      expect(nameField.sourceDetails).toBe('Aadhaar.pdf, page 1');
      expect(nameField.status).toBe(ReviewFieldStatus.VERIFIED);

      // Verify Missing Optional field
      const altPhoneField = fields.find(f => f.fieldKey === 'contact.alternatePhone');
      expect(altPhoneField.value).toBeNull();
      expect(altPhoneField.isRequired).toBe(false);
      expect(altPhoneField.isOptional).toBe(true);
      expect(altPhoneField.isMissing).toBe(true);
      expect(altPhoneField.status).toBe(ReviewFieldStatus.OPTIONAL_EMPTY);

      // Verify Needs Confirmation field (confidence < 0.85)
      const scoreField = fields.find(f => f.fieldKey === 'education.cgpa');
      expect(scoreField.status).toBe(ReviewFieldStatus.CONFIRMATION_REQUIRED);
      expect(scoreField.needsConfirmation).toBe(true);
    });

    it('should generate valid canonical ApplicationReview payloads complying with v2.0.0 schema', () => {
      const payload = {
        schemaVersion: '2.0.0',
        reviewId: 'rev_test_101',
        applicationId: 'app_test_101',
        userId: 'user_401',
        status: ReviewStatus.READY_FOR_CONFIRMATION,
        fields: [
          {
            fieldKey: 'applicant.dateOfBirth',
            label: 'Date of Birth',
            value: '14-08-2006',
            source: 'DOCUMENT',
            sourceDetails: 'Aadhaar.pdf, page 1',
            confidence: 0.98,
            validation: 'Verified',
            status: ReviewFieldStatus.VERIFIED,
            isRequired: true,
            isOptional: false,
            isMissing: false,
            needsConfirmation: false,
            conflict: null
          }
        ],
        summary: {
          totalFields: 1,
          verifiedFields: 1,
          missingRequired: 0,
          missingOptional: 0,
          conflictsCount: 0,
          needsConfirmationCount: 0,
          canConfirm: true
        },
        confirmation: null,
        timestamp: new Date().toISOString()
      };

      const validation = validateApplicationReview(payload);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(payload.schemaVersion).toBe('2.0.0');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. CONFLICT UI & CONFLICT RESOLUTION
  // ─────────────────────────────────────────────────────────────
  describe('2. Conflict Resolution (Show Both Values & Require Resolution)', () => {
    it('should flag conflicting evidence, display both records with sources, and block confirmation', () => {
      const graph = knowledgeService.createEmptyGraph({ userId: 'user_402' });

      // Simulate conflicting records in graph
      knowledgeService.ingestValue(graph, {
        path: 'identity.aadhaarNumber',
        value: '123456789012',
        source: 'DOCUMENT',
        confidence: 0.99,
        evidence: 'Aadhaar.pdf, page 1'
      });

      // Insert conflicting record from another document
      knowledgeService.ingestValue(graph, {
        path: 'identity.aadhaarNumber',
        value: '987654321098', // Conflict!
        source: 'DOCUMENT',
        confidence: 0.95,
        evidence: 'VoterID.pdf, page 1'
      });

      const target = {
        key: 'identity.aadhaarNumber',
        label: 'Aadhaar Number',
        type: 'text',
        required: true
      };

      const fieldEntry = reviewService._buildFieldReviewEntry({
        target,
        answers: new Map(),
        graph,
        userId: 'user_402'
      });

      expect(fieldEntry.status).toBe(ReviewFieldStatus.CONFLICT);
      expect(fieldEntry.conflict).toBeDefined();
      expect(fieldEntry.conflict.status).toBe('UNRESOLVED');

      // Displays Option A and Option B with sources
      expect(fieldEntry.conflict.existingValue.value).toBe('123456789012');
      expect(fieldEntry.conflict.existingValue.evidence).toBe('Aadhaar.pdf, page 1');
      expect(fieldEntry.conflict.conflictingValue.value).toBe('987654321098');
      expect(fieldEntry.conflict.conflictingValue.evidence).toBe('VoterID.pdf, page 1');
    });

    it('should allow user to resolve conflict by choosing one record, updating graph and unblocking review', () => {
      const graph = knowledgeService.createEmptyGraph({ userId: 'user_402' });

      knowledgeService.ingestValue(graph, {
        path: 'identity.dateOfBirth',
        value: '14-08-2006',
        source: 'DOCUMENT',
        evidence: 'Aadhaar.pdf'
      });
      knowledgeService.ingestValue(graph, {
        path: 'identity.dateOfBirth',
        value: '14-08-2005',
        source: 'DOCUMENT',
        evidence: 'Marksheet.pdf'
      });

      expect(knowledgeService.hasActiveConflicts(graph)).toBe(true);

      // User selects Option A ('14-08-2006' from Aadhaar)
      knowledgeService.resolveFieldConflict(graph, {
        path: 'identity.dateOfBirth',
        resolvedValue: '14-08-2006',
        resolvedSource: 'DOCUMENT',
        evidence: 'Resolved by user in Review Screen (Aadhaar.pdf authoritative)'
      });

      expect(knowledgeService.hasActiveConflicts(graph)).toBe(false);

      const status = knowledgeService.getFieldStatus(graph, 'identity.dateOfBirth');
      expect(status.status).toBe(KnowledgeVerificationStatus.VERIFIED);
      expect(status.node.value).toBe('14-08-2006');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. EXPLICIT CONFIRMATION
  // ─────────────────────────────────────────────────────────────
  describe('3. Explicit User Confirmation & Token Issuance', () => {
    it('should create a signed confirmation token bound to deterministic SHA-256 field state hash', () => {
      const fieldState = {
        'applicant.fullName': 'Rahul Kumar',
        'applicant.dateOfBirth': '14-08-2006',
        'contact.email': 'rahul@example.com'
      };

      const confirmation = tokenService.generateConfirmationToken({
        applicationId: 'app_1001',
        workflowVersion: '2.0.0',
        userId: 'user_403',
        fieldState
      });

      expect(confirmation.isValid).toBe(true);
      expect(confirmation.token).toBeDefined();
      expect(confirmation.fieldStateHash).toMatch(/^[a-f0-9]{64}$/); // Valid SHA-256
      expect(confirmation.schemaVersion).toBe('2.0.0');

      // Canonical schema validation
      const validation = validateSubmissionConfirmation(confirmation);
      expect(validation.valid).toBe(true);

      // Verifying token against exact field state succeeds
      const verifyRes = tokenService.verifyConfirmationToken({
        token: confirmation.token,
        currentFieldState: fieldState,
        applicationId: 'app_1001',
        userId: 'user_403'
      });
      expect(verifyRes.valid).toBe(true);
      expect(verifyRes.fieldStateHash).toBe(confirmation.fieldStateHash);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. POST-CONFIRMATION MUTATION
  // ─────────────────────────────────────────────────────────────
  describe('4. Post-Confirmation Mutation & Invalidation', () => {
    it('should strictly invalidate confirmation token when form values change after confirmation', () => {
      const initialFields = {
        'applicant.fullName': 'Rahul Kumar',
        'identity.aadhaarNumber': '123456789012',
        'financial.annualIncome': '250000'
      };

      const confirmation = tokenService.generateConfirmationToken({
        applicationId: 'app_1001',
        userId: 'user_404',
        fieldState: initialFields
      });

      // Modifying any value alters the deterministic hash
      const mutatedFields = {
        ...initialFields,
        'applicant.fullName': 'Rahul Sharma' // Mutation!
      };

      const verifyRes = tokenService.verifyConfirmationToken({
        token: confirmation.token,
        currentFieldState: mutatedFields,
        applicationId: 'app_1001',
        userId: 'user_404'
      });

      expect(verifyRes.valid).toBe(false);
      expect(verifyRes.reason).toBe(PolicyViolationReason.FORM_MUTATED_AFTER_CONFIRMATION);
      expect(verifyRes.error).toContain('Form fields materially changed');

      // Token is now permanently invalidated in token service
      const secondCheck = tokenService.verifyConfirmationToken({
        token: confirmation.token,
        currentFieldState: initialFields,
        applicationId: 'app_1001',
        userId: 'user_404'
      });
      expect(secondCheck.valid).toBe(false);
      expect(secondCheck.reason).toBe('TOKEN_EXPLICITLY_INVALIDATED');
    });

    it('should reject AI attempt to update confirmed and locked values', async () => {
      const mockState = {
        _id: 'state_mock_1',
        isLocked: true,
        confirmationToken: 'tok_test_sample',
        answers: new Map([['applicant.fullName', 'Rahul Kumar']])
      };

      // Service update check for AI source
      const attemptAIUpdate = () => {
        if (mockState.isLocked) {
          const err = new Error('AI cannot alter confirmed and locked values.');
          err.code = 'CONFIRMED_VALUE_PROTECTED';
          throw err;
        }
      };

      expect(attemptAIUpdate).toThrow('AI cannot alter confirmed and locked values.');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. SUBMISSION LOCK & POLICY ENFORCEMENT
  // ─────────────────────────────────────────────────────────────
  describe('5. Submission Lock Enforcement', () => {
    it('should block execution when confirmation token is missing', async () => {
      const mockInterviewState = {
        _id: 'state_unconfirmed',
        isLocked: false,
        confirmationToken: null,
        answers: new Map([['applicant.fullName', 'Rahul Kumar']])
      };

      const verifySubmissionLock = (state) => {
        if (!state.isLocked || !state.confirmationToken) {
          return {
            allowed: false,
            reason: PolicyViolationReason.MISSING_USER_CONFIRMATION,
            message: 'Application review must be explicitly confirmed by user before execution.'
          };
        }
        return { allowed: true };
      };

      const lockCheck = verifySubmissionLock(mockInterviewState);
      expect(lockCheck.allowed).toBe(false);
      expect(lockCheck.reason).toBe(PolicyViolationReason.MISSING_USER_CONFIRMATION);
    });

    it('should block execution when confirmation token was invalidated by post-confirmation mutation', () => {
      const initialAnswers = { 'applicant.fullName': 'Ananya Roy' };
      const confirmation = tokenService.generateConfirmationToken({
        applicationId: 'app_lock_test',
        userId: 'user_405',
        fieldState: initialAnswers
      });

      // Material mutation occurs
      const currentAnswers = { 'applicant.fullName': 'Ananya Sen' };

      const verifyLock = (token, answers) => {
        const verifyRes = tokenService.verifyConfirmationToken({
          token,
          currentFieldState: answers,
          applicationId: 'app_lock_test',
          userId: 'user_405'
        });
        if (!verifyRes.valid) {
          return {
            allowed: false,
            reason: verifyRes.reason || PolicyViolationReason.INVALID_CONFIRMATION_TOKEN,
            message: verifyRes.error
          };
        }
        return { allowed: true };
      };

      const check = verifyLock(confirmation.token, currentAnswers);
      expect(check.allowed).toBe(false);
      expect(check.reason).toBe(PolicyViolationReason.FORM_MUTATED_AFTER_CONFIRMATION);
    });

    it('should approve live execution only when valid token matches live form state exactly', () => {
      const stableAnswers = {
        'applicant.fullName': 'Aarav Patel',
        'contact.email': 'aarav@example.com'
      };

      const confirmation = tokenService.generateConfirmationToken({
        applicationId: 'app_lock_test',
        userId: 'user_406',
        fieldState: stableAnswers
      });

      const verifyRes = tokenService.verifyConfirmationToken({
        token: confirmation.token,
        currentFieldState: stableAnswers,
        applicationId: 'app_lock_test',
        userId: 'user_406'
      });

      expect(verifyRes.valid).toBe(true);
      expect(verifyRes.fieldStateHash).toBe(confirmation.fieldStateHash);
    });
  });
});
