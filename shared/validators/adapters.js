/**
 * Model <-> Canonical Contract Adapters — Applier 2.0
 * Decouples internal database persistence structures (Mongoose/MongoDB)
 * from external canonical API contracts.
 */

import { SchemaVersion, JobStatus, InterviewStatus } from '../enums/index.js';

/**
 * Adapts a Mongoose Workflow document to Canonical Workflow schema.
 */
export function adaptMongooseWorkflowToCanonical(doc) {
  if (!doc) return null;
  const raw = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  
  return {
    schemaVersion: raw.schemaVersion || SchemaVersion,
    workflowId: String(raw._id || raw.workflowId || ''),
    name: raw.name || 'Generated Workflow',
    targetUrl: raw.url || raw.targetUrl || '',
    urlHash: raw.urlHash || '',
    landingScreenshot: raw.landingScreenshot || null,
    pages: raw.schemaDefinition?.pages || raw.pages || [],
    applicationOptions: raw.schemaDefinition?.metadata?.applicationOptions || raw.applicationOptions || [],
    metadata: raw.schemaDefinition?.metadata || raw.metadata || {},
    createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : new Date().toISOString()
  };
}

/**
 * Adapts a Canonical Workflow payload to Mongoose Workflow document structure.
 */
export function adaptCanonicalWorkflowToMongoose(canonical, userId) {
  return {
    userId,
    name: canonical.name,
    url: canonical.targetUrl,
    urlHash: canonical.urlHash,
    landingScreenshot: canonical.landingScreenshot || null,
    schemaVersion: canonical.schemaVersion || SchemaVersion,
    schemaDefinition: {
      pages: canonical.pages || [],
      metadata: {
        ...(canonical.metadata || {}),
        applicationOptions: canonical.applicationOptions || []
      }
    }
  };
}

/**
 * Adapts a Mongoose InterviewState document to Canonical InterviewState schema.
 */
export function adaptMongooseInterviewStateToCanonical(doc) {
  if (!doc) return null;
  const raw = typeof doc.toObject === 'function' ? doc.toObject() : doc;

  // Convert Mongoose Map to plain object
  let answers = {};
  if (raw.answers instanceof Map) {
    answers = Object.fromEntries(raw.answers);
  } else if (raw.answers && typeof raw.answers === 'object') {
    answers = { ...raw.answers };
  }

  return {
    schemaVersion: SchemaVersion,
    stateId: String(raw._id || raw.stateId || ''),
    userId: String(raw.userId || ''),
    workflowId: String(raw.workflowId?._id || raw.workflowId || ''),
    applicationId: raw.applicationId ? String(raw.applicationId) : null,
    status: raw.status || InterviewStatus.NOT_STARTED,
    answers,
    pendingFields: Array.isArray(raw.pendingFields) ? [...raw.pendingFields] : [],
    completedFields: Array.isArray(raw.completedFields) ? [...raw.completedFields] : [],
    currentField: raw.currentField || null,
    currentStep: raw.currentStep || 1,
    confidenceScores: raw.confidenceScores instanceof Map ? Object.fromEntries(raw.confidenceScores) : (raw.confidenceScores || {}),
    validationErrors: raw.validationErrors instanceof Map ? Object.fromEntries(raw.validationErrors) : (raw.validationErrors || {}),
    lastQuestionId: raw.lastQuestionId || null,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : new Date().toISOString()
  };
}

/**
 * Adapts a Mongoose AutomationJob document to Canonical AutomationJob schema.
 */
export function adaptMongooseAutomationJobToCanonical(doc) {
  if (!doc) return null;
  const raw = typeof doc.toObject === 'function' ? doc.toObject() : doc;

  let status = raw.status || JobStatus.QUEUED;
  if (status === 'PAUSED') {
    status = raw.pauseContext?.pauseReason === 'CAPTCHA' ? JobStatus.PAUSED_CAPTCHA : JobStatus.PAUSED_OTP;
  }

  return {
    schemaVersion: SchemaVersion,
    jobId: String(raw._id || raw.jobId || ''),
    userId: String(raw.userId || ''),
    interviewStateId: String(raw.interviewStateId || ''),
    workflowId: String(raw.workflowId?._id || raw.workflowId || ''),
    status,
    progress: {
      currentStep: raw.progress?.currentStep ?? raw.currentStepIndex ?? 0,
      totalSteps: raw.progress?.totalSteps ?? (raw.executionPlan?.length || 0)
    },
    currentStepIndex: raw.currentStepIndex || 0,
    executionPlan: Array.isArray(raw.executionPlan) ? raw.executionPlan : [],
    pauseContext: raw.pauseContext ? {
      schemaVersion: SchemaVersion,
      fieldName: raw.pauseContext.fieldName || 'verification',
      pauseReason: raw.pauseContext.pauseReason || 'OTP',
      captchaImageBase64: raw.pauseContext.captchaImageBase64 || null,
      pageScreenshotBase64: raw.pauseContext.pageScreenshotBase64 || null,
      stepIndex: raw.pauseContext.stepIndex || 0,
      resumeFromIndex: raw.pauseContext.resumeFromIndex || 0,
      resolved: false
    } : null,
    errorDetails: raw.errorDetails || null,
    logs: Array.isArray(raw.logs) ? raw.logs.map(l => ({
      timestamp: l.timestamp ? new Date(l.timestamp).toISOString() : new Date().toISOString(),
      level: l.level || 'INFO',
      message: l.message || '',
      additionalData: l.additionalData || {}
    })) : [],
    createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : new Date().toISOString()
  };
}

/**
 * Adapts a Mongoose Document record to Canonical Document schema.
 */
export function adaptMongooseDocumentToCanonical(doc) {
  if (!doc) return null;
  const raw = typeof doc.toObject === 'function' ? doc.toObject() : doc;

  return {
    schemaVersion: SchemaVersion,
    documentId: String(raw._id || raw.documentId || ''),
    userId: String(raw.userId || ''),
    type: String(raw.type || 'OTHER').toUpperCase(),
    fileName: raw.fileName || 'document.bin',
    fileUrl: raw.fileUrl || '',
    mimeType: raw.mimeType || 'application/octet-stream',
    sizeBytes: raw.sizeBytes || 0,
    validationStatus: raw.validationStatus || 'PENDING',
    extractedFields: raw.extractedData || {},
    metadata: raw.metadata || {},
    uploadedAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : new Date().toISOString()
  };
}

export default {
  adaptMongooseWorkflowToCanonical,
  adaptCanonicalWorkflowToMongoose,
  adaptMongooseInterviewStateToCanonical,
  adaptMongooseAutomationJobToCanonical,
  adaptMongooseDocumentToCanonical
};
