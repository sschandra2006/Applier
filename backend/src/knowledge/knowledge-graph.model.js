/**
 * Applicant Knowledge Graph Mongoose Model
 * Applier 2.0 — Phase 6
 *
 * Authoritative persistence layer for applicant domain knowledge,
 * provenance, confidence, and conflict tracking.
 */

import mongoose from 'mongoose';

const conflictSchema = new mongoose.Schema({
  conflictId: {
    type: String,
    required: true
  },
  path: {
    type: String,
    required: true
  },
  existingValue: {
    value: mongoose.Schema.Types.Mixed,
    source: {
      type: String,
      enum: ['PROFILE', 'DOCUMENT', 'USER_INPUT', 'PREVIOUS_APPLICATION', 'SYSTEM_DERIVED'],
      required: true
    },
    evidence: String,
    confidence: Number
  },
  conflictingValue: {
    value: mongoose.Schema.Types.Mixed,
    source: {
      type: String,
      enum: ['PROFILE', 'DOCUMENT', 'USER_INPUT', 'PREVIOUS_APPLICATION', 'SYSTEM_DERIVED'],
      required: true
    },
    evidence: String,
    confidence: Number
  },
  status: {
    type: String,
    enum: ['UNRESOLVED', 'RESOLVED'],
    default: 'UNRESOLVED'
  },
  reason: {
    type: String,
    default: 'FIELD_CONFLICT'
  },
  detectedAt: {
    type: String,
    required: true
  },
  resolvedAt: String,
  resolution: {
    selectedSource: String,
    selectedValue: mongoose.Schema.Types.Mixed,
    resolvedBy: String
  }
}, { _id: false });

const applicantKnowledgeGraphSchema = new mongoose.Schema({
  schemaVersion: {
    type: String,
    default: '2.0.0'
  },
  applicantId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  identity: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: () => new Map()
  },
  contact: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: () => new Map()
  },
  address: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: () => new Map()
  },
  education: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: () => new Map()
  },
  family: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: () => new Map()
  },
  financial: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: () => new Map()
  },
  preferences: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: () => new Map()
  },
  documents: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: () => new Map()
  },
  conflicts: [conflictSchema],
  metadata: {
    version: { type: Number, default: 1 },
    createdAt: String,
    updatedAt: String,
    totalFields: { type: Number, default: 0 },
    verifiedFields: { type: Number, default: 0 },
    conflictCount: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

export const ApplicantKnowledgeGraph = mongoose.model('ApplicantKnowledgeGraph', applicantKnowledgeGraphSchema);
export default ApplicantKnowledgeGraph;
