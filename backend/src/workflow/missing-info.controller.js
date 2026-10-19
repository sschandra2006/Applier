/**
 * Missing-Information Controller
 * REST API handlers for interactive gap clarification workflow.
 */

import { defaultMissingInfoService } from './missing-info.service.js';
import { MissingInfoSession } from './missing-info-session.model.js';
import { defaultResumeGenerationService } from '../vault/resume-generation.service.js';
import { defaultWorkflowOrchestratorService } from './workflow-orchestrator.service.js';
import { ProfessionalProfile } from '../users/professional-profile.model.js';

export class MissingInfoController {
  constructor(service = defaultMissingInfoService, orchestrator = null) {
    this.service = service;
    this.orchestrator = orchestrator || (service === defaultMissingInfoService ? defaultWorkflowOrchestratorService : null);
  }

  initSession = async (req, res, next) => {
    try {
      const userId = req.user?.id || req.body.userId;
      const { jobTitle, companyName, jobDescription, applicationQuestions, jobUrl, atsType } = req.body;

      if (this.orchestrator && typeof this.orchestrator.initializeWorkflow === 'function') {
        const initResult = await this.orchestrator.initializeWorkflow({
          userId,
          jobTitle,
          companyName,
          jobDescription,
          jobUrl,
          atsType,
          applicationQuestions
        });

        if (initResult.requiresResumeUpload) {
          return res.status(200).json({
            success: true,
            requiresResumeUpload: true,
            message: initResult.message,
            data: initResult.session
          });
        }

        return res.status(201).json({
          success: true,
          data: initResult.session,
          questionsCount: initResult.questionsCount
        });
      }

      const session = await this.service.initializeSession({
        userId,
        jobTitle,
        companyName,
        jobDescription,
        applicationQuestions
      });

      return res.status(201).json({
        success: true,
        data: session
      });
    } catch (err) {
      return next(err);
    }
  };

  getCurrentQuestion = async (req, res, next) => {
    try {
      const userId = req.user?.id || req.query.userId;
      const { sessionId } = req.params;

      const result = await this.service.getCurrentQuestion(sessionId, userId);
      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      return next(err);
    }
  };

  getSession = async (req, res, next) => {
    try {
      const userId = req.user?.id || req.query.userId;
      const { sessionId } = req.params;

      const session = await MissingInfoSession.findOne({ sessionId, userId });
      if (!session) {
        return res.status(404).json({
          success: false,
          error: `Missing info session ${sessionId} not found.`
        });
      }

      return res.status(200).json({
        success: true,
        data: session
      });
    } catch (err) {
      return next(err);
    }
  };

  submitAnswer = async (req, res, next) => {
    try {
      const userId = req.user?.id || req.body.userId;
      const { sessionId } = req.params;
      const { questionId, userResponse } = req.body;

      if (!questionId || !userResponse) {
        return res.status(400).json({
          success: false,
          error: 'questionId and userResponse are required.'
        });
      }

      const result = await this.service.submitAnswer(sessionId, userId, questionId, userResponse);
      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      return next(err);
    }
  };

  skipQuestion = async (req, res, next) => {
    try {
      const userId = req.user?.id || req.body.userId;
      const { sessionId } = req.params;
      const { questionId } = req.body;

      if (!questionId) {
        return res.status(400).json({
          success: false,
          error: 'questionId is required to skip.'
        });
      }

      const result = await this.service.skipQuestion(sessionId, userId, questionId);
      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      return next(err);
    }
  };

  cancelSession = async (req, res, next) => {
    try {
      const userId = req.user?.id || req.body.userId;
      const { sessionId } = req.params;

      const result = await this.service.cancelSession(sessionId, userId);
      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      return next(err);
    }
  };

