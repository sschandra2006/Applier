/**
 * Missing-Information Session Mongoose Model
 * Tracks job-specific information gaps, multi-tier question queues,
 * state machine transitions, and strict partitioning between permanent
 * profile updates and application-specific responses.
 */

import mongoose from 'mongoose';
import { WorkflowState } from '../../../shared/src/index.js';

export { WorkflowState };

const questionOptionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  label: { type: String, required: true },
  requiresDetails: { type: Boolean, default: false },
  detailPrompt: { type: String, default: null }
}, { _id: false });

const gapQuestionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  requirementId: { type: String, required: true },
  category: {
    type: String,
    enum: ['REQUIRED', 'HIGH_VALUE', 'OPTIONAL'],
    required: true
  },
  targetEntity: {
    type: String,
    enum: ['PROFILE_SKILL', 'PROFILE_PROJECT', 'PROFILE_EXPERIENCE', 'APPLICATION_ANSWER', 'DECLINED'],
    required: true
  },
  targetKey: { type: String, required: true },
  questionText: { type: String, required: true },
  contextExplanation: { type: String, default: '' },
  options: [questionOptionSchema],
  status: {
    type: String,
    enum: ['PENDING', 'ANSWERED', 'SKIPPED', 'DECLINED'],
    default: 'PENDING'
  },
  userResponse: { type: mongoose.Schema.Types.Mixed, default: null },
  answeredAt: { type: Date, default: null }
}, { _id: false });

const stateTransitionSchema = new mongoose.Schema({
  state: {
    type: String,
    enum: Object.values(WorkflowState),
    required: true
  },
  enteredAt: { type: Date, default: Date.now },
  reason: { type: String, default: '' }
}, { _id: false });

const missingInfoSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    jobTitle: {
      type: String,
      required: true,
      trim: true
    },
    companyName: {
      type: String,
      trim: true,
      default: ''
    },
    jobDescription: {
      type: String,
      required: true
    },
    applicationQuestions: [{ type: String }],
    workflowState: {
      type: String,
      enum: Object.values(WorkflowState),
      default: WorkflowState.ANALYZING,
      index: true
    },
    stateHistory: [stateTransitionSchema],
    matchReport: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    questions: [gapQuestionSchema],
    currentQuestionIndex: {
      type: Number,
      default: 0
    },
    // Application-specific answers: strictly partitioned, never mutates global profile
    applicationAnswers: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({})
    },
    // Audit log of updates applied to the canonical ProfessionalProfile
    confirmedProfileUpdates: [
      {
        field: { type: String, required: true },
        value: { type: mongoose.Schema.Types.Mixed, required: true },
        targetEntity: { type: String, required: true },
        appliedAt: { type: Date, default: Date.now }
      }
    ],
    declinedQuestionIds: [{ type: String }],
    readyForResumeGeneration: {
      type: Boolean,
      default: false
    },
    blockedReason: {
      type: String,
      default: null
    },
    // End-to-End Workflow Orchestration Fields
    jobUrl: {
      type: String,
      default: ''
    },
    atsType: {
      type: String,
      default: 'GENERIC'
    },
    profileSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    generatedResume: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    detectedFields: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    fieldMappings: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    fillResults: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    formValidation: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    attachmentStatus: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    userConfirmedSubmission: {
      type: Boolean,
      default: false
    },
    confirmedAt: {
      type: Date,
      default: null
    },
    idempotencyKey: {
      type: String,
      default: null,
      index: true
    },
    submissionResult: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    failureDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    lastActiveAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

missingInfoSessionSchema.index({ userId: 1, workflowState: 1 });
missingInfoSessionSchema.index({ sessionId: 1, userId: 1 });

/**
 * Transitions workflow state and records history.
 */
missingInfoSessionSchema.methods.transitionTo = function(newState, reason = '') {
  this.workflowState = newState;
  this.stateHistory.push({
    state: newState,
    enteredAt: new Date(),
    reason
  });
  this.lastActiveAt = new Date();
};

export const MissingInfoSession = mongoose.model('MissingInfoSession', missingInfoSessionSchema);
export default MissingInfoSession;
