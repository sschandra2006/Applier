/**
 * Canonical Contract Test Suite — Node.js / Jest
 * Phase 1: Canonical Shared Contract Layer
 *
 * Verifies that:
 * 1. Node payloads validate against canonical JSON schemas.
 * 2. Invalid payloads are rejected consistently with clear errors.
 * 3. Version mismatches (e.g. legacy v1.x) are detected and handled explicitly.
 * 4. Model adapters correctly bridge Mongoose documents to canonical API contracts.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  validateCanonical,
  validateCanonicalOrThrow,
  validateWorkflow,
  validateExecutionPlan,
  validateInterviewState,
  validateAutomationJob,
  validateApplicantProfile,
  validateDocument,
  validateApplication,
  validateHumanCheckpoint,
  validateSemanticFieldMapping,
  validateRuntimeLocator,
  validateActionVerification,
  validateSubmissionConfirmation,
  validateActionPolicy,
  validateApplicationReview,
  validateVerifiedSubmission,
  validateAutomationEvent,
  validateWebsiteFingerprint,
  validateUniversalApplicationSession,
  validateApplicationHierarchy,
  validateModelRoutingDecision,
  validateSecurityAuditEvent,
  validateQaLabScenario,
  validateSystemMetrics,
  validateScalingAlert,
  schemas
} from '../../shared/validators/index.js';

import {
  adaptCanonicalWorkflowToMongoose,
  adaptMongooseWorkflowToCanonical,
  adaptMongooseInterviewStateToCanonical,
  adaptMongooseAutomationJobToCanonical,
  adaptMongooseDocumentToCanonical
} from '../../shared/validators/adapters.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../../shared/fixtures');

describe('Canonical Contract System (Phase 1)', () => {

  describe('1. Canonical Schemas Registration', () => {
    const requiredSchemas = [
      'applicant-profile',
      'applicant-field',
      'document',
      'document-evidence',
      'website-field',
      'browser-observation',
      'browser-action',
      'verification-result',
      'workflow',
      'execution-plan',
      'execution-step',
      'execution-checkpoint',
      'automation-job',
      'interview-state',
      'application',
      'human-checkpoint',
      'semantic-page-model',
      'applicant-knowledge-graph',
      'semantic-field-mapping',
      'runtime-locator',
      'action-verification',
      'submission-confirmation',
      'action-policy',
      'application-review',
      'verified-submission',
      'automation-event',
      'website-fingerprint',
      'universal-application-session',
      'application-hierarchy',
      'model-routing-decision',
      'security-audit-event',
      'qa-lab-scenario',
      'system-metrics',
      'scaling-alert'
    ];

    it.each(requiredSchemas)('should have registered schema: %s', (schemaName) => {
      expect(schemas[schemaName]).toBeDefined();
      expect(schemas[schemaName].$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(schemas[schemaName].properties.schemaVersion.const).toBe('2.0.0');
    });
  });

  describe('2. Valid Payloads Pass Canonical Validation', () => {
    it('should validate canonical workflow valid fixture', () => {
      const validWorkflow = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'valid/workflow.valid.json'), 'utf8')
      );
      const result = validateWorkflow(validWorkflow);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.version).toBe('2.0.0');
    });

    it('should validate canonical execution-plan valid fixture', () => {
      const validPlan = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'valid/execution-plan.valid.json'), 'utf8')
      );
      const result = validateExecutionPlan(validPlan);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.version).toBe('2.0.0');
    });

    it('should validate canonical interview-state valid fixture', () => {
      const validState = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'valid/interview-state.valid.json'), 'utf8')
      );
      const result = validateInterviewState(validState);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.version).toBe('2.0.0');
    });

    it('should validate canonical automation-job valid fixture', () => {
      const validJob = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'valid/automation-job.valid.json'), 'utf8')
      );
      const result = validateAutomationJob(validJob);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.version).toBe('2.0.0');
    });

    it('should validate canonical applicant-profile', () => {
      const profile = {
        schemaVersion: '2.0.0',
        applicantId: 'user_123',
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+919876543210',
        gender: 'FEMALE',
        dateOfBirth: '2000-01-15',
        fields: [
          {
            schemaVersion: '2.0.0',
            fieldKey: 'category',
            fieldLabel: 'Social Category',
            fieldType: 'SELECT',
            fieldValue: 'GEN',
            source: 'INTERVIEW',
            confidence: 1.0,
            verified: true
          }
        ]
      };
      const result = validateApplicantProfile(profile);
      expect(result.valid).toBe(true);
    });

    it('should validate canonical document payload', () => {
      const doc = {
        schemaVersion: '2.0.0',
        documentId: 'doc_555',
        userId: 'user_123',
        type: 'PASSPORT',
        fileName: 'passport.pdf',
        fileUrl: 'https://storage.applier.ai/docs/passport.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1048576,
        validationStatus: 'VALID'
      };
      const result = validateDocument(doc);
      expect(result.valid).toBe(true);
    });

    it('should validate canonical application record', () => {
      const app = {
        schemaVersion: '2.0.0',
        applicationId: 'app_777',
        userId: 'user_123',
        workflowId: 'wf_test_12345',
        interviewStateId: 'state_112233',
        status: 'SUBMITTED',
        applicationNumber: 'NSP-2026-9999',
        submittedAt: new Date().toISOString()
      };
      const result = validateApplication(app);
      expect(result.valid).toBe(true);
    });

    it('should validate canonical human checkpoint', () => {
      const checkpoint = {
        schemaVersion: '2.0.0',
        checkpointId: 'chk_101',
        jobId: 'job_778899',
        fieldName: 'otpCode',
        pauseReason: 'OTP',
        stepIndex: 2,
        resumeFromIndex: 3,
        resolved: false
      };
      const result = validateHumanCheckpoint(checkpoint);
      expect(result.valid).toBe(true);
    });

    it('should validate canonical semantic-field-mapping valid fixture', () => {
      const validMapping = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'valid/semantic-field-mapping.valid.json'), 'utf8')
      );
      const result = validateSemanticFieldMapping(validMapping);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.version).toBe('2.0.0');
    });

    it('should validate canonical runtime-locator valid fixture', () => {
      const validLocator = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'valid/runtime-locator.valid.json'), 'utf8')
      );
      const result = validateRuntimeLocator(validLocator);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.version).toBe('2.0.0');
    });

    it('should validate canonical action-verification valid fixture', () => {
      const validVerification = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'valid/action-verification.valid.json'), 'utf8')
      );
      const result = validateActionVerification(validVerification);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.version).toBe('2.0.0');
    });

    it('should validate canonical submission-confirmation valid fixture', () => {
      const validConfirmation = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'valid/submission-confirmation.valid.json'), 'utf8')
      );
      const result = validateSubmissionConfirmation(validConfirmation);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.version).toBe('2.0.0');
    });

    it('should validate canonical action-policy valid fixture', () => {
      const validPolicy = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'valid/action-policy.valid.json'), 'utf8')
      );
      const result = validateActionPolicy(validPolicy);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.version).toBe('2.0.0');
    });

    it('should validate canonical application-review valid fixture', () => {
      const validReview = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'valid/application-review.valid.json'), 'utf8')
      );
      const result = validateApplicationReview(validReview);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.version).toBe('2.0.0');
    });

    it('should validate canonical verified-submission valid fixture', () => {
      const validSubmission = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'valid/verified-submission.valid.json'), 'utf8')
      );
      const result = validateVerifiedSubmission(validSubmission);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.version).toBe('2.0.0');
    });

    it('should validate canonical automation-event valid fixture', () => {
      const validEvent = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'valid/automation-event.valid.json'), 'utf8')
      );
      const result = validateAutomationEvent(validEvent);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.version).toBe('2.0.0');
    });

    it('should validate canonical website-fingerprint valid fixture', () => {
      const validFingerprint = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'valid/website-fingerprint.valid.json'), 'utf8')
      );
      const result = validateWebsiteFingerprint(validFingerprint);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.version).toBe('2.0.0');
    });

    it('should validate canonical universal-application-session valid fixture', () => {
      const validSession = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'valid/universal-application-session.valid.json'), 'utf8')
      );
      const result = validateUniversalApplicationSession(validSession);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.version).toBe('2.0.0');
    });

    it('should validate canonical application-hierarchy valid fixture', () => {
      const validHierarchy = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'valid/application-hierarchy.valid.json'), 'utf8')
      );
      const result = validateApplicationHierarchy(validHierarchy);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.version).toBe('2.0.0');
    });

    it('should validate canonical model-routing-decision valid fixture', () => {
      const validRouting = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'valid/model-routing-decision.valid.json'), 'utf8')
      );
      const result = validateModelRoutingDecision(validRouting);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.version).toBe('2.0.0');
    });

    it('should validate canonical security-audit-event valid fixture', () => {
      const validSec = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'valid/security-audit-event.valid.json'), 'utf8')
      );
      const result = validateSecurityAuditEvent(validSec);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.version).toBe('2.0.0');
    });

    it('should validate canonical qa-lab-scenario valid fixture', () => {
      const validQa = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'valid/qa-lab-scenario.valid.json'), 'utf8')
      );
      const result = validateQaLabScenario(validQa);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.version).toBe('2.0.0');
    });

    it('should validate canonical system-metrics valid fixture', () => {
      const validMetrics = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'valid/system-metrics.valid.json'), 'utf8')
      );
      const result = validateSystemMetrics(validMetrics);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.version).toBe('2.0.0');
    });

    it('should validate canonical scaling-alert valid fixture', () => {
      const validAlert = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'valid/scaling-alert.valid.json'), 'utf8')
      );
      const result = validateScalingAlert(validAlert);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.version).toBe('2.0.0');
    });
  });

  describe('3. Invalid Payloads Rejected Consistently', () => {
    it('should reject invalid workflow fixture (missing required fields, bad URL)', () => {
      const invalidWorkflow = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'invalid/workflow.invalid.json'), 'utf8')
      );
      const result = validateWorkflow(invalidWorkflow);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.message.includes('required'))).toBe(true);
    });

    it('should reject execution plan with unsupported step type', () => {
      const invalidPlan = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'invalid/execution-plan.invalid.json'), 'utf8')
      );
      const result = validateExecutionPlan(invalidPlan);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should throw CanonicalValidationError when validateCanonicalOrThrow is called with invalid payload', () => {
      const invalidPayload = { schemaVersion: '2.0.0', name: 'missing required fields' };
      expect(() => {
        validateCanonicalOrThrow('workflow', invalidPayload);
      }).toThrow();
    });

    it('should reject non-object or null payloads gracefully', () => {
      const resultNull = validateCanonical('workflow', null);
      expect(resultNull.valid).toBe(false);
      expect(resultNull.errors[0].message).toContain('non-null object');

      const resultString = validateCanonical('workflow', 'string_payload');
      expect(resultString.valid).toBe(false);
    });

    it('should reject unknown schema names gracefully', () => {
      const result = validateCanonical('non-existent-schema', { foo: 'bar' });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('Unknown canonical schema');
    });
  });

  describe('4. Version Mismatch Handling', () => {
    it('should reject deprecated/mismatched schema versions strictly', () => {
      const versionMismatchFixture = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, 'invalid/version-mismatch.invalid.json'), 'utf8')
      );
      const result = validateApplicantProfile(versionMismatchFixture);
      expect(result.valid).toBe(false);
      expect(result.version).toBe('0.1.0-deprecated');
      expect(result.errors.some(e => e.instancePath.includes('schemaVersion') || e.message.includes('const'))).toBe(true);
    });

    it('should reject legacy unversioned payloads attempting to validate against 2.0.0 schema', () => {
      const unversionedPlan = {
        planId: 'plan_legacy',
        targetUrl: 'https://example.com',
        steps: []
      };
      const result = validateExecutionPlan(unversionedPlan);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.params?.missingProperty === 'schemaVersion')).toBe(true);
    });
  });

  describe('5. Model <-> Canonical Adapters', () => {
    it('should adapt Canonical Workflow to Mongoose representation', () => {
      const canonical = {
        schemaVersion: '2.0.0',
        workflowId: 'wf_adapt_1',
        name: 'Portal Form',
        targetUrl: 'https://example.com/apply',
        urlHash: 'hash123',
        pages: [{ id: 'p1', title: 'P1', steps: [] }],
        applicationOptions: [{ id: 'opt1', label: 'Option 1' }],
        metadata: { portalType: 'form' }
      };

      const mongooseDoc = adaptCanonicalWorkflowToMongoose(canonical, 'user_owner_9');
      expect(mongooseDoc.userId).toBe('user_owner_9');
      expect(mongooseDoc.url).toBe(canonical.targetUrl);
      expect(mongooseDoc.schemaDefinition.pages).toHaveLength(1);
      expect(mongooseDoc.schemaDefinition.metadata.applicationOptions).toHaveLength(1);
    });

    it('should adapt Mongoose Workflow to Canonical schema and pass canonical validation', () => {
      const fakeMongooseWorkflow = {
        _id: '64a123456789abcdef012345',
        name: 'Adapted Workflow Test',
        url: 'https://example.com/apply',
        urlHash: 'hash456',
        schemaVersion: '2.0.0',
        landingScreenshot: 'data:image/png;base64,...',
        schemaDefinition: {
          pages: [
            {
              id: 'p1',
              title: 'Page 1',
              steps: [
                { id: 'f1', type: 'text', label: 'Name', selector: '#name', required: true }
              ]
            }
          ],
          metadata: {
            applicationOptions: [{ id: 'opt1', label: 'Default' }]
          }
        },
        createdAt: new Date()
      };

      const canonical = adaptMongooseWorkflowToCanonical(fakeMongooseWorkflow);
      expect(canonical.workflowId).toBe('64a123456789abcdef012345');
      expect(canonical.targetUrl).toBe('https://example.com/apply');
      expect(canonical.pages).toHaveLength(1);

      const validation = validateWorkflow(canonical);
      expect(validation.valid).toBe(true);
    });

    it('should adapt Mongoose InterviewState with Map answers to Canonical schema', () => {
      const fakeMongooseInterview = {
        _id: '64b123456789abcdef012346',
        userId: 'user_123',
        workflowId: { _id: '64a123456789abcdef012345' },
        status: 'IN_PROGRESS',
        answers: new Map([
          ['fullName', 'Jane Doe'],
          ['category', 'GEN']
        ]),
        pendingFields: ['email'],
        completedFields: ['fullName', 'category'],
        currentField: 'email',
        currentStep: 2,
        confidenceScores: new Map([['fullName', 0.99]]),
        updatedAt: new Date()
      };

      const canonical = adaptMongooseInterviewStateToCanonical(fakeMongooseInterview);
      expect(canonical.answers).toEqual({ fullName: 'Jane Doe', category: 'GEN' });
      expect(canonical.confidenceScores).toEqual({ fullName: 0.99 });
      expect(canonical.workflowId).toBe('64a123456789abcdef012345');

      const validation = validateInterviewState(canonical);
      expect(validation.valid).toBe(true);
    });

    it('should adapt Mongoose AutomationJob to Canonical schema', () => {
      const fakeMongooseJob = {
        _id: '64c123456789abcdef012347',
        userId: 'user_123',
        workflowId: '64a123456789abcdef012345',
        interviewStateId: '64b123456789abcdef012346',
        status: 'PAUSED',
        progress: { currentStep: 2, totalSteps: 5 },
        currentStepIndex: 2,
        executionPlan: [
          { type: 'navigate', url: 'https://example.com' },
          { type: 'fill', selector: '#txt', value: 'Val' }
        ],
        pauseContext: {
          pauseReason: 'OTP',
          fieldName: 'otpCode',
          stepIndex: 2,
          resumeFromIndex: 3
        },
        logs: [
          { timestamp: new Date(), level: 'INFO', message: 'Paused for OTP' }
        ]
      };

      const canonical = adaptMongooseAutomationJobToCanonical(fakeMongooseJob);
      expect(canonical.jobId).toBe('64c123456789abcdef012347');
      expect(canonical.pauseContext.pauseReason).toBe('OTP');
      expect(canonical.logs).toHaveLength(1);

      const validation = validateAutomationJob(canonical);
      expect(validation.valid).toBe(true);
    });
  });
});