  tailorResume = async (req, res, next) => {
    try {
      const userId = req.user?.id || req.body.userId;
      const { sessionId } = req.params;
      const { templateId } = req.body;

      const session = await MissingInfoSession.findOne({ sessionId, userId });
      if (!session) {
        return res.status(404).json({
          success: false,
          error: `Session ${sessionId} not found.`
        });
      }

      // Gather confirmed answers
      const confirmedGaps = { ...(session.applicationAnswers || {}) };
      for (const update of session.confirmedProfileUpdates || []) {
        if (update.field && update.value) {
          confirmedGaps[update.field] = update.value;
        }
      }

      const result = await defaultResumeGenerationService.generateAndSaveTailoredResume({
        userId,
        applicationSessionId: session._id,
        jobTitle: session.jobTitle,
        company: session.companyName,
        jobDescription: session.jobDescription,
        templateId: templateId || 'ATS_SINGLE_COLUMN',
        userConfirmedGaps: confirmedGaps,
        jobMatchReport: session.matchReport
      });

      return res.status(200).json({
        success: true,
        data: {
          tailoredResumeId: result.generatedResume._id,
          previewPdfUrl: `/api/v1/vault/resumes/tailored/${result.generatedResume._id}/preview`,
          downloadUrl: `/api/v1/vault/resumes/tailored/${result.generatedResume._id}/download`,
          matchedKeywords: result.generatedResume.matchedKeywords,
          summaryPreview: result.generatedResume.tailoredSummary,
          validationReport: result.validationReport
        }
      });
    } catch (err) {
      return next(err);
    }
  };

  getReviewManifest = async (req, res, next) => {
    try {
      const userId = req.user?.id || req.query.userId;
      const { sessionId } = req.params;

      const session = await MissingInfoSession.findOne({ sessionId, userId });
      if (!session) {
        return res.status(404).json({
          success: false,
          error: `Session ${sessionId} not found.`
        });
      }

      const tailoredResumes = await defaultResumeGenerationService.listTailoredResumes(userId);
      const matchingResume = tailoredResumes.find(r => 
        (r.applicationSessionId && r.applicationSessionId.toString() === session._id.toString()) ||
        (r.jobTitle === session.jobTitle && r.company === session.companyName)
      );

      let candidateProfile = null;
      try {
        candidateProfile = await ProfessionalProfile.findOne({ userId });
      } catch (_) {
        // Database may not be connected in isolated unit test environments
      }

      return res.status(200).json({
        success: true,
        data: {
          sessionId,
          jobTitle: session.jobTitle,
          company: session.companyName,
          status: session.workflowState || session.currentState,
          workflowState: session.workflowState || session.currentState,
          candidate: {
            fullName: candidateProfile?.fullName || 'Candidate',
            email: candidateProfile?.email || '',
            phone: candidateProfile?.phone || ''
          },
          tailoredResume: matchingResume ? {
            id: matchingResume._id,
            previewUrl: `/api/v1/vault/resumes/tailored/${matchingResume._id}/preview`,
            downloadUrl: `/api/v1/vault/resumes/tailored/${matchingResume._id}/download`,
            matchedKeywords: matchingResume.matchedKeywords,
            tailoredSummary: matchingResume.tailoredSummary,
            pageCount: matchingResume.pageCount
          } : (session.generatedResume ? {
            id: session.generatedResume.resumeId,
            previewUrl: session.generatedResume.previewPdfUrl,
            downloadUrl: session.generatedResume.downloadUrl,
            matchedKeywords: session.generatedResume.matchedKeywords,
            tailoredSummary: session.generatedResume.summaryPreview
          } : null),
          detectedFields: session.detectedFields || [],
          fieldMappings: session.fieldMappings || [],
          fillResults: session.fillResults || null,
          attachmentStatus: session.attachmentStatus || null,
          formValidation: session.formValidation || null,
          applicationAnswers: session.applicationAnswers || {},
          confirmedUpdates: session.confirmedProfileUpdates || [],
          requiresExplicitConfirmation: true,
          readyForSubmission: Boolean(session.userConfirmedSubmission)
        }
      });
    } catch (err) {
      return next(err);
    }
  };

