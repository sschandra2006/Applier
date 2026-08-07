import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Application' }, // Optional until interview completes
  title: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['ACTIVE', 'COMPLETED'], default: 'ACTIVE' },
  summary: { type: String }
}, { timestamps: true });

export const Conversation = mongoose.model('Conversation', conversationSchema);
