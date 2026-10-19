/**
 * WebsiteFingerprint Mongoose Model — Applier 2.0 (Phase 19)
 * Durable persistent storage for learned portal behavior, locator strategies,
 * and structural fingerprints.
 */

import mongoose from 'mongoose';

const learnedStrategySchema = new mongoose.Schema({
  strategy: { type: String, required: true },
  selector: { type: String, required: true },
  confidence: { type: Number, required: true, min: 0, max: 1, default: 0.6 },
  successCount: { type: Number, default: 0, min: 0 },
  failureCount: { type: Number, default: 0, min: 0 },
  tier: {
    type: String,
    enum: ['CANDIDATE', 'TRUSTED', 'DEPRECATED'],
    default: 'CANDIDATE'
  },
  lastVerifiedAt: { type: Date }
}, { _id: false });

const semanticFieldSchema = new mongoose.Schema({
  semanticTarget: { type: String, required: true },
  learnedStrategies: [learnedStrategySchema],
  confidence: { type: Number, required: true, min: 0, max: 1, default: 0.6 },
  tier: {
    type: String,
    enum: ['CANDIDATE', 'TRUSTED', 'DEPRECATED'],
    default: 'CANDIDATE'
  }
}, { _id: false });

const successfulLocatorStrategySchema = new mongoose.Schema({
  semanticTarget: { type: String, required: true },
  strategy: { type: String, required: true },
  selector: { type: String, required: true },
  confidence: { type: Number, required: true, min: 0, max: 1 },
  tier: {
    type: String,
    enum: ['CANDIDATE', 'TRUSTED', 'DEPRECATED'],
    default: 'CANDIDATE'
  }
}, { _id: false });

const pageFingerprintSchema = new mongoose.Schema({
  pageId: { type: String, required: true },
  semanticPageType: { type: String, required: true },
  urlPattern: { type: String, default: '' },
  titlePattern: { type: String },
  domSignature: { type: String, required: true },
  confidence: { type: Number, required: true, min: 0, max: 1, default: 0.6 },
  tier: {
    type: String,
    enum: ['CANDIDATE', 'TRUSTED', 'DEPRECATED'],
    default: 'CANDIDATE'
  }
}, { _id: false });

const workflowTransitionSchema = new mongoose.Schema({
  fromPage: { type: String, required: true },
  toPage: { type: String, required: true },
  triggerAction: { type: String, required: true },
  confidence: { type: Number, required: true, min: 0, max: 1, default: 0.6 },
  tier: {
    type: String,
    enum: ['CANDIDATE', 'TRUSTED', 'DEPRECATED'],
    default: 'CANDIDATE'
  },
  successCount: { type: Number, default: 0, min: 0 },
  failureCount: { type: Number, default: 0, min: 0 }
}, { _id: false });

const uploadConstraintSchema = new mongoose.Schema({
  semanticField: { type: String, required: true },
  acceptedExtensions: [{ type: String }],
  maxSizeBytes: { type: Number },
  observedAcceptAttribute: { type: String },
  confidence: { type: Number, required: true, min: 0, max: 1, default: 0.7 }
}, { _id: false });

const checkpointBehaviorSchema = new mongoose.Schema({
  pageType: { type: String, required: true },
  checkpointType: {
    type: String,
    enum: ['OTP', 'CAPTCHA', 'HUMAN_REVIEW', 'PAYMENT', 'FINAL_CONFIRMATION'],
    required: true
  },
  observedStep: { type: Number },
  frequency: { type: Number, required: true, min: 0, max: 1, default: 0.5 },
  detectionSignals: [{ type: String }]
}, { _id: false });

const recoveryStrategySchema = new mongoose.Schema({
  failureType: { type: String, required: true },
  successfulRecoveryAction: { type: String, required: true },
  confidence: { type: Number, required: true, min: 0, max: 1, default: 0.6 },
  successCount: { type: Number, default: 0, min: 0 },
  failureCount: { type: Number, default: 0, min: 0 }
}, { _id: false });

const websiteFingerprintSchema = new mongoose.Schema({
  schemaVersion: { type: String, default: '2.0.0' },
  fingerprintId: { type: String, required: true, unique: true },
  domain: { type: String, required: true, index: true },
  portalIdentity: {
    name: { type: String, required: true },
    portalType: { type: String, required: true },
    framework: { type: String },
    structuralHash: { type: String, required: true }
  },
  knowledgeVersion: { type: Number, default: 1, min: 1 },
  status: {
    type: String,
    enum: ['ACTIVE', 'STALE', 'INVALIDATED', 'SUPERSEDED'],
    default: 'ACTIVE',
    index: true
  },
  pageFingerprints: [pageFingerprintSchema],
  semanticFields: [semanticFieldSchema],
  successfulLocatorStrategies: [successfulLocatorStrategySchema],
  workflowTransitions: [workflowTransitionSchema],
  uploadConstraints: [uploadConstraintSchema],
  checkpointBehavior: [checkpointBehaviorSchema],
  recoveryStrategies: [recoveryStrategySchema],
  statistics: {
    totalExecutions: { type: Number, default: 0 },
    successfulExecutions: { type: Number, default: 0 },
    failedExecutions: { type: Number, default: 0 },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    lastSuccessAt: { type: Date }
  }
}, {
  timestamps: true,
  collection: 'website_fingerprints'
});

websiteFingerprintSchema.index({ domain: 1, status: 1 });
websiteFingerprintSchema.index({ domain: 1, knowledgeVersion: -1 });

export const WebsiteFingerprint = mongoose.model('WebsiteFingerprint', websiteFingerprintSchema);
export default WebsiteFingerprint;
