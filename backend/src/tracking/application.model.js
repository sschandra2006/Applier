import mongoose from 'mongoose';

const applicationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    workflowId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workflow', required: true },
    interviewStateId: { type: mongoose.Schema.Types.ObjectId, ref: 'InterviewState', required: true },

    status: {
      type: String,
      enum: [
        'DRAFT',
        'READY',
        'SUBMITTING',
        'SUBMITTED',
        'SUBMISSION_UNCERTAIN',
        'SUBMISSION_FAILED',
        'REJECTED',
        'APPROVED',
        'IN_REVIEW'
      ],
      default: 'SUBMITTED'
    },

    // Phase 17 Verified Submission & Receipt Capture Fields
    submissionStatus: {
      type: String,
      enum: [
        'SUBMITTED',
        'SUBMISSION_FAILED',
        'SUBMISSION_UNCERTAIN',
        'SUBMISSION_TIMEOUT',
        'SUBMISSION_DUPLICATE_BLOCKED'
      ]
    },
    applicationNumber: { type: String },
    referenceNumber: { type: String },
    confirmationUrl: { type: String },
    receiptUrl: { type: String },
    receipt: { type: mongoose.Schema.Types.Mixed, default: null },
    receiptScreenshot: { type: String, default: null },
    finalPageEvidence: { type: mongoose.Schema.Types.Mixed, default: null },

    submittedAt: { type: Date, default: Date.now },
    completedAt: { type: Date }
  },
  { timestamps: true }
);

applicationSchema.index({ userId: 1 });
applicationSchema.index({ applicationNumber: 1 });
applicationSchema.index({ referenceNumber: 1 });
applicationSchema.index({ status: 1 });

export const Application = mongoose.model('Application', applicationSchema);
export default Application;