  interpretField = async (req, res, next) => {
    try {
      const userId = req.user?.id || req.body.userId;
      const { sessionId } = req.params;
      const { fieldLabel, fieldName, fieldType, options, explanatoryText } = req.body;

      const session = await MissingInfoSession.findOne({ sessionId, userId });
      if (!session) {
        return res.status(404).json({ success: false, error: `Session ${sessionId} not found.` });
      }

      const descriptor = `${fieldLabel || ''} ${fieldName || ''} ${explanatoryText || ''}`.toLowerCase();

      // Check for sensitive questions
      if (/\b(salary|compensation|desired pay|expected rate)\b/i.test(descriptor)) {
        return res.status(200).json({
          success: true,
          data: {
            candidateProperty: 'applicationAnswers.desiredSalary',
            targetValue: session.applicationAnswers?.salary || null,
            confidence: 'MEDIUM',
            confidenceScore: 0.70,
            action: 'REQUIRE_USER_CONFIRMATION',
            reason: 'SENSITIVE_QUESTION',
            requiresConfirmation: true
          }
        });
      }

      if (/\b(gender|race|ethnicity|hispanic|latino|veteran|disability|demographic)\b/i.test(descriptor)) {
        return res.status(200).json({
          success: true,
          data: {
            candidateProperty: 'demographics.eeoc',
            targetValue: null,
            confidence: 'LOW',
            confidenceScore: 0.30,
            action: 'REQUIRE_USER_CONFIRMATION',
            reason: 'SENSITIVE_QUESTION',
            requiresConfirmation: true
          }
        });
      }

      // Check existing application answers
      for (const [key, val] of Object.entries(session.applicationAnswers || {})) {
        const cleanKey = key.toLowerCase().replace(/[_-]/g, ' ');
        if (descriptor.includes(cleanKey) || cleanKey.includes(descriptor)) {
          const answerValue = typeof val === 'object' ? val.value : val;
          return res.status(200).json({
            success: true,
            data: {
              candidateProperty: `applicationAnswers.${key}`,
              targetValue: answerValue,
              confidence: 'HIGH',
              confidenceScore: 0.92,
              action: 'FILL',
              reason: null,
              requiresConfirmation: false
            }
          });
        }
      }

      // Check confirmed profile updates
      for (const update of session.confirmedProfileUpdates || []) {
        if (update.field && descriptor.includes(update.field.toLowerCase())) {
          return res.status(200).json({
            success: true,
            data: {
              candidateProperty: `profile.${update.field}`,
              targetValue: update.value,
              confidence: 'HIGH',
              confidenceScore: 0.90,
              action: 'FILL',
              reason: null,
              requiresConfirmation: false
            }
          });
        }
      }

      // Ambiguous / unmapped
      return res.status(200).json({
        success: true,
        data: {
          candidateProperty: null,
          targetValue: null,
          confidence: 'AMBIGUOUS',
          confidenceScore: 0.20,
          action: 'REQUIRE_USER_CONFIRMATION',
          reason: 'AMBIGUOUS_LABEL',
          requiresConfirmation: true
        }
      });
    } catch (err) {
      return next(err);
    }
  };

  recordFormFillAndAttachment = async (req, res, next) => {
    try {
      const userId = req.user?.id || req.body.userId;
      const { sessionId } = req.params;
      const { detectedFields, fieldMappings, fillResults, attachmentStatus, formValidation } = req.body;

      if (this.orchestrator && typeof this.orchestrator.recordFormFillAndAttachment === 'function') {
        const session = await this.orchestrator.recordFormFillAndAttachment(sessionId, userId, {
          detectedFields,
          fieldMappings,
          fillResults,
          attachmentStatus,
          formValidation
        });
        return res.status(200).json({
          success: true,
          data: session
        });
      }

      const session = await MissingInfoSession.findOne({ sessionId, userId });
      if (!session) {
        return res.status(404).json({ success: false, error: `Session ${sessionId} not found.` });
      }
      if (detectedFields) session.detectedFields = detectedFields;
      if (fieldMappings) session.fieldMappings = fieldMappings;
      if (fillResults) session.fillResults = fillResults;
      if (attachmentStatus) session.attachmentStatus = attachmentStatus;
      if (formValidation) session.formValidation = formValidation;
      session.transitionTo('AWAITING_USER_REVIEW', 'Form populated and resume attached.');
      await session.save();

      return res.status(200).json({
        success: true,
        data: session
      });
    } catch (err) {
      return next(err);
    }
  };

