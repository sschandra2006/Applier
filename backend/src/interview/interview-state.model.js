import mongoose from 'mongoose';

const interviewStateSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  workflowId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workflow', required: true },
  applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Application' }, // Optional until submitted
  
  answers: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  
  completedFields: [{ type: String }],
  pendingFields: [{ type: String }],
  optionalFields: [{ type: String }],
  
  currentStep: { type: Number, default: 1 },
  currentField: { type: String, default: null }, // Active field name (string) for AI context
  blockedFields: [{ type: String }],
  clarificationRequired: { type: Boolean, default: false },
  
  confidenceScores: { type: Map, of: Number, default: {} },
  validationErrors: { type: Map, of: String, default: {} },
  
  lastQuestionId: { type: String },
  status: { type: String, enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'PAUSED'], default: 'NOT_STARTED' }
}, { timestamps: true, versionKey: false });

export const InterviewState = mongoose.model('InterviewState', interviewStateSchema);
