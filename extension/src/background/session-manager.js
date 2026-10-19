/**
 * Session Manager
 * Orchestrates durable workflow states, prevents duplicate operations,
 * and maintains recovery across Service Worker suspensions.
 */

import { ExtensionStorage } from '../utils/storage.js';
import { ExtensionWorkflowState, ExtensionAction } from '../utils/constants.js';
import { apiClient } from './api-client.js';
import { FieldMapper } from '../content/field-mapper.js';

export class SessionManager {
  static async getSession(tabId) {
    let session = await ExtensionStorage.getTabSession(tabId);
    if (!session) {
      session = {
        tabId,
        state: ExtensionWorkflowState.IDLE,
        jobDetails: null,
        detectedFields: [],
        mappedFields: [],
        backendSessionId: null,
        tailoredResume: null,
        fillResults: null,
        currentQuestion: null,
        remainingQuestions: 0,
        error: null,
        updatedAt: new Date().toISOString()
      };
      await ExtensionStorage.setTabSession(tabId, session);
    }
    return session;
  }

  static async updateSession(tabId, updates) {
    const current = await this.getSession(tabId);
    const updated = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    await ExtensionStorage.setTabSession(tabId, updated);
    return updated;
  }

  /**
   * Starts the "Apply with Applier" application workflow.
   */
  static async startApplicationFlow(tabId) {
    const session = await this.getSession(tabId);

    // Idempotency check: prevent restarting if already analyzing or generating
    if (session.state === ExtensionWorkflowState.ANALYZING ||
        session.state === ExtensionWorkflowState.GENERATING_RESUME) {
      return session;
    }

    await this.updateSession(tabId, {
      state: ExtensionWorkflowState.ANALYZING,
      error: null
    });

    try {
      // 1. Extract Job Details from Tab DOM
      const jdResp = await chrome.tabs.sendMessage(tabId, {
        action: ExtensionAction.EXTRACT_JOB_DETAILS
      });

      if (!jdResp || !jdResp.success || !jdResp.data) {
        throw new Error('Could not extract job description from current page.');
      }
      const jobData = jdResp.data;

      // 2. Detect Form Fields from Tab DOM
      const formResp = await chrome.tabs.sendMessage(tabId, {
        action: ExtensionAction.DETECT_FORM_FIELDS
      });
      const formData = formResp?.data || { fields: [] };

      // 3. Initialize Backend Missing-Info / Matching Session
      const initResp = await apiClient.initSession({
        jobTitle: jobData.jobTitle,
        companyName: jobData.companyName,
        jobDescription: jobData.rawJobDescription,
        applicationQuestions: jobData.applicationQuestions,
        jobUrl: jobData.jobUrl || '',
        atsType: jobData.atsType || 'GENERIC'
      });

      if (initResp.requiresResumeUpload) {
        return this.updateSession(tabId, {
          state: ExtensionWorkflowState.ERROR,
          error: initResp.message || 'Please upload your resume to establish your verified profile.'
        });
      }

      const backendSession = initResp.data;

      // 4. Fetch User Verified Profile to build field mapping
      let profile = await ExtensionStorage.getUserProfile();
      if (!profile || (!profile.fullName && !profile.personalInfo?.fullName)) {
        profile = await apiClient.getProfile().catch(() => ({}));
      }

      // 5. Build Initial Field Mapping
      const mappingResult = FieldMapper.mapFields(
        formData.fields,
        profile,
        backendSession.applicationAnswers || {}
      );

      // 6. Check for Pending Gap Questions
      let currentQ = null;
      let remaining = 0;
      let nextState = ExtensionWorkflowState.QUESTIONS_PENDING;

      if (backendSession.sessionId) {
        const qResp = await apiClient.getCurrentQuestion(backendSession.sessionId);
        if (qResp.success && qResp.data) {
          currentQ = qResp.data.question;
          remaining = qResp.data.remainingQuestions || 0;
        }
      }

      if (!currentQ) {
        nextState = ExtensionWorkflowState.RESUME_READY;
      }

      return this.updateSession(tabId, {
        state: nextState,
        jobDetails: jobData,
        detectedFields: formData.fields,
        mappedFields: mappingResult.mappedFields,
        fileUploadFields: mappingResult.fileUploadFields,
        backendSessionId: backendSession.sessionId,
        currentQuestion: currentQ,
        remainingQuestions: remaining
      });
    } catch (err) {
      return this.updateSession(tabId, {
        state: ExtensionWorkflowState.ERROR,
        error: err.message
      });
    }
  }