  confirmSubmission = async (req, res, next) => {
    try {
      const userId = req.user?.id || req.body.userId;
      const { sessionId } = req.params;
      const { userConfirmed } = req.body;

      if (!userConfirmed) {
        return res.status(400).json({
          success: false,
          error: 'Explicit user confirmation is mandatory before submission can proceed.'
        });
      }

      if (this.orchestrator && typeof this.orchestrator.confirmSubmission === 'function') {
        const result = await this.orchestrator.confirmSubmission(sessionId, userId, { userConfirmed });
        return res.status(200).json({
          success: true,
          data: result
        });
      }

      const session = await MissingInfoSession.findOne({ sessionId, userId });
      if (!session) {
        return res.status(404).json({ success: false, error: `Session ${sessionId} not found.` });
      }
      session.userConfirmedSubmission = true;
      session.confirmedAt = new Date();
      session.transitionTo('READY_FOR_SUBMISSION', 'User confirmed submission');
      session.transitionTo('SUBMITTING', 'Executing page submission interaction');
      await session.save();

      return res.status(200).json({
        success: true,
        data: {
          sessionId: session.sessionId,
          workflowState: session.workflowState,
          confirmedAt: session.confirmedAt
        }
      });
    } catch (err) {
      return next(err);
    }
  };

  recordSubmissionOutcome = async (req, res, next) => {
    try {
      const userId = req.user?.id || req.body.userId;
      const { sessionId } = req.params;
      const { status, referenceNumber, confirmationUrl, receipt, error, evidence } = req.body;

      if (!status) {
        return res.status(400).json({
          success: false,
          error: 'status is required to record submission outcome.'
        });
      }

      if (this.orchestrator && typeof this.orchestrator.recordSubmissionOutcome === 'function') {
        const result = await this.orchestrator.recordSubmissionOutcome(sessionId, userId, {
          status,
          referenceNumber,
          confirmationUrl,
          receipt,
          error,
          evidence
        });
        return res.status(200).json({
          success: true,
          data: result
        });
      }

      const session = await MissingInfoSession.findOne({ sessionId, userId });
      if (!session) {
        return res.status(404).json({ success: false, error: `Session ${sessionId} not found.` });
      }

      session.submissionResult = { status, referenceNumber, confirmationUrl, receipt, error, evidence, recordedAt: new Date() };
      session.transitionTo(status, `Submission recorded as ${status}`);
      await session.save();

      return res.status(200).json({
        success: true,
        data: { session, status }
      });
    } catch (err) {
      return next(err);
    }
  };

  recoverWorkflowSession = async (req, res, next) => {
    try {
      const userId = req.user?.id || req.query.userId;
      const { sessionId } = req.params;

      if (this.orchestrator && typeof this.orchestrator.recoverWorkflowSession === 'function') {
        const session = await this.orchestrator.recoverWorkflowSession(sessionId, userId);
        if (!session) {
          return res.status(404).json({
            success: false,
            error: `Session ${sessionId} not found for recovery.`
          });
        }
        return res.status(200).json({
          success: true,
          data: session
        });
      }

      const session = await MissingInfoSession.findOne({ sessionId, userId });
      if (!session) {
        return res.status(404).json({
          success: false,
          error: `Session ${sessionId} not found for recovery.`
        });
      }

      return res.status(200).json({
        success: true,
        data: session
      });
    } catch (err) {
      return next(err);
    }
  };
}

export const defaultMissingInfoController = new MissingInfoController();
export default defaultMissingInfoController;
