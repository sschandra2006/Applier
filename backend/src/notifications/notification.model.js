import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['INFO', 'WARNING', 'SUCCESS', 'ERROR', 'ACTION_REQUIRED'], 
    default: 'INFO' 
  },
  
  read: { type: Boolean, default: false },
  
  // Optional metadata for deep linking (e.g. jobId to open the OTP modal)
  actionData: {
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'AutomationJob' },
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Application' }
  }
}, { timestamps: true });

export const Notification = mongoose.model('Notification', notificationSchema);
