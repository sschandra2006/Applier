/**
 * Master Resume Mongoose Model
 * Manages original uploaded master resumes, their encryption references,
 * deduplication hashes, and extraction status.
 */

import mongoose from 'mongoose';
import { MasterResumeStatus } from '../../../shared/src/index.js';

const masterResumeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  fileName: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  fileSizeBytes: {
    type: Number,
    required: true
  },
  storagePath: {
    type: String,
    required: true
  },
  fileSha256: {
    type: String,
    required: true,
    index: true
  },
  rawExtractedText: {
    type: String,
    default: ''
  },
  extractionMetadata: {
    pages: { type: Number, default: 1 },
    wordCount: { type: Number, default: 0 },
    method: { type: String, default: 'PYMUPDF' },
    ocrUsed: { type: Boolean, default: false }
  },
  status: {
    type: String,
    enum: Object.values(MasterResumeStatus),
    default: MasterResumeStatus.UPLOADED,
    index: true
  },
  error: {
    type: String,
    default: null
  },
  isArchived: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Compound index for user + fileSha256 to accelerate idempotency checks
masterResumeSchema.index({ userId: 1, fileSha256: 1 });

export const MasterResume = mongoose.model('MasterResume', masterResumeSchema);
export default MasterResume;
