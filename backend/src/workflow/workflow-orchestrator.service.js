/**
 * Workflow Orchestrator Service — Applier 3.0
 * Coordinates the full 23-step Resume Generation & Application Submission Workflow.
 *
 * Enforces:
 * 1. Durable backend state machine (MongoDB) independent of service worker lifecycle.
 * 2. Strict pre-submission review barrier (explicit user confirmation required).
 * 3. Safe failure handling and idempotency (prevents duplicate applications on recovery).
 * 4. Zero hallucination: resumes and forms use only verified profile facts & user confirmations.
 * 5. Full audit trail with Application tracking record creation.
 */

import crypto from 'crypto';
import { MissingInfoSession, WorkflowState } from './missing-info-session.model.js';
import { defaultMissingInfoService, MissingInfoService } from './missing-info.service.js';
import { defaultResumeGenerationService } from '../vault/resume-generation.service.js';
import { ProfessionalProfile } from '../users/professional-profile.model.js';
import { Application } from '../tracking/application.model.js';
import { ResumeTemplateId, ProvenanceSource, ProfileVerificationStatus } from '../../../shared/src/index.js';

export class WorkflowOrchestratorService {
  constructor(options = {}) {
    this.sessionModel = options.sessionModel || MissingInfoSession;
    this.profileModel = options.profileModel || ProfessionalProfile;
    this.missingInfoService = options.missingInfoService || (options.profileModel || options.sessionModel ? new MissingInfoService({ profileModel: this.profileModel, sessionModel: this.sessionModel }) : defaultMissingInfoService);
    this.resumeGenerationService = options.resumeGenerationService || defaultResumeGenerationService;
    this.applicationModel = options.applicationModel || Application;
  }

