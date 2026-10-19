/**
 * Job-Specific Missing-Information Engine Test Suite
 * Verifies:
 * 1. End-to-end gap clarification: gap detected -> prioritized question -> user confirms -> profile updated -> requirements recalculated -> ready for resume generation.
 * 2. One question served at a time in strict priority order (Required -> High-value -> Optional).
 * 3. Prevention of re-asking already confirmed or explicitly declined questions.
 * 4. Strict segregation: Application-specific answers (e.g. sponsorship, salary) do NOT bleed into canonical profile.
 * 5. Rule enforcement: Basic familiarity does NOT falsely add full skill proficiency to profile.
 * 6. Mandatory blocker: Explicit decline of a REQUIRED requirement transitions workflow to BLOCKED_BY_REQUIRED_INFO.
 * 7. Skipping behavior: Optional questions can be skipped; required questions cannot be skipped without blocker.
 * 8. State persistence & audit history: Transitions recorded and recovered by sessionId.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { MissingInfoService } from '../src/workflow/missing-info.service.js';
import { WorkflowState } from '../src/workflow/missing-info-session.model.js';
import { ProvenanceSource, ProfileVerificationStatus } from '../../shared/src/index.js';

// In-memory Mock Profile Store
class MockProfileModel {
  static store = new Map();

  static async findOne({ userId }) {
    return MockProfileModel.store.get(String(userId)) || null;
  }

  constructor(data) {
    this._id = data._id || `prof_${Date.now()}`;
    this.userId = data.userId;
    this.fullName = data.fullName || 'Candidate';
    this.skills = data.skills || [];
    this.experience = data.experience || [];
    this.education = data.education || [];
    this.projects = data.projects || [];
  }

  toJSON() {
    return {
      _id: this._id,
      userId: this.userId,
      fullName: this.fullName,
      skills: this.skills,
      experience: this.experience,
      education: this.education,
      projects: this.projects
    };
  }

  async save() {
    MockProfileModel.store.set(String(this.userId), this);
    return this;
  }
}

// In-memory Mock Session Store
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
    this.stateHistory = this.stateHistory || [];
    this.questions = this.questions || [];
    this.confirmedProfileUpdates = this.confirmedProfileUpdates || [];
    this.declinedQuestionIds = this.declinedQuestionIds || [];
    this.applicationAnswers = this.applicationAnswers || {};
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

describe('Job-Specific Missing-Information Engine', () => {
  let service;
  let mockInternalApi;
  const testUserId = 'user_test_99';

  beforeEach(() => {
    MockProfileModel.store.clear();
    MockSessionModel.store.clear();

    // Default mock initial profile (Candidate has Python, but lacks Docker, PyTorch, and Sponsorship answer)
    const initialProfile = new MockProfileModel({
      userId: testUserId,
      fullName: 'Alex Engineer',
      skills: [
        {
          id: 'sk_1',
          name: 'Python',
          category: 'Technical',
          yearsOfExperience: 4.0,
          provenance: {
            source: ProvenanceSource.USER_CONFIRMED,
            status: ProfileVerificationStatus.VERIFIED
          }
        }
      ],
      experience: [],
      education: [],
      projects: []
    });
    MockProfileModel.store.set(testUserId, initialProfile);

    // Mock internalApi for AI service calls
    mockInternalApi = {
      post: async (url, payload) => {
        const intent = payload.intent;
        if (intent === 'match_job_requirements') {
          const profile = payload.raw_data.profile || {};
          const currentSkills = (profile.skills || []).map(s => s.name?.toLowerCase());

          const evidenceMappings = [];
          // Docker check
          if (currentSkills.includes('docker')) {
            evidenceMappings.push({
              requirementId: 'req_docker',
              requirementText: 'Docker',
              requirementType: 'TECHNICAL_SKILL',
              importance: 'MANDATORY',
              status: 'SUPPORTED',
              matchingEvidence: ['Verified skill: Docker']
            });
          } else {
            evidenceMappings.push({
              requirementId: 'req_docker',
              requirementText: 'Docker',
              requirementType: 'TECHNICAL_SKILL',
              importance: 'MANDATORY',
              status: 'NOT_FOUND',
              explanation: 'No evidence found'
            });
          }

          // PyTorch check
          if (currentSkills.includes('pytorch')) {
            evidenceMappings.push({
              requirementId: 'req_pytorch',
              requirementText: 'PyTorch',
              requirementType: 'TECHNICAL_SKILL',
              importance: 'PREFERRED',
              status: 'SUPPORTED',
              matchingEvidence: ['Verified skill: PyTorch']
            });
          } else {
            evidenceMappings.push({
              requirementId: 'req_pytorch',
              requirementText: 'PyTorch',
              requirementType: 'TECHNICAL_SKILL',
              importance: 'PREFERRED',
              status: 'NOT_FOUND',
              explanation: 'No evidence found'
            });
          }

          const hasDocker = currentSkills.includes('docker');
          const hasPyTorch = currentSkills.includes('pytorch');

          return {
            data: {
              success: true,
              data: {
                jobTitle: payload.raw_data.jobTitle,
                companyName: payload.raw_data.companyName,
                requirementCoverageEstimate: hasDocker && hasPyTorch ? 100.0 : (hasDocker ? 75.0 : 25.0),
                breakdown: {
                  mandatoryCoverage: hasDocker ? 100.0 : 0.0,
                  preferredCoverage: hasPyTorch ? 100.0 : 0.0,
                  totalRequirements: 2,
                  supportedCount: (hasDocker ? 1 : 0) + (hasPyTorch ? 1 : 0),
                  partiallySupportedCount: 0,
                  needsClarificationCount: 0,
                  notFoundCount: (hasDocker ? 0 : 1) + (hasPyTorch ? 0 : 1)
                },
                evidenceMappings
              }
            }
          };
        }

        if (intent === 'generate_gap_questions') {
          const matchReport = payload.raw_data.matchReport || {};
          const answered = new Set(payload.raw_data.answeredKeys || []);
          const declined = new Set(payload.raw_data.declinedKeys || []);
          const questions = [];

          for (const m of matchReport.evidenceMappings || []) {
            if (m.status !== 'SUPPORTED') {
              if (answered.has(m.requirementText) || declined.has(m.requirementText)) continue;

              const isMandatory = m.importance === 'MANDATORY';
              questions.push({
                id: `gap_${m.requirementId}`,
                requirementId: m.requirementId,
                category: isMandatory ? 'REQUIRED' : 'HIGH_VALUE',
                targetEntity: 'PROFILE_SKILL',
                targetKey: m.requirementText,
                questionText: isMandatory
                  ? `The job requires experience with ${m.requirementText}. Have you used it in practical work?`
                  : `The job prefers experience with ${m.requirementText}. Have you used it in practical work?`,
                contextExplanation: `${m.requirementText} is a stated qualification.`,
                options: [
                  { id: 'experienced', label: 'Yes, practical experience', requiresDetails: true },
                  { id: 'familiar', label: 'Only basic familiarity', requiresDetails: false },
                  { id: 'none', label: 'No experience with this', requiresDetails: false }
                ],
                status: 'PENDING'
              });
            }
          }

          // Sort REQUIRED before HIGH_VALUE
          questions.sort((a, b) => (a.category === 'REQUIRED' ? -1 : 1));

          return {
            data: {
              success: true,
              data: {
                totalQuestions: questions.length,
                questions
              }
            }
          };
        }

        return { data: { success: true, data: {} } };
      }
    };

    service = new MissingInfoService({
      sessionModel: MockSessionModel,
      profileModel: MockProfileModel,
      internalApi: mockInternalApi
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 1. COMPLETE END-TO-END WORKFLOW
  // ─────────────────────────────────────────────────────────────
  describe('1. Complete End-to-End Gap Clarification Flow', () => {
    it('identifies missing qualifications, asks prioritized questions, validates confirmation, updates profile, and enables resume generation', async () => {
      // Step A: User opens job application requiring Docker (mandatory) & PyTorch (preferred)
      const initResult = await service.initializeSession({
        userId: testUserId,
        jobTitle: 'Senior Machine Learning Engineer',
        companyName: 'Anthropic Labs',
        jobDescription: 'Requirements:\n- Docker containerization\nPreferred:\n- PyTorch framework experience'
      });

      expect(initResult.sessionId).toBeDefined();
      expect(initResult.workflowState).toBe(WorkflowState.AWAITING_USER_RESPONSE);
      expect(initResult.totalQuestions).toBe(2);
      expect(initResult.readyForResumeGeneration).toBe(false);

      // Step B: Serve Question 1 (Docker is REQUIRED, so it must be first)
      const q1 = initResult.currentQuestion;
      expect(q1.category).toBe('REQUIRED');
      expect(q1.targetKey).toBe('Docker');

      // Step C: User confirms practical experience with Docker
      const ans1Result = await service.submitAnswer(
        initResult.sessionId,
        testUserId,
        q1.id,
        {
          selectedOptionId: 'experienced',
          yearsOfExperience: 3.0,
          details: 'Built production multi-stage Docker containers and CI/CD pipelines.'
        }
      );

      // Step D: Verify profile update with USER_CONFIRMED provenance
      const updatedProfile = await MockProfileModel.findOne({ userId: testUserId });
      const dockerSkill = updatedProfile.skills.find(s => s.name === 'Docker');
      expect(dockerSkill).toBeDefined();
      expect(dockerSkill.yearsOfExperience).toBe(3.0);
      expect(dockerSkill.provenance.source).toBe(ProvenanceSource.USER_CONFIRMED);
      expect(dockerSkill.provenance.status).toBe(ProfileVerificationStatus.VERIFIED);

      // Step E: Verify requirement analysis is updated & Question 2 (PyTorch) is now served
      expect(ans1Result.workflowState).toBe(WorkflowState.AWAITING_USER_RESPONSE);
      expect(ans1Result.nextQuestion.targetKey).toBe('PyTorch');
      expect(ans1Result.nextQuestion.category).toBe('HIGH_VALUE');

      // Step F: User confirms PyTorch experience
      const ans2Result = await service.submitAnswer(
        initResult.sessionId,
        testUserId,
        ans1Result.nextQuestion.id,
        {
          selectedOptionId: 'experienced',
          yearsOfExperience: 2.0,
          details: 'Fine-tuned LLMs and vision transformers.'
        }
      );

      // Step G: Final state ready for resume generation with all facts available
      expect(ans2Result.workflowState).toBe(WorkflowState.READY_FOR_RESUME_GENERATION);
      expect(ans2Result.readyForResumeGeneration).toBe(true);
      expect(ans2Result.nextQuestion).toBeNull();
      expect(ans2Result.matchReport.requirementCoverageEstimate).toBe(100.0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. ONE QUESTION AT A TIME & ORDERING
  // ─────────────────────────────────────────────────────────────
  describe('2. One Question At A Time Serving', () => {
    it('serves questions strictly one by one in priority sequence', async () => {
      const initResult = await service.initializeSession({
        userId: testUserId,
        jobTitle: 'ML Engineer',
        jobDescription: 'Docker and PyTorch required'
      });

      // Fetch active question via getCurrentQuestion
      const activeState = await service.getCurrentQuestion(initResult.sessionId, testUserId);
      expect(activeState.currentQuestionIndex).toBe(0);
      expect(activeState.currentQuestion.targetKey).toBe('Docker');

      // Answer question 0
      await service.submitAnswer(
        initResult.sessionId,
        testUserId,
        activeState.currentQuestion.id,
        { selectedOptionId: 'experienced', yearsOfExperience: 2 }
      );

      // Verify next question is index 1
      const nextState = await service.getCurrentQuestion(initResult.sessionId, testUserId);
      expect(nextState.currentQuestionIndex).toBe(1);
      expect(nextState.currentQuestion.targetKey).toBe('PyTorch');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. APPLICATION-SPECIFIC SEPARATION
  // ─────────────────────────────────────────────────────────────
  describe('3. Strict Separation of Application-Specific Answers', () => {
    it('stores screening questions and salary/sponsorship in applicationAnswers without mutating global profile', async () => {
      const initResult = await service.initializeSession({
        userId: testUserId,
        jobTitle: 'Backend Dev',
        jobDescription: 'Python dev'
      });

      const session = await MockSessionModel.findOne({ sessionId: initResult.sessionId, userId: testUserId });
      // Inject an application-specific question
      session.questions.push({
        id: 'gap_salary',
        requirementId: 'req_salary',
        category: 'REQUIRED',
        targetEntity: 'APPLICATION_ANSWER',
        targetKey: 'salary_expectation',
        questionText: 'What is your desired annual compensation for this role?',
        status: 'PENDING'
      });
      await session.save();

      await service.submitAnswer(
        initResult.sessionId,
        testUserId,
        'gap_salary',
        { selectedOptionId: 'custom', details: '$165,000 USD' }
      );

      const updatedSession = await MockSessionModel.findOne({ sessionId: initResult.sessionId, userId: testUserId });
      expect(updatedSession.applicationAnswers['salary_expectation']).toBe('$165,000 USD');

      // Verify global profile does NOT contain salary
      const profile = await MockProfileModel.findOne({ userId: testUserId });
      expect(profile.skills.some(s => s.name === 'salary_expectation')).toBe(false);
      expect(profile.salary_expectation).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. BASIC FAMILIARITY RULE
  // ─────────────────────────────────────────────────────────────
  describe('4. Basic Familiarity Rule', () => {
    it('does not add full verified skill to profile when user only has basic familiarity', async () => {
      const initResult = await service.initializeSession({
        userId: testUserId,
        jobTitle: 'ML Engineer',
        jobDescription: 'PyTorch preferred'
      });

      const session = await MockSessionModel.findOne({ sessionId: initResult.sessionId, userId: testUserId });
      const pytorchQ = session.questions.find(q => q.targetKey === 'PyTorch');

      await service.submitAnswer(
        initResult.sessionId,
        testUserId,
        pytorchQ.id,
        { selectedOptionId: 'familiar' }
      );

      const profile = await MockProfileModel.findOne({ userId: testUserId });
      // Invariant: Skill must NOT be in verified skills list
      expect(profile.skills.some(s => s.name === 'PyTorch')).toBe(false);

      // Note saved in application session for context
      const updatedSession = await MockSessionModel.findOne({ sessionId: initResult.sessionId, userId: testUserId });
      expect(updatedSession.applicationAnswers['familiarity_PyTorch']).toContain('familiarity');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. MANDATORY BLOCKER HANDLING
  // ─────────────────────────────────────────────────────────────
  describe('5. Mandatory Blocker Handling', () => {
    it('transitions workflow to BLOCKED_BY_REQUIRED_INFO when user declines a REQUIRED requirement', async () => {
      const initResult = await service.initializeSession({
        userId: testUserId,
        jobTitle: 'Cloud Architect',
        jobDescription: 'Docker required'
      });

      const session = await MockSessionModel.findOne({ sessionId: initResult.sessionId, userId: testUserId });
      const dockerQ = session.questions.find(q => q.targetKey === 'Docker');

      const declineResult = await service.submitAnswer(
        initResult.sessionId,
        testUserId,
        dockerQ.id,
        { selectedOptionId: 'none' }
      );

      expect(declineResult.workflowState).toBe(WorkflowState.BLOCKED_BY_REQUIRED_INFO);
      expect(declineResult.blockedReason).toContain('Mandatory qualification "Docker" was declined');

      const updatedSession = await MockSessionModel.findOne({ sessionId: initResult.sessionId, userId: testUserId });
      expect(updatedSession.readyForResumeGeneration).toBe(false);
      expect(updatedSession.declinedQuestionIds).toContain('Docker');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. SKIPPING QUESTIONS & VALIDATION
  // ─────────────────────────────────────────────────────────────
  describe('6. Skipping Behavior', () => {
    it('allows skipping high-value questions but blocks skipping REQUIRED questions', async () => {
      const initResult = await service.initializeSession({
        userId: testUserId,
        jobTitle: 'DevOps Engineer',
        jobDescription: 'Docker required, PyTorch preferred'
      });

      const session = await MockSessionModel.findOne({ sessionId: initResult.sessionId, userId: testUserId });
      const dockerQ = session.questions.find(q => q.category === 'REQUIRED');
      const pytorchQ = session.questions.find(q => q.category === 'HIGH_VALUE');

      // Attempting to skip REQUIRED question should trigger blocker
      const skipRequiredResult = await service.skipQuestion(initResult.sessionId, testUserId, dockerQ.id);
      expect(skipRequiredResult.workflowState).toBe(WorkflowState.BLOCKED_BY_REQUIRED_INFO);
      expect(skipRequiredResult.status).toBe('BLOCKED');

      // Reset dockerQ to answered to test skipping HIGH_VALUE
      dockerQ.status = 'ANSWERED';
      session.workflowState = WorkflowState.AWAITING_USER_RESPONSE;
      await session.save();

      const skipHighValueResult = await service.skipQuestion(initResult.sessionId, testUserId, pytorchQ.id);
      expect(skipHighValueResult.readyForResumeGeneration).toBe(true);
      expect(skipHighValueResult.workflowState).toBe(WorkflowState.READY_FOR_RESUME_GENERATION);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 7. PERSISTENCE & HISTORY LOGGING
  // ─────────────────────────────────────────────────────────────
  describe('7. State Persistence & Audit Trail', () => {
    it('survives simulated reload and records comprehensive transition history', async () => {
      const initResult = await service.initializeSession({
        userId: testUserId,
        jobTitle: 'Backend Engineer',
        jobDescription: 'Docker'
      });

      // Simulate browser reload / tab close by querying session directly from store
      const recoveredSession = await MockSessionModel.findOne({
        sessionId: initResult.sessionId,
        userId: testUserId
      });
      expect(recoveredSession).toBeDefined();
      expect(recoveredSession.stateHistory.length).toBeGreaterThanOrEqual(2);
      expect(recoveredSession.stateHistory[0].state).toBe(WorkflowState.ANALYZING);
    });
  });
});
