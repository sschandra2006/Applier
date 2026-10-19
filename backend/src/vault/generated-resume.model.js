/**
 * Generated / Tailored Resume Mongoose Model
 * Manages job-specific tailored resumes, their versioning,
 * encryption at rest, source profile traceability, and validation reports.
 */

import mongoose from 'mongoose';
import { ResumeTemplateId, GeneratedResumeStatus } from '../../../shared/src/index.js';

const generatedResumeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  applicationSessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MissingInfoSession',
    default: null,
    index: true
  },
  sourceProfileVersion: {
    type: Number,
    required: true,
    index: true
  },
  company: {
    type: String,
    required: true
  },
  jobTitle: {
    type: String,
    required: true
  },
  templateId: {
    type: String,
    enum: Object.values(ResumeTemplateId),
    default: ResumeTemplateId.ATS_SINGLE_COLUMN
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
  fileSizeBytes: {
    type: Number,
    required: true
  },
  pageCount: {
    type: Number,
    default: 1
  },
  latexSource: {
    type: String,
    default: ''
  },
  tailoredSummary: {
    type: String,
    default: ''
  },
  matchedKeywords: {
    type: [String],
    default: []
  },
  status: {
    type: String,
    enum: Object.values(GeneratedResumeStatus),
    default: GeneratedResumeStatus.VALIDATED,
    index: true
  },
  validationReport: {
    isValid: { type: Boolean, default: true },
    contactInfoVerified: { type: Boolean, default: true },
    datesVerified: { type: Boolean, default: true },
    skillsVerified: { type: Boolean, default: true },
    projectsVerified: { type: Boolean, default: true },
    metricsPreserved: { type: Boolean, default: true },
    pdfTextExtractable: { type: Boolean, default: true },
    violations: { type: [String], default: [] },
    unsupportedClaims: { type: [String], default: [] },
    extractedPdfWordCount: { type: Number, default: 0 },
    pageCount: { type: Number, default: 1 }
  },
  resumeContent: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  provenanceMap: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({})
  },
  isArchived: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true
});

generatedResumeSchema.index({ userId: 1, company: 1, jobTitle: 1 });

export const GeneratedResume = mongoose.model('GeneratedResume', generatedResumeSchema);
export default GeneratedResume;
