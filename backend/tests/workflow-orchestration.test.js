/**
 * End-to-End Workflow Orchestration Integration Test Suite
 * Validates the complete 23-step Resume Generation & Job Application Workflow:
 *
 * Sequence:
 * 1. User Authenticates
 * 2. Profile Verification Check (Requires resume upload if missing)
 * 3. Verified Profile Ingestion
 * 4. User opens job application on employer site
 * 5. Clicks "Apply with Applier"
 * 6. Extension extracts Job Description & DOM metadata
 * 7. Backend identifies mandatory & preferred requirements
 * 8. System compares requirements with verified profile evidence
 * 9. Missing-information engine prioritizes gaps
 * 10. User answers gap clarification questions
 * 11. Confirmed answers saved (segregated from profile if application-specific)
 * 12. Requirement-to-evidence analysis recalculated
 * 13. Job-specific tailored resume generated
 * 14. Resume validation runs (Zero Hallucination audit)
 * 15. Encrypted resume saved in Vault
 * 16. Extension fills supported form fields
 * 17. Generated resume PDF attached via DataTransfer
 * 18. Extension validates form completion
 * 19. Authoritative pre-submission review manifest presented
 * 20. Pre-submission review barrier (Explicit User Confirmation required)
 * 21. Page submission interaction executed
 * 22. Submission outcome verified (SUBMITTED, FAILED, or SUBMISSION_STATUS_UNKNOWN)
 * 23. Durable Application tracking record persisted
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import { WorkflowOrchestratorService } from '../src/workflow/workflow-orchestrator.service.js';
import { MissingInfoController } from '../src/workflow/missing-info.controller.js';
import { MissingInfoSession, WorkflowState } from '../src/workflow/missing-info-session.model.js';
import { ProvenanceSource, ResumeTemplateId } from '../../shared/src/index.js';

// In-Memory Mock Profile Store
class MockProfileModel {
  static store = new Map();

  static async findOne({ userId }) {
    return MockProfileModel.store.get(String(userId)) || null;
  }

  constructor(data) {
    this._id = data._id || `prof_${Date.now()}`;
    this.userId = data.userId;
    this.fullName = data.fullName || 'Candidate';
    this.email = data.email || 'candidate@example.com';
    this.phone = data.phone || '+1-555-0100';
    this.skills = data.skills || [];
    this.experience = data.experience || [];
    this.education = data.education || [];
    this.projects = data.projects || [];
  }

  async save() {
    MockProfileModel.store.set(String(this.userId), this);
    return this;
  }
}

// In-Memory Mock Session Store
class MockSessionModel {
  static store = new Map();

  static async findOne({ sessionId, userId }) {
    const s = MockSessionModel.store.get(sessionId);
    if (!s) return null;
    if (userId && String(s.userId) !== String(userId)) return null;
    return s;
  }

  constructor(data) {
    Object.assign(this, data);
    this._id = data._id || `sess_obj_${Date.now()}`;
    this.sessionId = data.sessionId || `wf_${Date.now()}`;
    this.workflowState = data.workflowState || WorkflowState.INITIALIZING;
    this.stateHistory = data.stateHistory || [];
    this.questions = data.questions || [];
    this.confirmedProfileUpdates = data.confirmedProfileUpdates || [];
    this.declinedQuestionIds = data.declinedQuestionIds || [];
    this.applicationAnswers = data.applicationAnswers || {};
    this.detectedFields = data.detectedFields || [];
    this.fieldMappings = data.fieldMappings || [];
    this.fillResults = data.fillResults || null;
    this.attachmentStatus = data.attachmentStatus || null;
    this.formValidation = data.formValidation || null;
    this.userConfirmedSubmission = data.userConfirmedSubmission || false;
  }

  transitionTo(newState, reason = '') {
    this.workflowState = newState;
    this.stateHistory.push({
      state: newState,
      enteredAt: new Date(),
      reason
    });
    this.lastActiveAt = new Date();
  }

  async save() {
    MockSessionModel.store.set(this.sessionId, this);
    return this;
  }
}

// In-Memory Mock Application Store
class MockApplicationModel {
  static store = [];

  static async find(query) {
    return MockApplicationModel.store.filter(a => String(a.userId) === String(query.userId));
  }

  constructor(data) {
    Object.assign(this, data);
    this._id = data._id || `app_${Date.now()}`;
  }

  async save() {
    MockApplicationModel.store.push(this);
    return this;
  }
}

describe('End-to-End Workflow Orchestration (Applier 3.0)', () => {
  let orchestrator;
  let mockMissingInfoService;
  let mockResumeGenerationService;
  const testUserId = 'usr_orchestration_test_42';

  beforeEach(() => {
    MockProfileModel.store.clear();
    MockSessionModel.store.clear();
    MockApplicationModel.store = [];

    // Setup Mock Missing Info Service
    mockMissingInfoService = {
      initializeSession: async ({ userId, jobTitle, companyName, jobDescription, applicationQuestions }) => {
        const session = new MockSessionModel({
          sessionId: `sess_orch_${Date.now()}`,
          userId,
          jobTitle,
          companyName,
          jobDescription,
          applicationQuestions,
          questions: [
            {
              id: 'q_k8s',
              priority: 'REQUIRED',
              targetEntity: 'skill',
              fieldName: 'kubernetes',
              questionText: 'Do you have experience managing production Kubernetes clusters?',
              answered: false
            }
          ]
        });
        await session.save();
        return session;
      },
      getCurrentQuestion: async (sessionId, userId) => {
        const s = await MockSessionModel.findOne({ sessionId, userId });
        const unans = s?.questions?.find(q => !q.answered);
        if (!unans) return null;
        return { question: unans, remainingQuestions: 1 };
      },
      submitAnswer: async (sessionId, userId, questionId, answer, details) => {
        const s = await MockSessionModel.findOne({ sessionId, userId });
        const q = s.questions.find(x => x.id === questionId);
        if (q) q.answered = true;
        s.confirmedProfileUpdates.push({
          field: 'kubernetes',
          value: answer,
          provenance: ProvenanceSource.USER_CONFIRMED
        });
        await s.save();
        return s;
      }
    };

    // Setup Mock Resume Generation Service
    mockResumeGenerationService = {
      generateAndSaveTailoredResume: async (params) => {
        return {
          generatedResume: {
            _id: 'res_tailored_vault_888',
            templateId: params.templateId || ResumeTemplateId.ATS_SINGLE_COLUMN,
            matchedKeywords: ['Kubernetes', 'Go', 'Distributed Systems'],
            tailoredSummary: 'Senior Systems Engineer specialized in cloud infrastructure and Kubernetes.'
          },
          validationReport: {
            valid: true,
            hallucinationDetected: false,
            unsupportedClaims: []
          }
        };
      }
    };

    orchestrator = new WorkflowOrchestratorService({
      sessionModel: MockSessionModel,
      profileModel: MockProfileModel,
      missingInfoService: mockMissingInfoService,
      resumeGenerationService: mockResumeGenerationService,
      applicationModel: MockApplicationModel
    });
  });

  describe('Sequence Steps 1–3: Profile Verification Barrier', () => {
    it('Step 1 & 2: Blocks workflow if user does not have a verified profile', async () => {
      // User has no profile in MockProfileModel
      const result = await orchestrator.initializeWorkflow({
        userId: 'unverified_user_no_profile',
        jobTitle: 'Cloud Architect',
        companyName: 'Acme Cloud',
        jobDescription: 'Seeking expert in GCP and Terraform.'
      });

      expect(result.requiresResumeUpload).toBe(true);
      expect(result.message).toContain('upload your resume');
      expect(result.session.workflowState).toBe(WorkflowState.CHECKING_PROFILE);
      expect(result.session.blockedReason).toBe('PROFILE_REQUIRED');
    });

    it('Step 2 & 3: Proceeds smoothly when verified profile exists', async () => {
      // Seed verified profile
      const prof = new MockProfileModel({
        userId: testUserId,
        fullName: 'Jane Doe',
        email: 'jane.doe@example.com',
        skills: [{ name: 'Go', proficiency: 'ADVANCED' }]
      });
      await prof.save();

      const result = await orchestrator.initializeWorkflow({
        userId: testUserId,
        jobTitle: 'Senior Cloud Engineer',
        companyName: 'Stripe',
        jobDescription: 'Build scalable payment systems with Go and Kubernetes.',
        jobUrl: 'https://stripe.com/jobs/12345',
        atsType: 'GREENHOUSE'
      });

      expect(result.requiresResumeUpload).toBe(false);
      expect(result.session.workflowState).toBe(WorkflowState.QUESTIONS_PENDING);
      expect(result.session.profileSnapshot.fullName).toBe('Jane Doe');
      expect(result.session.atsType).toBe('GREENHOUSE');
      expect(result.questionsCount).toBe(1);
    });
  });

  describe('Sequence Steps 10–15: Gap Clarification & Tailored Resume Generation', () => {
    it('Step 10–12: Submits gap answer, updates profile evidence, and recalculates state', async () => {
      const prof = new MockProfileModel({
        userId: testUserId,
        fullName: 'Jane Doe',
        email: 'jane.doe@example.com'
      });
      await prof.save();

      const initResult = await orchestrator.initializeWorkflow({
        userId: testUserId,
        jobTitle: 'Senior Cloud Engineer',
        companyName: 'Stripe',
        jobDescription: 'Build scalable payment systems with Go and Kubernetes.'
      });

      const sessionId = initResult.session.sessionId;

      // Mock that after this answer, no more questions remain
      mockMissingInfoService.getCurrentQuestion = async () => null;

      const updated = await orchestrator.submitGapAnswer(
        sessionId,
        testUserId,
        'q_k8s',
        'Yes, 4 years deploying Kubernetes on AWS and bare metal.'
      );

      expect(updated.workflowState).toBe(WorkflowState.READY_FOR_RESUME_GENERATION);
      expect(updated.confirmedProfileUpdates.length).toBe(1);
      expect(updated.confirmedProfileUpdates[0].field).toBe('kubernetes');
    });

    it('Step 13–15: Generates tailored resume, validates facts, and saves in Vault', async () => {
      const prof = new MockProfileModel({
        userId: testUserId,
        fullName: 'Jane Doe'
      });
      await prof.save();

      const initResult = await orchestrator.initializeWorkflow({
        userId: testUserId,
        jobTitle: 'Senior Cloud Engineer',
        companyName: 'Stripe',
        jobDescription: 'Build scalable payment systems with Go and Kubernetes.'
      });

      const sessionId = initResult.session.sessionId;

      const resResult = await orchestrator.generateAndValidateResume(
        sessionId,
        testUserId,
        ResumeTemplateId.ATS_SINGLE_COLUMN
      );

      expect(resResult.session.workflowState).toBe(WorkflowState.FILLING_APPLICATION);
      expect(resResult.generatedResume).toBeDefined();
      expect(resResult.generatedResume.resumeId).toBe('res_tailored_vault_888');
      expect(resResult.generatedResume.matchedKeywords).toContain('Kubernetes');
      expect(resResult.generatedResume.previewPdfUrl).toContain('/preview');
    });
  });

  describe('Sequence Steps 16–19: Autofill Reporting & Review Manifest', () => {
    it('Step 16–18: Records extension autofill results, resume attachment, and transitions to review', async () => {
      const prof = new MockProfileModel({ userId: testUserId, fullName: 'Jane Doe' });
      await prof.save();

      const initResult = await orchestrator.initializeWorkflow({
        userId: testUserId,
        jobTitle: 'Staff Engineer',
        companyName: 'Datadog',
        jobDescription: 'Lead distributed tracing platform.'
      });

      const sessionId = initResult.session.sessionId;

      const session = await orchestrator.recordFormFillAndAttachment(sessionId, testUserId, {
        detectedFields: [{ id: 'f_name', label: 'Full Name' }],
        fieldMappings: [{ fieldId: 'f_name', targetValue: 'Jane Doe' }],
        fillResults: { total: 1, filled: 1, failed: 0 },
        attachmentStatus: { attached: true, fileName: 'Datadog_Resume.pdf' },
        formValidation: { isValid: true, missingRequired: [] }
      });

      expect(session.workflowState).toBe(WorkflowState.AWAITING_USER_REVIEW);
      expect(session.fillResults.filled).toBe(1);
      expect(session.attachmentStatus.attached).toBe(true);
    });

    it('Step 19: Produces authoritative review manifest with factual provenance', async () => {
      const prof = new MockProfileModel({
        userId: testUserId,
        fullName: 'Jane Doe',
        email: 'jane.doe@example.com',
        phone: '+1-555-0199'
      });
      await prof.save();

      const initResult = await orchestrator.initializeWorkflow({
        userId: testUserId,
        jobTitle: 'Staff Engineer',
        companyName: 'Datadog',
        jobDescription: 'Lead distributed tracing platform.'
      });

      const sessionId = initResult.session.sessionId;

      await orchestrator.recordFormFillAndAttachment(sessionId, testUserId, {
        detectedFields: [{ id: 'f_email', label: 'Email' }],
        fieldMappings: [{ fieldId: 'f_email', targetValue: 'jane.doe@example.com' }],
        fillResults: { total: 1, filled: 1 },
        attachmentStatus: { attached: true },
        formValidation: { isValid: true }
      });

      const manifest = await orchestrator.getReviewManifest(sessionId, testUserId);

      expect(manifest.sessionId).toBe(sessionId);
      expect(manifest.candidate.fullName).toBe('Jane Doe');
      expect(manifest.candidate.email).toBe('jane.doe@example.com');
      expect(manifest.requiresExplicitConfirmation).toBe(true);
      expect(manifest.workflowState).toBe(WorkflowState.AWAITING_USER_REVIEW);
      expect(manifest.readyForSubmission).toBe(false);
    });
  });

  describe('Sequence Steps 20–23: Pre-Submission Barrier & Idempotent Submission', () => {
    it('Step 20: Enforces explicit user confirmation before submission can proceed', async () => {
      const prof = new MockProfileModel({ userId: testUserId, fullName: 'Jane Doe' });
      await prof.save();

      const initResult = await orchestrator.initializeWorkflow({
        userId: testUserId,
        jobTitle: 'Staff Engineer',
        companyName: 'Datadog',
        jobDescription: 'Lead distributed tracing platform.'
      });

      const sessionId = initResult.session.sessionId;

      // Reject without confirmation
      await expect(
        orchestrator.confirmSubmission(sessionId, testUserId, { userConfirmed: false })
      ).rejects.toThrow('Explicit user confirmation is mandatory');

      // Succeed with explicit confirmation
      const confirmResult = await orchestrator.confirmSubmission(sessionId, testUserId, { userConfirmed: true });
      expect(confirmResult.success).toBe(true);
      expect(confirmResult.idempotencyKey).toContain(sessionId);
      expect(confirmResult.workflowState).toBe(WorkflowState.SUBMITTING);

      // Verify session updated
      const session = await MockSessionModel.findOne({ sessionId, userId: testUserId });
      expect(session.userConfirmedSubmission).toBe(true);
      expect(session.workflowState).toBe(WorkflowState.SUBMITTING);
    });

    it('Step 20 Idempotency: Blocks duplicate submissions for in-flight or completed sessions', async () => {
      const prof = new MockProfileModel({ userId: testUserId, fullName: 'Jane Doe' });
      await prof.save();

      const initResult = await orchestrator.initializeWorkflow({
        userId: testUserId,
        jobTitle: 'Staff Engineer',
        companyName: 'Datadog',
        jobDescription: 'Lead distributed tracing platform.'
      });

      const sessionId = initResult.session.sessionId;
      await orchestrator.confirmSubmission(sessionId, testUserId, { userConfirmed: true });

      // Immediate second confirmation attempt must throw duplicate error
      await expect(
        orchestrator.confirmSubmission(sessionId, testUserId, { userConfirmed: true })
      ).rejects.toThrow('Duplicate submission blocked');
    });

    it('Step 21–23: Records successful SUBMITTED outcome and creates durable Application record', async () => {
      const prof = new MockProfileModel({ userId: testUserId, fullName: 'Jane Doe' });
      await prof.save();

      const initResult = await orchestrator.initializeWorkflow({
        userId: testUserId,
        jobTitle: 'Staff Engineer',
        companyName: 'Datadog',
        jobDescription: 'Lead distributed tracing platform.',
        jobUrl: 'https://datadog.com/jobs/999'
      });

      const sessionId = initResult.session.sessionId;
      await orchestrator.confirmSubmission(sessionId, testUserId, { userConfirmed: true });

      const outcome = await orchestrator.recordSubmissionOutcome(sessionId, testUserId, {
        status: 'SUBMITTED',
        referenceNumber: 'DD-REF-998822',
        confirmationUrl: 'https://datadog.com/jobs/999/thanks',
        receipt: { submittedAt: new Date().toISOString() }
      });

      expect(outcome.status).toBe(WorkflowState.SUBMITTED);
      expect(outcome.submissionResult.referenceNumber).toBe('DD-REF-998822');

      // Verify Application record created
      const apps = await MockApplicationModel.find({ userId: testUserId });
      expect(apps.length).toBe(1);
      expect(apps[0].referenceNumber).toBe('DD-REF-998822');
      expect(apps[0].status).toBe('SUBMITTED');
      expect(apps[0].confirmationUrl).toBe('https://datadog.com/jobs/999/thanks');
    });

    it('Step 22 Safe Failure: Transitions to SUBMISSION_STATUS_UNKNOWN on network drop and NEVER automatically retries', async () => {
      const prof = new MockProfileModel({ userId: testUserId, fullName: 'Jane Doe' });
      await prof.save();

      const initResult = await orchestrator.initializeWorkflow({
        userId: testUserId,
        jobTitle: 'Staff Engineer',
        companyName: 'Datadog',
        jobDescription: 'Lead distributed tracing platform.'
      });

      const sessionId = initResult.session.sessionId;
      await orchestrator.confirmSubmission(sessionId, testUserId, { userConfirmed: true });

      const outcome = await orchestrator.recordSubmissionOutcome(sessionId, testUserId, {
        status: 'SUBMISSION_STATUS_UNKNOWN',
        error: 'Network socket closed unexpectedly before response headers'
      });

      expect(outcome.status).toBe(WorkflowState.SUBMISSION_STATUS_UNKNOWN);

      // Automated retry attempt must be strictly blocked
      await expect(
        orchestrator.confirmSubmission(sessionId, testUserId, { userConfirmed: true })
      ).rejects.toThrow('Duplicate submission blocked');
    });
  });

  describe('Durable Session Recovery', () => {
    it('Recovers session state seamlessly after Chrome Service Worker suspension', async () => {
      const prof = new MockProfileModel({ userId: testUserId, fullName: 'Jane Doe' });
      await prof.save();

      const initResult = await orchestrator.initializeWorkflow({
        userId: testUserId,
        jobTitle: 'Staff Engineer',
        companyName: 'Datadog',
        jobDescription: 'Lead distributed tracing platform.'
      });

      const sessionId = initResult.session.sessionId;

      const recovered = await orchestrator.recoverWorkflowSession(sessionId, testUserId);
      expect(recovered).not.toBeNull();
      expect(recovered.sessionId).toBe(sessionId);
      expect(recovered.jobTitle).toBe('Staff Engineer');
      expect(recovered.company).toBe('Datadog');
      expect(recovered.stateHistory.length).toBeGreaterThan(0);
    });
  });

  describe('HTTP REST Controller & Routing Integration', () => {
    let app;
    let controller;

    beforeEach(() => {
      controller = new MissingInfoController(mockMissingInfoService, orchestrator);

      app = express();
      app.use(cors());
      app.use(express.json());
      app.use((req, res, next) => {
        req.user = { id: testUserId, email: 'jane.doe@example.com' };
        next();
      });

      app.post('/api/v1/missing-info/session/init', controller.initSession);
      app.post('/api/v1/missing-info/session/:sessionId/fill-status', controller.recordFormFillAndAttachment);
      app.post('/api/v1/missing-info/session/:sessionId/confirm-submission', controller.confirmSubmission);
      app.post('/api/v1/missing-info/session/:sessionId/record-submission', controller.recordSubmissionOutcome);
      app.get('/api/v1/missing-info/session/:sessionId/recover', controller.recoverWorkflowSession);
      app.get('/api/v1/missing-info/session/:sessionId/review', controller.getReviewManifest);
    });

    it('Exposes end-to-end orchestration endpoints via HTTP REST API', async () => {
      const prof = new MockProfileModel({ userId: testUserId, fullName: 'Jane Doe' });
      await prof.save();

      // 1. Init Session
      const initRes = await request(app)
        .post('/api/v1/missing-info/session/init')
        .send({
          jobTitle: 'Principal Architect',
          companyName: 'Figma',
          jobDescription: 'Scale WebGL canvas and real-time collaboration engines.'
        });

      expect(initRes.status).toBe(201);
      const sessionId = initRes.body.data.sessionId;

      // 2. Record Form Fill
      const fillRes = await request(app)
        .post(`/api/v1/missing-info/session/${sessionId}/fill-status`)
        .send({
          detectedFields: [{ id: 'f_name', label: 'Full Name' }],
          fieldMappings: [{ fieldId: 'f_name', targetValue: 'Jane Doe' }],
          fillResults: { filled: 1 }
        });

      expect(fillRes.status).toBe(200);

      // 3. Confirm Submission
      const confirmRes = await request(app)
        .post(`/api/v1/missing-info/session/${sessionId}/confirm-submission`)
        .send({ userConfirmed: true });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.data.workflowState).toBe(WorkflowState.SUBMITTING);

      // 4. Record Outcome
      const outcomeRes = await request(app)
        .post(`/api/v1/missing-info/session/${sessionId}/record-submission`)
        .send({
          status: 'SUBMITTED',
          referenceNumber: 'FIG-REF-771122'
        });

      expect(outcomeRes.status).toBe(200);
      expect(outcomeRes.body.data.status).toBe(WorkflowState.SUBMITTED);

      // 5. Recover Session
      const recoverRes = await request(app)
        .get(`/api/v1/missing-info/session/${sessionId}/recover`);

      expect(recoverRes.status).toBe(200);
      expect(recoverRes.body.data.sessionId).toBe(sessionId);
      expect(recoverRes.body.data.submissionResult.referenceNumber).toBe('FIG-REF-771122');
    });
  });
});
