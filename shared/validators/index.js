/**
 * Canonical Schema Validator for Node.js / JavaScript
 * Uses Ajv with JSON Schema (Draft 2020-12 / Draft 7 compatible).
 */

import Ajv2020 from 'ajv/dist/2020.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemasDir = path.resolve(__dirname, '../schemas');

const ajv = new Ajv2020({
  allErrors: true,
  strict: false, // Allow extensible metadata
  validateFormats: false // Lightweight formats check
});

// Load and register all JSON schemas
const schemaFiles = fs.readdirSync(schemasDir).filter(f => f.endsWith('.json') && f !== 'index.json');
const schemas = {};

for (const file of schemaFiles) {
  const schemaPath = path.join(schemasDir, file);
  try {
    const raw = fs.readFileSync(schemaPath, 'utf8');
    const parsed = JSON.parse(raw);
    const schemaName = file.replace('.json', '');
    schemas[schemaName] = parsed;
    ajv.addSchema(parsed, parsed.$id || file);
  } catch (err) {
    console.error(`[SharedValidator] Failed to load schema ${file}:`, err.message);
  }
}

/**
 * Validates a payload against a canonical schema.
 * @param {string} schemaName e.g. 'workflow', 'execution-plan', 'interview-state'
 * @param {object} data Payload to validate
 * @returns {{ valid: boolean, errors: Array<object>, version: string }}
 */
export function validateCanonical(schemaName, data) {
  if (!data || typeof data !== 'object') {
    return {
      valid: false,
      errors: [{ message: 'Payload must be a non-null object' }],
      version: null
    };
  }

  // Version check & backward compatibility
  const schemaVer = data.schemaVersion || (data.schemaDefinition?.schemaVersion) || '1.0.0';

  const schema = schemas[schemaName];
  if (!schema) {
    return {
      valid: false,
      errors: [{ message: `Unknown canonical schema: "${schemaName}"` }],
      version: schemaVer
    };
  }

  const validator = ajv.getSchema(schema.$id) || ajv.compile(schema);
  const valid = validator(data);

  return {
    valid: !!valid,
    errors: validator.errors ? [...validator.errors] : [],
    version: schemaVer
  };
}

/**
 * Validates or throws a structured ValidationError.
 */
export function validateCanonicalOrThrow(schemaName, data) {
  const result = validateCanonical(schemaName, data);
  if (!result.valid) {
    const errorDetails = result.errors.map(e => `${e.instancePath || 'root'}: ${e.message}`).join('; ');
    const err = new Error(`Canonical validation failed for ${schemaName}: ${errorDetails}`);
    err.name = 'CanonicalValidationError';
    err.errors = result.errors;
    err.schemaName = schemaName;
    throw err;
  }
  return data;
}

export const validateApplicantProfile = (data) => validateCanonical('applicant-profile', data);
export const validateWorkflow = (data) => validateCanonical('workflow', data);
export const validateExecutionPlan = (data) => validateCanonical('execution-plan', data);
export const validateExecutionStep = (data) => validateCanonical('execution-step', data);
export const validateInterviewState = (data) => validateCanonical('interview-state', data);
export const validateAutomationJob = (data) => validateCanonical('automation-job', data);
export const validateDocument = (data) => validateCanonical('document', data);
export const validateApplication = (data) => validateCanonical('application', data);
export const validateHumanCheckpoint = (data) => validateCanonical('human-checkpoint', data);
export const validateBrowserObservation = (data) => validateCanonical('browser-observation', data);
export const validateBrowserAction = (data) => validateCanonical('browser-action', data);
export const validateSemanticPageModel = (data) => validateCanonical('semantic-page-model', data);
export const validateApplicantKnowledgeGraph = (data) => validateCanonical('applicant-knowledge-graph', data);
export const validateDocumentEvidence = (data) => validateCanonical('document-evidence', data);
export const validateSemanticFieldMapping = (data) => validateCanonical('semantic-field-mapping', data);
export const validateRuntimeLocator = (data) => validateCanonical('runtime-locator', data);
export const validateActionVerification = (data) => validateCanonical('action-verification', data);
export const validateSubmissionConfirmation = (data) => validateCanonical('submission-confirmation', data);
export const validateActionPolicy = (data) => validateCanonical('action-policy', data);
export const validateApplicationReview = (data) => validateCanonical('application-review', data);
export const validateRecoveryRecord = (data) => validateCanonical('recovery-record', data);
export const validateExecutionCheckpoint = (data) => validateCanonical('execution-checkpoint', data);
export const validateVerifiedSubmission = (data) => validateCanonical('verified-submission', data);
export const validateAutomationEvent = (data) => validateCanonical('automation-event', data);
export const validateWebsiteFingerprint = (data) => validateCanonical('website-fingerprint', data);
export const validateUniversalApplicationSession = (data) => validateCanonical('universal-application-session', data);
export const validateApplicationHierarchy = (data) => validateCanonical('application-hierarchy', data);
export const validateModelRoutingDecision = (data) => validateCanonical('model-routing-decision', data);
export const validateSecurityAuditEvent = (data) => validateCanonical('security-audit-event', data);
export const validateQaLabScenario = (data) => validateCanonical('qa-lab-scenario', data);
export const validateSystemMetrics = (data) => validateCanonical('system-metrics', data);
export const validateScalingAlert = (data) => validateCanonical('scaling-alert', data);

export { schemas };

export default {
  validateCanonical,
  validateCanonicalOrThrow,
  validateApplicantProfile,
  validateWorkflow,
  validateExecutionPlan,
  validateExecutionStep,
  validateInterviewState,
  validateAutomationJob,
  validateDocument,
  validateApplication,
  validateHumanCheckpoint,
  validateBrowserObservation,
  validateBrowserAction,
  validateSemanticPageModel,
  validateApplicantKnowledgeGraph,
  validateDocumentEvidence,
  validateSemanticFieldMapping,
  validateRuntimeLocator,
  validateActionVerification,
  validateSubmissionConfirmation,
  validateActionPolicy,
  validateApplicationReview,
  validateRecoveryRecord,
  validateExecutionCheckpoint,
  validateVerifiedSubmission,
  validateAutomationEvent,
  validateWebsiteFingerprint,
  validateUniversalApplicationSession,
  validateApplicationHierarchy,
  validateModelRoutingDecision,
  validateSecurityAuditEvent,
  validateQaLabScenario,
  validateSystemMetrics,
  validateScalingAlert,
  schemas
};