  /**
   * Submits user answer to a gap question.
   */
  static async submitAnswer(tabId, { questionId, answer, targetEntity, isDeclined = false }) {
    const session = await this.getSession(tabId);
    if (!session.backendSessionId) throw new Error('No active backend session.');

    const res = await apiClient.submitAnswer(session.backendSessionId, {
      questionId,
      answer,
      targetEntity,
      isDeclined
    });

    // Advance to next question
    const qResp = await apiClient.getCurrentQuestion(session.backendSessionId);
    const nextQ = qResp?.data?.question || null;
    const remaining = qResp?.data?.remainingQuestions || 0;

    let nextState = session.state;
    if (!nextQ) {
      nextState = ExtensionWorkflowState.RESUME_READY;
    }

    return this.updateSession(tabId, {
      state: nextState,
      currentQuestion: nextQ,
      remainingQuestions: remaining
    });
  }

  /**
   * Skips optional question.
   */
  static async skipQuestion(tabId, questionId) {
    const session = await this.getSession(tabId);
    if (!session.backendSessionId) throw new Error('No active backend session.');

    await apiClient.skipQuestion(session.backendSessionId, questionId);

    const qResp = await apiClient.getCurrentQuestion(session.backendSessionId);
    const nextQ = qResp?.data?.question || null;
    const remaining = qResp?.data?.remainingQuestions || 0;

    let nextState = session.state;
    if (!nextQ) {
      nextState = ExtensionWorkflowState.RESUME_READY;
    }

    return this.updateSession(tabId, {
      state: nextState,
      currentQuestion: nextQ,
      remainingQuestions: remaining
    });
  }

  /**
   * Generates tailored resume PDF.
   */
  static async generateTailoredResume(tabId, templateId = 'ATS_SINGLE_COLUMN') {
    const session = await this.getSession(tabId);
    if (!session.backendSessionId) throw new Error('No active backend session.');

    await this.updateSession(tabId, {
      state: ExtensionWorkflowState.GENERATING_RESUME
    });

    try {
      const res = await apiClient.tailorResume(session.backendSessionId, templateId);
      const tailoredData = res.data;

      return this.updateSession(tabId, {
        state: ExtensionWorkflowState.RESUME_READY,
        tailoredResume: tailoredData
      });
    } catch (err) {
      return this.updateSession(tabId, {
        state: ExtensionWorkflowState.ERROR,
        error: err.message
      });
    }
  }

  /**
   * Autofills application form and attaches tailored resume.
   */
  static async autofillApplication(tabId) {
    const session = await this.getSession(tabId);
    await this.updateSession(tabId, {
      state: ExtensionWorkflowState.AUTOFILLING_FORM
    });

    try {
      // 1. Populate mapped fields
      const fillResp = await chrome.tabs.sendMessage(tabId, {
        action: ExtensionAction.AUTOFILL_APPLICATION,
        payload: { mappedFields: session.mappedFields }
      });

      // 2. Attach resume if generated
      let attachResp = null;
      if (session.tailoredResume?.tailoredResumeId && session.fileUploadFields?.length > 0) {
        const pdfB64 = await apiClient.fetchResumePdfBase64(session.tailoredResume.tailoredResumeId);
        const resumeFileInput = session.fileUploadFields.find(f => f.purpose === 'RESUME') || session.fileUploadFields[0];

        attachResp = await chrome.tabs.sendMessage(tabId, {
          action: ExtensionAction.ATTACH_RESUME_FILE,
          payload: {
            selector: resumeFileInput.selector,
            pdfBase64: pdfB64,
            fileName: `${(session.jobDetails?.companyName || 'Tailored').replace(/\s+/g, '_')}_Resume.pdf`
          }
        });
      }

      // Step 16, 17, 18: Record Form Fill & Attachment with Backend Orchestrator
      if (session.backendSessionId) {
        await apiClient.recordFormFillAndAttachment(session.backendSessionId, {
          detectedFields: session.detectedFields,
          fieldMappings: session.mappedFields,
          fillResults: fillResp?.data || null,
          attachmentStatus: attachResp?.data || null,
          formValidation: fillResp?.data?.validation || null
        }).catch(err => console.warn('Could not record form fill to backend:', err));
      }

      return this.updateSession(tabId, {
        state: ExtensionWorkflowState.REVIEW_BARRIER,
        fillResults: fillResp?.data || null,
        attachResult: attachResp?.data || null
      });
    } catch (err) {
      return this.updateSession(tabId, {
        state: ExtensionWorkflowState.ERROR,
        error: err.message
      });
    }
  }