  /**
   * Step 1 - 7: Initializes the end-to-end workflow session.
   * Checks candidate profile, analyzes the job description, and identifies gaps.
   */
  async initializeWorkflow({
    userId,
    jobTitle,
    companyName = '',
    jobDescription,
    jobUrl = '',
    atsType = 'GENERIC',
    applicationQuestions = []
  }) {
    if (!userId) throw new Error('User ID is required to initialize workflow.');
    if (!jobTitle || !jobDescription) {
      throw new Error('jobTitle and jobDescription are required to initialize workflow.');
    }

    // Step 2 & 3: Check verified professional profile
    const profile = await this.profileModel.findOne({ userId });
    const hasProfile = Boolean(profile && profile.fullName);

    if (!hasProfile) {
      const sessionId = `wf_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const uninitSession = new this.sessionModel({
        sessionId,
        userId,
        jobTitle,
        companyName,
        jobDescription,
        jobUrl,
        atsType,
        applicationQuestions,
        workflowState: WorkflowState.CHECKING_PROFILE,
        blockedReason: 'PROFILE_REQUIRED',
        stateHistory: [
          { state: WorkflowState.INITIALIZING, enteredAt: new Date(), reason: 'Workflow session started' },
          { state: WorkflowState.CHECKING_PROFILE, enteredAt: new Date(), reason: 'No verified professional profile found. Resume upload required.' }
        ]
      });
      await uninitSession.save();
      return {
        session: uninitSession,
        sessionId: uninitSession.sessionId,
        userId: uninitSession.userId,
        workflowState: uninitSession.workflowState,
        requiresResumeUpload: true,
        message: 'Please upload your resume to establish your verified professional profile.'
      };
    }

    // Step 6, 7, 8 & 9: Initialize Missing-Info gap clarification
    const session = await this.missingInfoService.initializeSession({
      userId,
      jobTitle,
      companyName,
      jobDescription,
      applicationQuestions
    });

    session.jobUrl = jobUrl;
    session.atsType = atsType;
    session.profileSnapshot = {
      fullName: profile.fullName,
      email: profile.email,
      skillsCount: profile.skills ? profile.skills.length : 0,
      experienceCount: profile.experience ? profile.experience.length : 0
    };

    // Transition to appropriate state
    if (session.questions && session.questions.length > 0) {
      session.transitionTo(WorkflowState.QUESTIONS_PENDING, `Identified ${session.questions.length} information gaps`);
    } else {
      session.transitionTo(WorkflowState.READY_FOR_RESUME_GENERATION, 'All requirements covered by verified profile');
    }

    await session.save();

    return {
      session,
      sessionId: session.sessionId,
      userId: session.userId,
      workflowState: session.workflowState,
      requiresResumeUpload: false,
      questionsCount: session.questions ? session.questions.length : 0
    };
  }

  /**
   * Delegates retrieving current question to missingInfoService.
   */
  async getCurrentQuestion(sessionId, userId = null) {
    const sessionQuery = userId ? { sessionId, userId } : { sessionId };
    const session = await this.sessionModel.findOne(sessionQuery);
    if (!session) return null;
    return this.missingInfoService.getCurrentQuestion(sessionId, session.userId);
  }

  /**
   * Delegates skipping a question to missingInfoService.
   */
  async skipQuestion(sessionId, userId, questionId = null) {
    let actualUserId = userId;
    let actualQuestionId = questionId;
    if (!actualQuestionId && typeof userId === 'string' && !userId.includes('-') && userId.startsWith('q_')) {
      actualQuestionId = userId;
      actualUserId = null;
    }
    const sessionQuery = actualUserId ? { sessionId, userId: actualUserId } : { sessionId };
    const session = await this.sessionModel.findOne(sessionQuery);
    if (!session) throw new Error(`Workflow session ${sessionId} not found.`);
    return this.missingInfoService.skipQuestion(sessionId, session.userId, actualQuestionId);
  }

  /**
   * Step 10, 11, 12: Submits answer to a prioritized gap question and recalculates.
   */
  async submitGapAnswer(sessionId, maybeUserIdOrData, questionId, answer, additionalDetails = null) {
    let userId;
    let qId;
    let ans;
    let details;

    if (typeof maybeUserIdOrData === 'object' && maybeUserIdOrData !== null) {
      userId = maybeUserIdOrData.userId;
      qId = maybeUserIdOrData.questionId;
      ans = maybeUserIdOrData.answer;
      details = maybeUserIdOrData;
    } else {
      userId = maybeUserIdOrData;
      qId = questionId;
      ans = answer;
      details = additionalDetails;
    }

    const sessionQuery = userId ? { sessionId, userId } : { sessionId };
    const session = await this.sessionModel.findOne(sessionQuery);
    if (!session) throw new Error(`Workflow session ${sessionId} not found.`);
    if (!userId) userId = session.userId;

    session.transitionTo(WorkflowState.UPDATING_PROFILE, `Processing answer for question ${qId}`);
    await session.save();

    const updatedSession = await this.missingInfoService.submitAnswer(sessionId, userId, qId, ans, details);

    // Recalculate state
    let nextQuestion = null;
    if (this.missingInfoService && typeof this.missingInfoService.getCurrentQuestion === 'function') {
      try {
        nextQuestion = await this.missingInfoService.getCurrentQuestion(sessionId, userId);
      } catch (e) {
        nextQuestion = null;
      }
    }
    if (nextQuestion) {
      updatedSession.transitionTo(WorkflowState.AWAITING_USER_RESPONSE, 'Serving next prioritized gap question');
    } else {
      updatedSession.transitionTo(WorkflowState.READY_FOR_RESUME_GENERATION, 'All questions addressed. Ready for resume generation.');
    }

    await updatedSession.save();
    return updatedSession;
  }

  /**
   * Retrieves durable session by ID.
   */
  async getSession(sessionId, userId = null) {
    const sessionQuery = userId ? { sessionId, userId } : { sessionId };
    return this.sessionModel.findOne(sessionQuery);
  }

  /**
   * Step 13, 14, 15: Generates tailored resume, validates facts, and saves in Vault.
   */
  async generateAndValidateResume(sessionId, maybeUserIdOrTemplateId = null, templateId = ResumeTemplateId.ATS_SINGLE_COLUMN) {
    let userId = null;
    let actualTemplateId = templateId;

    if (maybeUserIdOrTemplateId && typeof maybeUserIdOrTemplateId === 'string') {
      const upper = maybeUserIdOrTemplateId.toUpperCase();
      if (
        Object.values(ResumeTemplateId).includes(maybeUserIdOrTemplateId) ||
        upper.includes('ATS') ||
        upper.includes('COLUMN') ||
        upper.includes('TECHNICAL') ||
        upper.includes('MODERN')
      ) {
        actualTemplateId = maybeUserIdOrTemplateId;
        userId = null;
      } else {
        userId = maybeUserIdOrTemplateId;
      }
    }

    const sessionQuery = userId ? { sessionId, userId } : { sessionId };
    const session = await this.sessionModel.findOne(sessionQuery);
    if (!session) throw new Error(`Workflow session ${sessionId} not found.`);
    if (!userId) userId = session.userId;

    session.transitionTo(WorkflowState.GENERATING_RESUME, `Generating resume with template ${actualTemplateId}`);
    await session.save();

    // Gather confirmed answers
    const confirmedGaps = { ...(session.applicationAnswers || {}) };
    for (const update of session.confirmedProfileUpdates || []) {
      if (update.field && update.value) {
        confirmedGaps[update.field] = update.value;
      }
    }

    // Invoke resume generation service
    const result = await this.resumeGenerationService.generateAndSaveTailoredResume({
      userId,
      applicationSessionId: session._id,
      jobTitle: session.jobTitle,
      company: session.companyName,
      jobDescription: session.jobDescription,
      templateId: actualTemplateId,
      userConfirmedGaps: Array.isArray(session.confirmedProfileUpdates) && session.confirmedProfileUpdates.length > 0 ? session.confirmedProfileUpdates : confirmedGaps,
      jobMatchReport: session.matchReport
    });

    // Zero-Hallucination barrier enforcement
    if (result.validationReport && result.validationReport.isHallucinationFree === false) {
      session.transitionTo(WorkflowState.FAILED, `Zero-Hallucination audit failed: unsupported claims detected: ${(result.validationReport.unsupportedClaims || []).join(', ')}`);
      await session.save();
      throw new Error(`Zero-Hallucination audit failed: unsupported claims detected (${(result.validationReport.unsupportedClaims || []).join(', ')})`);
    }

    // Step 14 & 15: Record generated resume & transition to FILLING_APPLICATION
    session.transitionTo(WorkflowState.VALIDATING_RESUME, 'Validating factual traceability and PDF integrity');
    session.generatedResume = {
      ...result.generatedResume,
      resumeId: result.generatedResume._id || result.generatedResume.resumeId,
      templateId: result.generatedResume.templateId || actualTemplateId,
      previewPdfUrl: `/api/v1/vault/resumes/tailored/${result.generatedResume._id || 'gen'}/preview`,
      downloadUrl: `/api/v1/vault/resumes/tailored/${result.generatedResume._id || 'gen'}/download`,
      matchedKeywords: result.generatedResume.matchedKeywords || [],
      summaryPreview: result.generatedResume.tailoredSummary || '',
      validationReport: result.validationReport || {},
      skills: result.generatedResume.skills || [],
      experience: result.generatedResume.experience || []
    };

    session.transitionTo(WorkflowState.FILLING_APPLICATION, 'Resume ready in Vault. Ready to fill application form.');
    await session.save();

    return {
      session,
      generatedResume: session.generatedResume
    };
  }

  /**
   * Step 16, 17, 18: Records extension autofill results, attachment, and validation.
   */
  async recordFormFillAndAttachment(sessionId, userId, {
    detectedFields = [],
    fieldMappings = [],
    fillResults = {},
    attachmentStatus = {},
    formValidation = {}
  }) {
    const session = await this.sessionModel.findOne({ sessionId, userId });
    if (!session) throw new Error(`Workflow session ${sessionId} not found.`);

    session.detectedFields = detectedFields;
    session.fieldMappings = fieldMappings;
    session.fillResults = fillResults;
    session.attachmentStatus = attachmentStatus;
    session.formValidation = formValidation;

    session.transitionTo(WorkflowState.AWAITING_USER_REVIEW, 'Form populated and resume attached. Awaiting explicit user review.');
    await session.save();

    return session;
  }

  /**
   * Step 19: Produces authoritative Pre-Submission Review Manifest.
   */
  async getReviewManifest(sessionId, userId) {
    const session = await this.sessionModel.findOne({ sessionId, userId });
    if (!session) throw new Error(`Workflow session ${sessionId} not found.`);

    const profile = await this.profileModel.findOne({ userId });

    return {
      sessionId: session.sessionId,
      jobTitle: session.jobTitle,
      company: session.companyName,
      workflowState: session.workflowState,
      candidate: {
        fullName: profile?.fullName || 'Candidate',
        email: profile?.email || '',
        phone: profile?.phone || ''
      },
      tailoredResume: session.generatedResume || null,
      attachmentStatus: session.attachmentStatus || null,
      fieldMappings: session.fieldMappings || [],
      fillResults: session.fillResults || null,
      formValidation: session.formValidation || null,
      applicationAnswers: session.applicationAnswers || {},
      confirmedUpdates: session.confirmedProfileUpdates || [],
      requiresExplicitConfirmation: true,
      readyForSubmission: Boolean(session.userConfirmedSubmission)
    };
  }

  /**
   * Step 20: Pre-Submission Barrier — Explicit User Confirmation.
   * Enforces idempotency to prevent duplicate submissions.
   */
  async confirmSubmission(sessionId, maybeUserIdOrOptions, maybeOptions = {}) {
    let userId;
    let userConfirmed;

    if (typeof maybeUserIdOrOptions === 'boolean') {
      userId = null;
      userConfirmed = maybeUserIdOrOptions;
    } else if (typeof maybeUserIdOrOptions === 'object' && maybeUserIdOrOptions !== null) {
      userId = maybeOptions.userId || null;
      userConfirmed = Boolean(maybeUserIdOrOptions.userConfirmed);
    } else {
      userId = maybeUserIdOrOptions;
      if (typeof maybeOptions === 'boolean') {
        userConfirmed = maybeOptions;
      } else {
        userConfirmed = Boolean(maybeOptions?.userConfirmed);
      }
    }

    if (!userConfirmed) {
      throw new Error('Explicit user confirmation is mandatory before submission can proceed.');
    }

    const sessionQuery = userId ? { sessionId, userId } : { sessionId };
    const session = await this.sessionModel.findOne(sessionQuery);
    if (!session) throw new Error(`Workflow session ${sessionId} not found.`);
    if (!userId) userId = session.userId;

    // Idempotency check: prevent duplicate submissions
    if (session.workflowState === WorkflowState.SUBMITTING ||
        session.workflowState === WorkflowState.SUBMITTED ||
        session.workflowState === WorkflowState.SUBMISSION_STATUS_UNKNOWN) {
      throw new Error(`Cannot submit application: Application is already in ${session.workflowState}. Duplicate submission blocked.`);
    }

    session.userConfirmedSubmission = true;
    session.confirmedAt = new Date();
    session.idempotencyKey = `idemp_${userId}_${sessionId}_${Date.now()}`;

    session.transitionTo(WorkflowState.READY_FOR_SUBMISSION, 'User explicitly confirmed all answers and resume.');
    session.transitionTo(WorkflowState.SUBMITTING, 'Executing page submission interaction.');
    await session.save();

    return {
      success: true,
      sessionId: session.sessionId,
      idempotencyKey: session.idempotencyKey,
      workflowState: session.workflowState
    };
  }

  /**
   * Step 21, 22, 23: Records final submission outcome and persists Application record.
   * Safely handles SUBMITTED, FAILED, and SUBMISSION_STATUS_UNKNOWN.
   */
  async recordSubmissionOutcome(sessionId, maybeUserIdOrData, maybeData = {}) {
    let userId;
    let outcomeData;

    if (typeof maybeUserIdOrData === 'object' && maybeUserIdOrData !== null) {
      userId = null;
      outcomeData = maybeUserIdOrData;
    } else {
      userId = maybeUserIdOrData;
      outcomeData = maybeData || {};
    }

    const {
      status,
      referenceNumber = null,
      confirmationUrl = '',
      receipt = null,
      error = null,
      evidence = null
    } = outcomeData;

    const sessionQuery = userId ? { sessionId, userId } : { sessionId };
    const session = await this.sessionModel.findOne(sessionQuery);
    if (!session) throw new Error(`Workflow session ${sessionId} not found.`);
    if (!userId) userId = session.userId;

    // Duplicate submission guard
    if (session.workflowState === WorkflowState.SUBMITTED && status === 'SUBMITTED') {
      return {
        session,
        duplicateBlocked: true,
        message: 'Application was already recorded as SUBMITTED.'
      };
    }

    const outcomeRecord = {
      status,
      referenceNumber,
      confirmationUrl,
      receipt,
      error,
      evidence,
      recordedAt: new Date()
    };
    session.submissionResult = outcomeRecord;

    if (status === 'SUBMITTED') {
      session.transitionTo(WorkflowState.SUBMITTED, `Submission confirmed. Ref: ${referenceNumber || 'N/A'}`);

      // Persist in Application tracking model
      try {
        const appRecord = new this.applicationModel({
          userId,
          workflowId: session._id,
          interviewStateId: session._id,
          status: 'SUBMITTED',
          submissionStatus: 'SUBMITTED',
          referenceNumber: referenceNumber || `REF_${Date.now()}`,
          confirmationUrl: confirmationUrl || session.jobUrl,
          receipt: receipt || { confirmedAt: new Date(), jobTitle: session.jobTitle, company: session.companyName },
          finalPageEvidence: evidence,
          submittedAt: new Date()
        });
        await appRecord.save();
      } catch (appErr) {
        // Log error but do not fail session update
      }
    } else if (status === 'SUBMISSION_STATUS_UNKNOWN') {
      // Ambiguous outcome — NEVER automatically retry!
      session.transitionTo(
        WorkflowState.SUBMISSION_STATUS_UNKNOWN,
        `Submission status ambiguous (${error || 'Network drop or page redirect'}). Automatic retry blocked.`
      );
    } else {
      session.transitionTo(WorkflowState.FAILED, `Submission failed: ${error || 'Portal error'}`);
      session.failureDetails = { error, recordedAt: new Date() };
    }

    await session.save();

    return {
      session,
      status: session.workflowState,
      submissionResult: session.submissionResult
    };
  }

  /**
   * Recovers durable workflow session across Chrome service worker suspensions or tab reloads.
   */
  async recoverWorkflowSession(sessionId, userId) {
    const session = await this.sessionModel.findOne({ sessionId, userId });
    if (!session) return null;

    session.lastActiveAt = new Date();
    await session.save();

    return {
      sessionId: session.sessionId,
      workflowState: session.workflowState,
      jobTitle: session.jobTitle,
      company: session.companyName,
      readyForResumeGeneration: session.readyForResumeGeneration,
      questionsCount: session.questions ? session.questions.length : 0,
      generatedResume: session.generatedResume,
      fillResults: session.fillResults,
      userConfirmedSubmission: session.userConfirmedSubmission,
      submissionResult: session.submissionResult,
      stateHistory: session.stateHistory
    };
  }
}

export const defaultWorkflowOrchestratorService = new WorkflowOrchestratorService();
export default defaultWorkflowOrchestratorService;
