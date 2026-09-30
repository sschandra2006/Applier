import mongoose from 'mongoose';

const automationJobSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  interviewStateId: { type: mongoose.Schema.Types.ObjectId, ref: 'InterviewState', required: true },
  workflowId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workflow', required: true },
  
  status: { 
    type: String, 
    enum: ['QUEUED', 'RUNNING', 'PAUSED_OTP', 'PAUSED_CAPTCHA', 'COMPLETED', 'FAILED'], 
    default: 'QUEUED' 
  },
  
  progress: {
    currentStep: { type: Number, default: 0 },
    totalSteps: { type: Number, default: 0 }
  },

  currentStepIndex: { type: Number, default: 0 },
  executionPlan: { type: Array, default: [] },
  
  logs: [{
    timestamp: { type: Date, default: Date.now },
    level: { type: String, enum: ['INFO', 'WARNING', 'ERROR'], default: 'INFO' },
    message: String,
    additionalData: { type: mongoose.Schema.Types.Mixed, default: {} }
  }],

  // Stored when job is paused for OTP or CAPTCHA
  pauseContext: {
    fieldName: { type: String },          // e.g. 'captcha', 'otp'
    pauseReason: { type: String },        // 'OTP' | 'CAPTCHA' | 'MANUAL_REVIEW'
    captchaImageBase64: { type: String }, // Base64 screenshot of the captcha element
    stepIndex: { type: Number },          // Which step index we paused at
    resumeFromIndex: { type: Number }     // Which step index to resume from
  },
  
  errorDetails: String
}, { timestamps: true });

automationJobSchema.index({ userId: 1 });
automationJobSchema.index({ status: 1 });

export const AutomationJob = mongoose.model('AutomationJob', automationJobSchema);