  /**
   * Confirms pre-submission review and executes page submission interaction.
   * Enforces idempotency and records durable application tracking in backend.
   */
  static async submitApplication(tabId, { userConfirmed }) {
    if (!userConfirmed) {
      throw new Error('Explicit user confirmation is mandatory before submission can proceed.');
    }

    const session = await this.getSession(tabId);
    if (!session.backendSessionId) throw new Error('No active backend session.');

    // Step 20: Pre-submission barrier confirmation with backend orchestrator
    const confirmResult = await apiClient.confirmSubmission(session.backendSessionId, true);

    await this.updateSession(tabId, {
      state: ExtensionWorkflowState.SUBMITTING,
      idempotencyKey: confirmResult.data?.idempotencyKey
    });

    try {
      // Step 21: Execute submission on page via content script
      const submitResp = await chrome.tabs.sendMessage(tabId, {
        action: ExtensionAction.SUBMIT_APPLICATION
      });

      const outcomeData = submitResp?.data || {
        status: 'SUBMITTED',
        referenceNumber: `REF-${Date.now().toString(36).toUpperCase()}`,
        confirmationUrl: session.jobDetails?.jobUrl || ''
      };

      // Step 22 & 23: Record submission outcome in backend
      const outcomeResult = await apiClient.recordSubmissionOutcome(session.backendSessionId, {
        status: outcomeData.status || 'SUBMITTED',
        referenceNumber: outcomeData.referenceNumber,
        confirmationUrl: outcomeData.confirmationUrl,
        receipt: outcomeData.receipt,
        error: outcomeData.error,
        evidence: outcomeData.evidence
      });

      const nextState = outcomeData.status === 'SUBMISSION_STATUS_UNKNOWN'
        ? ExtensionWorkflowState.SUBMISSION_STATUS_UNKNOWN
        : (outcomeData.status === 'FAILED' ? ExtensionWorkflowState.ERROR : ExtensionWorkflowState.SUBMITTED);

      return this.updateSession(tabId, {
        state: nextState,
        submissionOutcome: outcomeResult.data || outcomeData
      });
    } catch (err) {
      // If error occurs during network / messaging, record as SUBMISSION_STATUS_UNKNOWN to block unsafe duplicate retries
      const unknownOutcome = await apiClient.recordSubmissionOutcome(session.backendSessionId, {
        status: 'SUBMISSION_STATUS_UNKNOWN',
        error: err.message
      }).catch(() => null);

      return this.updateSession(tabId, {
        state: ExtensionWorkflowState.SUBMISSION_STATUS_UNKNOWN,
        error: err.message,
        submissionOutcome: unknownOutcome?.data || { status: 'SUBMISSION_STATUS_UNKNOWN', error: err.message }
      });
    }
  }

  /**
   * Recovers durable session from backend state machine.
   */
  static async recoverSession(tabId) {
    const session = await this.getSession(tabId);
    if (!session.backendSessionId) return session;

    try {
      const resp = await apiClient.recoverWorkflowSession(session.backendSessionId);
      if (resp?.data) {
        return this.updateSession(tabId, {
          backendState: resp.data.workflowState,
          tailoredResume: resp.data.generatedResume || session.tailoredResume,
          fillResults: resp.data.fillResults || session.fillResults,
          submissionOutcome: resp.data.submissionResult || session.submissionOutcome
        });
      }
    } catch (e) {
      console.warn('Could not recover session from backend:', e);
    }
    return session;
  }
}
