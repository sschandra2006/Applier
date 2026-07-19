import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  workflowId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workflow' },
  
  type: { type: String, required: true },
  fileName: { type: String, required: true },
  fileUrl: { type: String, required: true },
  mimeType: { type: String, required: true },
  
  extractedData: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  validationStatus: { type: String, enum: ['PENDING', 'VALID', 'INVALID'], default: 'PENDING' },
  validationErrors: [{ type: String }],
  
  processedBy: { type: String }
}, { timestamps: true });

export const Document = mongoose.model('Document', documentSchema);
