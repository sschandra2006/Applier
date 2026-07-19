import mongoose from 'mongoose';

const applicationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  workflowId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workflow', required: true },
  interviewStateId: { type: mongoose.Schema.Types.ObjectId, ref: 'InterviewState', required: true },
  
  status: { 
    type: String, 
    enum: ['SUBMITTED', 'REJECTED', 'APPROVED', 'IN_REVIEW'], 
    default: 'SUBMITTED' 
  },
  
  applicationNumber: { type: String },
  receiptUrl: { type: String },
  
  submittedAt: { type: Date, default: Date.now },
  completedAt: { type: Date }
}, { timestamps: true });

applicationSchema.index({ userId: 1 });

export const Application = mongoose.model('Application', applicationSchema);
