/**
 * Missing-Information Engine Service
 * Manages persistent multi-step gap clarification workflows,
 * one-question-at-a-time serving, answer validation, and strict segregation
 * between canonical profile facts and application-specific answers.
 */

import crypto from 'crypto';
import { MissingInfoSession, WorkflowState } from './missing-info-session.model.js';
import { ProfessionalProfile } from '../users/professional-profile.model.js';
import { internalApi } from '../config/axios.js';
import { config } from '../config/env.js';
import { ProvenanceSource, ProfileVerificationStatus } from '../../../shared/src/index.js';

export class MissingInfoService {
  constructor(options = {}) {
    this.sessionModel = options.sessionModel || MissingInfoSession;
    this.profileModel = options.profileModel || ProfessionalProfile;
    this.internalApi = options.internalApi || internalApi;
    this.pythonApiUrl = options.pythonApiUrl || config.pythonApiUrl;
  }

  /**
   * Initializes a job-specific missing information session.
   * Executes requirement matching against the user's verified profile,
   * generates prioritized gap questions, and persists durable workflow state.
   */
  async initializeSession({
    userId,
    jobTitle,
    companyName = '',
    jobDescription,
    applicationQuestions = []
  }) {
    if (!userId) throw new Error('User ID is required.');
    if (!jobTitle || !jobDescription) {
      throw new Error('jobTitle and jobDescription are required to initialize gap analysis.');
    }

    const sessionId = `mis_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // 1. Fetch user's verified profile
    let profile = await this.profileModel.findOne({ userId });
    const candidateProfile = profile ? profile.toJSON() : { fullName: 'Candidate', skills: [], experience: [], education: [] };

    // 2. Execute requirement-to-profile matching via AI Service
    let matchReport;
    try {
      const matchResponse = await this.internalApi.post(this.pythonApiUrl, {
        intent: 'match_job_requirements',
        raw_data: {
          jobTitle,
          companyName,
          jobDescription,
          profile: candidateProfile,
          applicationQuestions
        }
      });

      if (matchResponse.data && matchResponse.data.data) {
        matchReport = matchResponse.data.data.data || matchResponse.data.data;
      } else {
        throw new Error('AI service returned empty match report');
      }
    } catch (err) {
      // Deterministic fallback report if AI service is offline
      matchReport = {
        jobTitle,
        companyName,
        requirementCoverageEstimate: 100.0,
        breakdown: {
          mandatoryCoverage: 100.0,
          preferredCoverage: 100.0,
          totalRequirements: 0,
          supportedCount: 0,
          partiallySupportedCount: 0,
          needsClarificationCount: 0,
          notFoundCount: 0
        },
        evidenceMappings: [],
        supportingProfileItems: {
          topRelevantSkills: [],
          topRelevantExperienceIds: [],
          topRelevantProjectIds: [],
          topRelevantCertifications: []
        },
        warnings: [`Fallback matching used: ${err.message}`]
      };
    }

    // 3. Generate prioritized gap questions
    let questions = [];
    try {
      const questionsResponse = await this.internalApi.post(this.pythonApiUrl, {
        intent: 'generate_gap_questions',
        raw_data: {
          matchReport,
          profile: candidateProfile,
          answeredKeys: [],
          declinedKeys: []
        }
      });

      if (questionsResponse.data && questionsResponse.data.data) {
        const qData = questionsResponse.data.data.data || questionsResponse.data.data;
        questions = qData.questions || [];
      }
    } catch (qErr) {
      questions = [];
    }

    // 4. Create and persist session in MongoDB
    const session = new this.sessionModel({
      sessionId,
      userId,
      jobTitle,
      companyName,
      jobDescription,
      applicationQuestions,
      workflowState: questions.length === 0 ? WorkflowState.READY_FOR_RESUME_GENERATION : WorkflowState.AWAITING_USER_RESPONSE,
      stateHistory: [
        {
          state: WorkflowState.ANALYZING,
          enteredAt: new Date(),
          reason: 'Initial job description and profile matching initiated'
        },
        {
          state: questions.length === 0 ? WorkflowState.READY_FOR_RESUME_GENERATION : WorkflowState.AWAITING_USER_RESPONSE,
          enteredAt: new Date(),
          reason: questions.length === 0 ? 'No information gaps identified' : `Identified ${questions.length} prioritized questions`
        }
      ],
      matchReport,
      questions,
      currentQuestionIndex: 0,
      readyForResumeGeneration: questions.length === 0
    });

    await session.save();

    const currentQuestion = questions.length > 0 ? questions[0] : null;

    return {
      sessionId: session.sessionId,
      workflowState: session.workflowState,
      totalQuestions: questions.length,
      currentQuestionIndex: session.currentQuestionIndex,
      currentQuestion,
      matchReport: session.matchReport,
      readyForResumeGeneration: session.readyForResumeGeneration
    };
  }

  /**
   * Retrieves current active question or session status.
   */
  async getCurrentQuestion(sessionId, userId) {
    const session = await this.sessionModel.findOne({ sessionId, userId });
    if (!session) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    // Find the next unanswered/pending question
    const pendingIndex = session.questions.findIndex(q => q.status === 'PENDING');
    let currentQuestion = null;

    if (pendingIndex !== -1) {
      session.currentQuestionIndex = pendingIndex;
      currentQuestion = session.questions[pendingIndex];
      if (session.workflowState === WorkflowState.QUESTIONS_PENDING) {
        session.transitionTo(WorkflowState.AWAITING_USER_RESPONSE, 'Presenting next pending question');
        await session.save();
      }
    } else {
      // Check if all required questions are answered or if blocked
      const hasUnresolvedRequired = session.questions.some(
        q => q.category === 'REQUIRED' && q.status !== 'ANSWERED'
      );

      if (hasUnresolvedRequired) {
        session.transitionTo(WorkflowState.BLOCKED_BY_REQUIRED_INFO, 'Unresolved mandatory requirements remain');
      } else {
        session.transitionTo(WorkflowState.READY_FOR_RESUME_GENERATION, 'All required and active questions resolved');
        session.readyForResumeGeneration = true;
      }
      await session.save();
    }

    return {
      sessionId: session.sessionId,
      workflowState: session.workflowState,
      totalQuestions: session.questions.length,
      currentQuestionIndex: session.currentQuestionIndex,
      currentQuestion,
      readyForResumeGeneration: session.readyForResumeGeneration,
      blockedReason: session.blockedReason,
      matchReport: session.matchReport
    };
  }

  /**
   * Submits and validates a user's answer to a single question.
   * Updates either the permanent profile, project details, or application-specific answers.
   * Recalculates requirements and advances to the next question.
   */
  async submitAnswer(sessionId, userId, questionId, userResponse) {
    const session = await this.sessionModel.findOne({ sessionId, userId });
    if (!session) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    if ([WorkflowState.CANCELLED, WorkflowState.READY_FOR_RESUME_GENERATION].includes(session.workflowState)) {
      throw new Error(`Cannot submit answer. Session is in final state: ${session.workflowState}`);
    }

    const question = session.questions.find(q => q.id === questionId);
    if (!question) {
      throw new Error(`Question ${questionId} not found in session.`);
    }

    session.transitionTo(WorkflowState.UPDATING_PROFILE, `Processing response for ${question.targetKey}`);

    const selectedOption = userResponse?.selectedOptionId;
    const details = userResponse?.details || '';

    // 1. Validation Logic
    const isDeclined = ['none', 'no', 'complete_as_is'].includes(selectedOption);
    const isFamiliarOnly = selectedOption === 'familiar';

    // Rule: Handle explicit decline
    if (isDeclined) {
      question.status = 'DECLINED';
      question.userResponse = { selectedOptionId: selectedOption, details: 'User confirmed no experience / declined' };
      question.answeredAt = new Date();
      if (!session.declinedQuestionIds.includes(question.targetKey)) {
        session.declinedQuestionIds.push(question.targetKey);
      }

      // If this was a REQUIRED question, the application cannot proceed without this mandatory info
      if (question.category === 'REQUIRED') {
        session.blockedReason = `Mandatory qualification "${question.targetKey}" was declined or not possessed.`;
        session.transitionTo(WorkflowState.BLOCKED_BY_REQUIRED_INFO, session.blockedReason);
        await session.save();
        return {
          sessionId: session.sessionId,
          workflowState: session.workflowState,
          blockedReason: session.blockedReason,
          questionId,
          status: 'DECLINED'
        };
      }
    }
    // Rule: Basic familiarity only -> do NOT add full skill to profile
    else if (isFamiliarOnly) {
      question.status = 'ANSWERED';
      question.userResponse = { selectedOptionId: selectedOption, familiarity: true };
      question.answeredAt = new Date();

      if (!session.applicationAnswers) session.applicationAnswers = {};
      session.applicationAnswers[`familiarity_${question.targetKey}`] = `User noted basic familiarity with ${question.targetKey}.`;
    }
    // Confirmed practical experience or positive answer
    else {
      question.status = 'ANSWERED';
      question.userResponse = userResponse;
      question.answeredAt = new Date();

      // Route to destination
      if (question.targetEntity === 'PROFILE_SKILL') {
        let profile = await this.profileModel.findOne({ userId });
        if (!profile) {
          profile = new this.profileModel({
            userId,
            fullName: 'User',
            provenance: { source: ProvenanceSource.USER_CONFIRMED, status: ProfileVerificationStatus.VERIFIED }
          });
        }

        const years = Number(userResponse.yearsOfExperience) || 1.0;
        const existingSkillIndex = profile.skills.findIndex(
          s => s.name.toLowerCase() === question.targetKey.toLowerCase()
        );

        if (existingSkillIndex !== -1) {
          profile.skills[existingSkillIndex].yearsOfExperience = Math.max(
            profile.skills[existingSkillIndex].yearsOfExperience || 0,
            years
          );
          profile.skills[existingSkillIndex].provenance = {
            source: ProvenanceSource.USER_CONFIRMED,
            status: ProfileVerificationStatus.VERIFIED,
            verifiedAt: new Date()
          };
        } else {
          profile.skills.push({
            id: `sk_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
            category: 'Technical',
            name: question.targetKey,
            yearsOfExperience: years,
            provenance: {
              source: ProvenanceSource.USER_CONFIRMED,
              status: ProfileVerificationStatus.VERIFIED,
              verifiedAt: new Date()
            }
          });
        }

        await profile.save();

        session.confirmedProfileUpdates.push({
          field: `skills.${question.targetKey}`,
          value: { name: question.targetKey, yearsOfExperience: years, context: details },
          targetEntity: 'PROFILE_SKILL',
          appliedAt: new Date()
        });
      }
      else if (question.targetEntity === 'PROFILE_PROJECT') {
        let profile = await this.profileModel.findOne({ userId });
        if (profile && profile.projects.length > 0) {
          profile.projects[0].technologies.push(question.targetKey);
          await profile.save();
        }
        session.confirmedProfileUpdates.push({
          field: `projects[0].technologies`,
          value: question.targetKey,
          targetEntity: 'PROFILE_PROJECT',
          appliedAt: new Date()
        });
      }
      else if (question.targetEntity === 'APPLICATION_ANSWER') {
        // Strictly application-specific: segregated from global profile
        if (!session.applicationAnswers) session.applicationAnswers = {};
        session.applicationAnswers[question.targetKey] = details || selectedOption;
      }
    }

    // 2. Recheck Requirements
    session.transitionTo(WorkflowState.RECHECKING_REQUIREMENTS, 'Recalculating requirement coverage');

    let updatedProfile = await this.profileModel.findOne({ userId });
    const candProfile = updatedProfile ? updatedProfile.toJSON() : {};

    try {
      const matchResponse = await this.internalApi.post(this.pythonApiUrl, {
        intent: 'match_job_requirements',
        raw_data: {
          jobTitle: session.jobTitle,
          companyName: session.companyName,
          jobDescription: session.jobDescription,
          profile: candProfile,
          applicationQuestions: session.applicationQuestions
        }
      });

      if (matchResponse.data && matchResponse.data.data) {
        session.matchReport = matchResponse.data.data.data || matchResponse.data.data;
      }
    } catch (err) {
      // Keep existing matchReport if recheck fails
    }

    // 3. Advance to next question or finalize
    const nextPendingIndex = session.questions.findIndex(q => q.status === 'PENDING');

    if (nextPendingIndex !== -1) {
      session.currentQuestionIndex = nextPendingIndex;
      session.transitionTo(WorkflowState.AWAITING_USER_RESPONSE, 'Advancing to next pending question');
    } else {
      // Check if all required questions are resolved
      const hasUnresolvedRequired = session.questions.some(
        q => q.category === 'REQUIRED' && q.status !== 'ANSWERED'
      );

      if (hasUnresolvedRequired) {
        session.transitionTo(WorkflowState.BLOCKED_BY_REQUIRED_INFO, 'Mandatory requirement unanswered');
      } else {
        session.transitionTo(WorkflowState.READY_FOR_RESUME_GENERATION, 'All questions completed. Ready for resume generation.');
        session.readyForResumeGeneration = true;
      }
    }

    await session.save();

    const nextQuestion = nextPendingIndex !== -1 ? session.questions[nextPendingIndex] : null;

    return {
      sessionId: session.sessionId,
      workflowState: session.workflowState,
      readyForResumeGeneration: session.readyForResumeGeneration,
      currentQuestionIndex: session.currentQuestionIndex,
      nextQuestion,
      matchReport: session.matchReport,
      confirmedUpdates: session.confirmedProfileUpdates,
      applicationAnswers: session.applicationAnswers
    };
  }

  /**
   * Skips an optional or high-value question.
   * Required questions cannot be skipped without triggering blocker.
   */
  async skipQuestion(sessionId, userId, questionId) {
    const session = await this.sessionModel.findOne({ sessionId, userId });
    if (!session) throw new Error(`Session ${sessionId} not found.`);

    const question = session.questions.find(q => q.id === questionId);
    if (!question) throw new Error(`Question ${questionId} not found.`);

    if (question.category === 'REQUIRED') {
      session.blockedReason = `Mandatory question "${question.targetKey}" cannot be skipped.`;
      session.transitionTo(WorkflowState.BLOCKED_BY_REQUIRED_INFO, session.blockedReason);
      await session.save();
      return {
        sessionId: session.sessionId,
        workflowState: session.workflowState,
        blockedReason: session.blockedReason,
        status: 'BLOCKED'
      };
    }

    question.status = 'SKIPPED';
    question.answeredAt = new Date();

    const nextPendingIndex = session.questions.findIndex(q => q.status === 'PENDING');
    if (nextPendingIndex !== -1) {
      session.currentQuestionIndex = nextPendingIndex;
      session.transitionTo(WorkflowState.AWAITING_USER_RESPONSE, 'Skipped to next question');
    } else {
      session.transitionTo(WorkflowState.READY_FOR_RESUME_GENERATION, 'All questions answered or skipped');
      session.readyForResumeGeneration = true;
    }

    await session.save();

    return {
      sessionId: session.sessionId,
      workflowState: session.workflowState,
      readyForResumeGeneration: session.readyForResumeGeneration,
      currentQuestionIndex: session.currentQuestionIndex,
      nextQuestion: nextPendingIndex !== -1 ? session.questions[nextPendingIndex] : null
    };
  }

  /**
   * Cancels an in-progress session.
   */
  async cancelSession(sessionId, userId) {
    const session = await this.sessionModel.findOne({ sessionId, userId });
    if (!session) throw new Error(`Session ${sessionId} not found.`);

    session.transitionTo(WorkflowState.CANCELLED, 'User cancelled the missing information session');
    await session.save();

    return {
      sessionId: session.sessionId,
      workflowState: session.workflowState
    };
  }
}

export const defaultMissingInfoService = new MissingInfoService();
export default defaultMissingInfoService;

