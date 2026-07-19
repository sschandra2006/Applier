import mongoose from 'mongoose';

const aiLearningSchema = new mongoose.Schema({
  workflowId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workflow' },
  errorType: { type: String, required: true },
  message: { type: String, required: true },
  stackTrace: { type: String },
  domSnapshot: { type: String },
  suggestedFix: { type: String },
  alternativeSelectors: [{ type: String }],
  confidence: { type: Number },
  status: { type: String, enum: ['PENDING_REVIEW', 'APPLIED', 'REJECTED'], default: 'PENDING_REVIEW' }
}, { timestamps: true });

export const AILearning = mongoose.model('AILearning', aiLearningSchema);
