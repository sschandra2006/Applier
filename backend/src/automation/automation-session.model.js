import mongoose from 'mongoose';

const automationSessionSchema = new mongoose.Schema({
  applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true },
  status: { type: String, enum: ['QUEUED', 'RUNNING', 'SUCCESS', 'FAILED'], default: 'QUEUED' },
  logs: [{
    timestamp: Date,
    level: String,
    message: String
  }],
  errorScreenshotUrl: { type: String }
}, { timestamps: true });

export const AutomationSession = mongoose.model('AutomationSession', automationSessionSchema);
