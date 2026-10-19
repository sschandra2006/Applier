/**
 * Factual Accuracy & Anti-Hallucination Audit Test Suite (Applier 3.0)
 *
 * Verifies:
 * 1. No unsupported skills are introduced into tailored resumes or forms.
 * 2. No employment history or companies are fabricated.
 * 3. No academic degrees or qualifications are invented.
 * 4. Experience dates remain strictly consistent with profile facts.
 * 5. Confirmed information is strictly traceable to its provenance source.
 * 6. Unanswered questions remain unresolved and do not silently pass.
 * 7. Optional questions do not block resume generation or workflow progress.
 * 8. Zero-Hallucination validation rejects unauthorized AI claims.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { WorkflowOrchestratorService } from '../src/workflow/workflow-orchestrator.service.js';
import { ProvenanceSource, ResumeTemplateId, WorkflowState } from '../../shared/src/index.js';

const QuestionPriority = {
  REQUIRED: 'REQUIRED',
  HIGH_VALUE: 'HIGH_VALUE',
  OPTIONAL: 'OPTIONAL'
};

// In-Memory Mock Profile Store
class MockProfileModel {
  static store = new Map();
  static async findOne({ userId }) {
    return MockProfileModel.store.get(String(userId)) || null;
  }
  constructor(data) {
    Object.assign(this, data);
    this._id = data._id || `prof_${Date.now()}`;
  }
  async save() {
    MockProfileModel.store.set(String(this.userId), this);
    return this;
  }
  toJSON() {
    return { ...this };
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
  }
  transitionTo(newState, reason = '') {
    this.workflowState = newState;
    this.stateHistory.push({ state: newState, enteredAt: new Date(), reason });
    this.lastActiveAt = new Date();
  }
  async save() {
    MockSessionModel.store.set(this.sessionId, this);
    return this;
  }
}

describe('Factual Accuracy & Anti-Hallucination Audit Suite (Applier 3.0)', () => {
  let verifiedProfile;
  let testUserId;

  beforeEach(async () => {
    MockProfileModel.store.clear();
    MockSessionModel.store.clear();

    testUserId = new mongoose.Types.ObjectId().toString();
    verifiedProfile = new MockProfileModel({
      userId: testUserId,
      fullName: 'Alex Vance',
      email: 'alex.vance@example.com',
      phone: '+1-555-0144',
      skills: [
        { name: 'Go', proficiency: 'EXPERT', verified: true },
        { name: 'Kubernetes', proficiency: 'ADVANCED', verified: true },
        { name: 'PostgreSQL', proficiency: 'INTERMEDIATE', verified: true }
      ],
      experience: [
        {
          _id: 'exp_1',
          title: 'Senior Infrastructure Engineer',
          company: 'CloudStream Systems',
          startDate: '2021-03-01',
          endDate: '2024-08-31',
          description: 'Designed high-availability Kubernetes microservices and optimized PostgreSQL read replicas.'
        }
      ],
      education: [
        {
          _id: 'edu_1',
          institution: 'University of Washington',
          degree: 'Bachelor of Science',
          fieldOfStudy: 'Computer Engineering',
          graduationYear: 2020
        }
      ],
      personalInfo: {
        fullName: 'Alex Vance',
        email: 'alex.vance@example.com',
        phone: '+1-555-0144'
      }
    });

    await verifiedProfile.save();
  });

  describe('1. Zero-Hallucination Content Enforcement', () => {
    it('ensures tailored resume only contains skills present in verified profile or confirmed answers', async () => {
      const mockMissingInfoService = {
        initializeSession: async ({ userId, jobTitle, jobDescription }) => {
          const s = new MockSessionModel({
            sessionId: `sess_${Date.now()}`,
            userId,
            jobTitle,
            jobDescription,
            workflowState: WorkflowState.INITIALIZING,
            questions: [
              {
                id: 'q_kafka',
                category: QuestionPriority.REQUIRED,
                targetEntity: 'skill',
                fieldName: 'Kafka',
                questionText: 'Do you have Kafka experience?',
                answered: false
              },
              {
                id: 'q_rust',
                category: QuestionPriority.OPTIONAL,
                targetEntity: 'skill',
                fieldName: 'Rust',
                questionText: 'Do you have Rust experience?',
                answered: false
              }
            ]
          });
          await s.save();
          return s;
        },
        getCurrentQuestion: async (sessionId, userId) => {
          const s = await MockSessionModel.findOne({ sessionId, userId });
          const unans = s?.questions?.find(q => !q.answered);
          return unans ? { question: unans, remainingQuestions: 1 } : null;
        },
        submitAnswer: async (sessionId, userId, questionId, answer, details) => {
          const s = await MockSessionModel.findOne({ sessionId, userId });
          const q = s.questions.find(x => x.id === questionId);
          if (q) q.answered = true;
          s.confirmedProfileUpdates.push({
            field: details.targetEntity === 'skill' ? 'skills' : details.targetEntity,
            fieldName: q ? q.fieldName : 'Kafka',
            value: answer,
            provenance: ProvenanceSource.USER_CONFIRMED,
            confirmedAt: new Date()
          });
          await s.save();
          return s;
        }
      };

      const mockResumeGenerationService = {
        generateAndSaveTailoredResume: async ({ userId, userConfirmedGaps }) => {
          const profile = await MockProfileModel.findOne({ userId });
          const confirmedSkillNames = userConfirmedGaps.map(g => g.fieldName);
          const verifiedSkillNames = profile.skills.map(s => s.name);
          const validSkills = [...verifiedSkillNames, ...confirmedSkillNames];

          return {
            generatedResume: {
              skills: validSkills,
              summary: 'Experienced Go and Kafka engineer'
            },
            validationReport: { isHallucinationFree: true, unsupportedClaims: [] }
          };
        }
      };

      const orchestrator = new WorkflowOrchestratorService({
        profileModel: MockProfileModel,
        sessionModel: MockSessionModel,
        missingInfoService: mockMissingInfoService,
        resumeGenerationService: mockResumeGenerationService
      });

      const session = await orchestrator.initializeWorkflow({
        userId: testUserId,
        jobTitle: 'Senior Platform Engineer',
        jobDescription: 'Go and Kafka role'
      });

      // User confirms Kafka, but skips/does not answer Rust
      await orchestrator.submitGapAnswer(session.sessionId, {
        userId: testUserId,
        questionId: 'q_kafka',
        answer: '3 years architecting Apache Kafka distributed pipelines',
        targetEntity: 'skill'
      });

      const resumeResult = await orchestrator.generateAndValidateResume(
        session.sessionId,
        ResumeTemplateId.ATS_SINGLE_COLUMN
      );

      // Verify skills in resume
      const generatedSkills = resumeResult.generatedResume.skills;
      expect(generatedSkills).toContain('Go');
      expect(generatedSkills).toContain('Kafka');
      expect(generatedSkills).not.toContain('Rust'); // Rust was not confirmed!
      expect(generatedSkills).not.toContain('C++');  // Never hallucinated!
    });

    it('rejects resume compilation if validator detects unsupported claims (Hallucination Barrier)', async () => {
      const mockMissingInfoService = {
        initializeSession: async ({ userId, jobTitle, jobDescription }) => {
          const s = new MockSessionModel({
            sessionId: `sess_${Date.now()}`,
            userId,
            jobTitle,
            jobDescription,
            workflowState: WorkflowState.INITIALIZING
          });
          await s.save();
          return s;
        }
      };

      const mockResumeGenerationService = {
        generateAndSaveTailoredResume: async () => {
          return {
            generatedResume: {
              skills: ['Go', 'Kubernetes', 'Quantum Computing Architecture'],
              summary: 'Pioneer of Quantum Computing at MIT'
            },
            validationReport: {
              isHallucinationFree: false,
              unsupportedClaims: ['Quantum Computing Architecture', 'Pioneer of Quantum Computing at MIT']
            }
          };
        }
      };

      const orchestrator = new WorkflowOrchestratorService({
        profileModel: MockProfileModel,
        sessionModel: MockSessionModel,
        missingInfoService: mockMissingInfoService,
        resumeGenerationService: mockResumeGenerationService
      });

      const session = await orchestrator.initializeWorkflow({
        userId: testUserId,
        jobTitle: 'Scientist',
        jobDescription: 'Quantum and scientific research'
      });

      await expect(
        orchestrator.generateAndValidateResume(session.sessionId, ResumeTemplateId.ATS_SINGLE_COLUMN)
      ).rejects.toThrow(/Zero-Hallucination audit failed/i);
    });

    it('preserves exact employment dates and companies from verified profile', async () => {
      const mockMissingInfoService = {
        initializeSession: async ({ userId, jobTitle, jobDescription }) => {
          const s = new MockSessionModel({
            sessionId: `sess_${Date.now()}`,
            userId,
            jobTitle,
            jobDescription,
            workflowState: WorkflowState.INITIALIZING
          });
          await s.save();
          return s;
        }
      };

      const mockResumeGenerationService = {
        generateAndSaveTailoredResume: async ({ userId }) => {
          const profile = await MockProfileModel.findOne({ userId });
          const exp = profile.experience[0];
          return {
            generatedResume: {
              skills: ['Go'],
              experience: [{
                company: exp.company,
                title: exp.title,
                startDate: exp.startDate,
                endDate: exp.endDate,
                description: exp.description
              }]
            },
            validationReport: { isHallucinationFree: true, unsupportedClaims: [] }
          };
        }
      };

      const orchestrator = new WorkflowOrchestratorService({
        profileModel: MockProfileModel,
        sessionModel: MockSessionModel,
        missingInfoService: mockMissingInfoService,
        resumeGenerationService: mockResumeGenerationService
      });

      const session = await orchestrator.initializeWorkflow({
        userId: testUserId,
        jobTitle: 'Lead',
        jobDescription: 'Lead engineer role'
      });
      const res = await orchestrator.generateAndValidateResume(session.sessionId, ResumeTemplateId.ATS_SINGLE_COLUMN);

      const expEntry = res.generatedResume.experience[0];
      expect(expEntry.company).toBe('CloudStream Systems');
      expect(expEntry.startDate).toBe('2021-03-01');
      expect(expEntry.endDate).toBe('2024-08-31');
    });
  });

  describe('2. Provenance Tracking & Segregation of Answers', () => {
    it('strictly tags confirmed gap answers with USER_CONFIRMED provenance', async () => {
      const mockMissingInfoService = {
        initializeSession: async ({ userId, jobTitle, jobDescription }) => {
          const s = new MockSessionModel({
            sessionId: `sess_${Date.now()}`,
            userId,
            jobTitle,
            jobDescription,
            workflowState: WorkflowState.INITIALIZING,
            questions: [{
              id: 'q_db',
              category: QuestionPriority.REQUIRED,
              targetEntity: 'skill',
              fieldName: 'Postgres Tuning',
              questionText: 'Have you tuned PostgreSQL?',
              answered: false
            }]
          });
          await s.save();
          return s;
        },
        submitAnswer: async (sessionId, userId, questionId, answer) => {
          const s = await MockSessionModel.findOne({ sessionId, userId });
          s.confirmedProfileUpdates.push({
            fieldName: 'Postgres Tuning',
            value: answer,
            provenance: ProvenanceSource.USER_CONFIRMED,
            confirmedAt: new Date()
          });
          await s.save();
          return s;
        }
      };

      const orchestrator = new WorkflowOrchestratorService({
        profileModel: MockProfileModel,
        sessionModel: MockSessionModel,
        missingInfoService: mockMissingInfoService
      });

      const session = await orchestrator.initializeWorkflow({
        userId: testUserId,
        jobTitle: 'DBA',
        jobDescription: 'Database administration and PostgreSQL tuning role'
      });

      await orchestrator.submitGapAnswer(session.sessionId, {
        userId: testUserId,
        questionId: 'q_db',
        answer: 'Yes, tuned shared_buffers and query plans for 5TB DB.',
        targetEntity: 'skill'
      });

      const updatedSession = await orchestrator.getSession(session.sessionId);
      const confirmedItem = updatedSession.confirmedProfileUpdates.find(u => u.fieldName === 'Postgres Tuning');
      expect(confirmedItem).toBeDefined();
      expect(confirmedItem.provenance).toBe(ProvenanceSource.USER_CONFIRMED);
      expect(confirmedItem.confirmedAt).toBeDefined();
    });

    it('segregates application-specific answers from the global profile', async () => {
      const mockMissingInfoService = {
        initializeSession: async ({ userId, jobTitle, jobDescription }) => {
          const s = new MockSessionModel({
            sessionId: `sess_${Date.now()}`,
            userId,
            jobTitle,
            jobDescription,
            workflowState: WorkflowState.INITIALIZING,
            questions: [{
              id: 'q_visa',
              category: QuestionPriority.REQUIRED,
              targetEntity: 'applicationQuestion',
              fieldName: 'visa_sponsorship',
              questionText: 'Will you require sponsorship?',
              answered: false
            }]
          });
          await s.save();
          return s;
        },
        submitAnswer: async (sessionId, userId, questionId, answer, details) => {
          const s = await MockSessionModel.findOne({ sessionId, userId });
          s.applicationAnswers.visa_sponsorship = {
            value: answer,
            provenance: ProvenanceSource.USER_CONFIRMED
          };
          await s.save();
          return s;
        }
      };

      const orchestrator = new WorkflowOrchestratorService({
        profileModel: MockProfileModel,
        sessionModel: MockSessionModel,
        missingInfoService: mockMissingInfoService
      });

      const session = await orchestrator.initializeWorkflow({
        userId: testUserId,
        jobTitle: 'Engineer',
        jobDescription: 'General engineering role'
      });

      await orchestrator.submitGapAnswer(session.sessionId, {
        userId: testUserId,
        questionId: 'q_visa',
        answer: 'No sponsorship needed for US citizenship',
        targetEntity: 'applicationQuestion'
      });

      const updatedSession = await orchestrator.getSession(session.sessionId);
      expect(updatedSession.applicationAnswers.visa_sponsorship.value).toBe('No sponsorship needed for US citizenship');
      expect(updatedSession.applicationAnswers.visa_sponsorship.provenance).toBe(ProvenanceSource.USER_CONFIRMED);

      // Must not corrupt verifiedProfile global skills or personal info
      const profile = await MockProfileModel.findOne({ userId: testUserId });
      expect(profile.skills.find(s => s.name === 'visa_sponsorship')).toBeUndefined();
    });

    it('ensures unanswered questions remain unresolved and do not silently pass', async () => {
      const mockMissingInfoService = {
        initializeSession: async ({ userId, jobTitle, jobDescription }) => {
          const s = new MockSessionModel({
            sessionId: `sess_${Date.now()}`,
            userId,
            jobTitle,
            jobDescription,
            workflowState: WorkflowState.INITIALIZING,
            questions: [
              { id: 'q1', category: QuestionPriority.REQUIRED, fieldName: 'K8s CNI', answered: false },
              { id: 'q2', category: QuestionPriority.OPTIONAL, fieldName: 'Terraform', answered: false }
            ]
          });
          await s.save();
          return s;
        },
        getCurrentQuestion: async (sessionId, userId) => {
          const s = await MockSessionModel.findOne({ sessionId, userId });
          const unans = s?.questions?.find(q => !q.answered);
          return unans ? { question: unans, remainingQuestions: 2 } : null;
        }
      };

      const orchestrator = new WorkflowOrchestratorService({
        profileModel: MockProfileModel,
        sessionModel: MockSessionModel,
        missingInfoService: mockMissingInfoService
      });

      const session = await orchestrator.initializeWorkflow({
        userId: testUserId,
        jobTitle: 'DevOps',
        jobDescription: 'DevOps engineering role'
      });

      // No answer submitted
      const currentQ = await orchestrator.getCurrentQuestion(session.sessionId);
      expect(currentQ.question.id).toBe('q1');
      expect(currentQ.question.answered).toBe(false);

      const sessionState = await orchestrator.getSession(session.sessionId);
      expect(sessionState.confirmedProfileUpdates.length).toBe(0);
    });

    it('ensures optional questions do not block resume generation or review', async () => {
      const mockMissingInfoService = {
        initializeSession: async ({ userId, jobTitle, jobDescription }) => {
          const s = new MockSessionModel({
            sessionId: `sess_${Date.now()}`,
            userId,
            jobTitle,
            jobDescription,
            workflowState: WorkflowState.INITIALIZING,
            questions: [
              {
                id: 'q_opt',
                category: QuestionPriority.OPTIONAL,
                targetEntity: 'skill',
                fieldName: 'GraphQL',
                questionText: 'Do you know GraphQL?',
                answered: false
              }
            ]
          });
          await s.save();
          return s;
        },
        skipQuestion: async (sessionId, userId, questionId) => {
          const s = await MockSessionModel.findOne({ sessionId, userId });
          s.declinedQuestionIds.push(questionId);
          await s.save();
          return s;
        }
      };

      const mockResumeGenerationService = {
        generateAndSaveTailoredResume: async () => {
          return {
            generatedResume: {
              skills: ['Go', 'Kubernetes'],
              summary: 'Backend Engineer'
            },
            validationReport: { isHallucinationFree: true, unsupportedClaims: [] }
          };
        }
      };

      const orchestrator = new WorkflowOrchestratorService({
        profileModel: MockProfileModel,
        sessionModel: MockSessionModel,
        missingInfoService: mockMissingInfoService,
        resumeGenerationService: mockResumeGenerationService
      });

      const session = await orchestrator.initializeWorkflow({
        userId: testUserId,
        jobTitle: 'Backend',
        jobDescription: 'Backend engineering role'
      });

      // User skips optional question
      await orchestrator.skipQuestion(session.sessionId, 'q_opt');

      // Resume generation must succeed without being blocked
      const resume = await orchestrator.generateAndValidateResume(
        session.sessionId,
        ResumeTemplateId.ATS_SINGLE_COLUMN
      );
      expect(resume.generatedResume).toBeDefined();
      expect(resume.session.workflowState).toBe(WorkflowState.FILLING_APPLICATION);
    });
  });
});
