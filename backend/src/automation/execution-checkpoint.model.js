import mongoose from 'mongoose';
import { validateExecutionCheckpoint } from '../../../shared/src/index.js';
import { assertNoSecretsPersisted } from '../../../browser-worker/execution/secret-sanitizer.js';

const executionCheckpointSchema = new mongoose.Schema(
  {
    schemaVersion: { type: String, default: '2.0.0' },
    checkpointId: { type: String, required: true, unique: true, index: true },
    applicationId: { type: String, index: true },
    jobId: { type: String, required: true, index: true },
    page: { type: mongoose.Schema.Types.Mixed, default: {} },
    url: { type: String, required: true },
    pageUrl: { type: String },
    semanticPage: { type: mongoose.Schema.Types.Mixed, default: null },
    currentField: { type: String, default: null },
    completedFields: [{ type: String }],
    executionStep: { type: Number, default: 0 },
    stepIndex: { type: Number, default: 0 },
    browserStateMetadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    pendingCheckpoint: { type: mongoose.Schema.Types.Mixed, default: null },
    lastVerifiedAction: { type: mongoose.Schema.Types.Mixed, default: null },
    sanitizedAnswers: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: [
        'QUEUED',
        'RUNNING',
        'PAUSED_OTP',
        'PAUSED_CAPTCHA',
        'PAUSED_PAYMENT',
        'COMPLETED',
        'FAILED',
        'CANCELLED'
      ],
      default: 'RUNNING'
    }
  },
  { timestamps: true }
);

executionCheckpointSchema.index({ jobId: 1, createdAt: -1 });
executionCheckpointSchema.index({ applicationId: 1, createdAt: -1 });

/**
 * Finds the latest durable checkpoint for a given jobId
 */
executionCheckpointSchema.statics.findLatestForJob = async function (jobId) {
  if (!jobId) return null;
  return this.findOne({ jobId }).sort({ createdAt: -1, executionStep: -1 }).exec();
};

/**
 * Finds the latest durable checkpoint for a given applicationId
 */
executionCheckpointSchema.statics.findLatestForApplication = async function (applicationId) {
  if (!applicationId) return null;
  return this.findOne({ applicationId }).sort({ createdAt: -1, executionStep: -1 }).exec();
};

/**
 * Pre-save middleware to enforce canonical schema validation and secret hygiene
 */
executionCheckpointSchema.pre('save', function (next) {
  try {
    const rawObj = this.toObject();
    assertNoSecretsPersisted(rawObj);
    next();
  } catch (err) {
    next(err);
  }
});

export const ExecutionCheckpoint = mongoose.model('ExecutionCheckpoint', executionCheckpointSchema);
export default ExecutionCheckpoint;
