# Applier 2.0 — Shared Contract Architecture & Registry
**Document ID:** `ARCH-DOC-PHASE1-001`  
**Phase:** Phase 1 (Canonical Shared Contract Layer)  
**Status:** Approved & Implemented  
**Date:** October 2026  

---

## 1. Executive Summary

In Applier 1.0, data contracts between Node.js, Python FastAPI, and React frontend suffered from duplicate schemas, structural drift, unversioned payloads, and direct coupling of internal database representations (Mongoose/MongoDB) to external API wires.

Phase 1 establishes a **single source of truth** for all core system contracts in the `shared/` directory. The canonical representation is standard **JSON Schema Draft 2020-12**, consumed directly by Node.js via `Ajv2020` and Python via `jsonschema` + `referencing.Registry`. Database persistence models remain decoupled from external wire contracts through explicit bidirectional adapter layers.

---

## 2. Shared Module Architecture

The `shared/` module is organized into five foundational directories:

```
shared/
├── enums/                  # Canonical system enumerations
│   ├── index.json          # Machine-readable JSON enum specifications
│   └── index.js            # Frozen JavaScript enum exports
├── schemas/                # Language-neutral canonical JSON Schemas (Draft 2020-12)
│   ├── index.json          # Registry catalog of all 16 canonical schemas
│   ├── applicant-profile.json
│   ├── applicant-field.json
│   ├── document.json
│   ├── document-evidence.json
│   ├── website-field.json
│   ├── browser-observation.json
│   ├── browser-action.json
│   ├── verification-result.json
│   ├── workflow.json
│   ├── execution-plan.json
│   ├── execution-step.json
│   ├── execution-checkpoint.json
│   ├── automation-job.json
│   ├── interview-state.json
│   ├── application.json
│   └── human-checkpoint.json
├── fixtures/               # Golden testing fixtures
│   ├── valid/              # Verified valid golden contract instances
│   │   ├── workflow.valid.json
│   │   ├── execution-plan.valid.json
│   │   ├── interview-state.valid.json
│   │   └── automation-job.valid.json
│   └── invalid/            # Known failure cases & mismatch vectors
│       ├── workflow.invalid.json
│       ├── execution-plan.invalid.json
│       └── version-mismatch.invalid.json
├── generated/              # Type definitions derived from canonical schemas
│   └── types.d.ts          # Canonical TypeScript / JSDoc interface definitions
├── validators/             # Cross-language validation engines & persistence adapters
│   ├── index.js            # Node.js Ajv2020 validator & helper functions
│   ├── python_validator.py # Python jsonschema + referencing.Registry validator
│   └── adapters.js         # Mongoose Document <-> Canonical Contract adapters
├── package.json            # ESM package definition with subpath exports
└── src/
    └── index.js            # Primary ESM barrel export
```

---

## 3. Canonical Schema Registry (The 16 Core Entities)

Every canonical schema enforces `schemaVersion: "2.0.0"` (`const: "2.0.0"`), strict typing, and explicit required field guarantees:

| # | Entity Name | Schema File | Primary Identifier | Required Fields |
|---|-------------|-------------|--------------------|-----------------|
| 1 | **ApplicantProfile** | `applicant-profile.json` | `applicantId` | `schemaVersion`, `applicantId`, `fullName`, `email` |
| 2 | **ApplicantField** | `applicant-field.json` | `fieldId` | `schemaVersion`, `fieldId`, `value` |
| 3 | **Document** | `document.json` | `documentId` | `schemaVersion`, `documentId`, `userId`, `type`, `fileName`, `fileUrl` |
| 4 | **DocumentEvidence** | `document-evidence.json` | `evidenceId` | `schemaVersion`, `evidenceId`, `documentId`, `fieldKey`, `extractedValue` |
| 5 | **WebsiteField** | `website-field.json` | `fieldId` | `schemaVersion`, `fieldId`, `name`, `selector` |
| 6 | **BrowserObservation** | `browser-observation.json` | `observationId` | `schemaVersion`, `observationId`, `url` |
| 7 | **BrowserAction** | `browser-action.json` | `actionId` | `schemaVersion`, `actionId`, `type` |
| 8 | **VerificationResult** | `verification-result.json` | `verificationId` | `schemaVersion`, `verificationId`, `fieldKey`, `status` |
| 9 | **Workflow** | `workflow.json` | `workflowId` | `schemaVersion`, `name`, `targetUrl`, `pages` |
| 10 | **ExecutionPlan** | `execution-plan.json` | `planId` | `schemaVersion`, `targetUrl`, `steps` |
| 11 | **ExecutionStep** | `execution-step.json` | `stepIndex` | `type` |
| 12 | **ExecutionCheckpoint** | `execution-checkpoint.json` | `checkpointId` | `schemaVersion`, `jobId`, `stepIndex`, `status` |
| 13 | **AutomationJob** | `automation-job.json` | `jobId` | `schemaVersion`, `jobId`, `userId`, `workflowId`, `status`, `progress` |
| 14 | **InterviewState** | `interview-state.json` | `stateId` | `schemaVersion`, `stateId`, `userId`, `workflowId`, `status`, `answers` |
| 15 | **Application** | `application.json` | `applicationId` | `schemaVersion`, `applicationId`, `userId`, `workflowId`, `interviewStateId`, `status` |
| 16 | **HumanCheckpoint** | `human-checkpoint.json` | `checkpointId` | `schemaVersion`, `fieldName`, `pauseReason` |

---

## 4. Canonical System Enums

All domain enumerations are defined in `shared/enums/index.json` and mirrored in `shared/enums/index.js` as frozen constants:

```javascript
// JobStatus
QUEUED, RUNNING, PAUSED_OTP, PAUSED_CAPTCHA, PAUSED_PAYMENT, COMPLETED, FAILED, CANCELLED

// ExecutionStepType
navigate, fill, click, select, upload, pause, wait, screenshot

// PauseReason
OTP, CAPTCHA, PAYMENT, MANUAL_REVIEW

// InterviewStatus
NOT_STARTED, IN_PROGRESS, PAUSED, COMPLETED

// DocumentType
PASSPORT, AADHAAR, PAN, DRIVING_LICENCE, BIRTH_CERTIFICATE,
MARKSHEET, INCOME_CERTIFICATE, FEE_RECEIPT, PHOTO, SIGNATURE, OTHER

// DocumentValidationStatus
PENDING, VALID, INVALID, EXPIRED, UNREADABLE

// ApplicationStatus
DRAFT, READY, SUBMITTING, SUBMITTED, IN_REVIEW, APPROVED, REJECTED

// VerificationStatus
PASSED, FAILED, FLAGGED, PENDING

// FieldType
text, email, tel, date, number, select, radio, checkbox, file, textarea, password, pause, hidden

// FieldSource
USER_DIRECT, PROFILE_INFERRED, DOCUMENT_EXTRACTED, AI_INFERRED
```

---

## 5. Cross-Language Validation Engine

### 5.1 Node.js Engine (`shared/validators/index.js`)

Node.js executes validation using `Ajv2020`:
```javascript
import { validateWorkflow, validateExecutionPlan, validateCanonical } from '../../shared/validators/index.js';

// Validating incoming AI execution plan in backend controller:
const validation = validateExecutionPlan(planPayload);
if (!validation.valid) {
  return res.status(400).json({
    success: false,
    message: 'Payload violated canonical execution-plan contract',
    errors: validation.errors
  });
}
```

Key features:
- In-memory pre-compilation of all 16 JSON Schemas at module load.
- Comprehensive error formatting returning `{ valid, errors, version }`.
- Exception-throwing variant `validateCanonicalOrThrow(schemaName, data)` for pipeline steps.

### 5.2 Python Engine (`shared/validators/python_validator.py`)

Python FastAPI and AI agents use `jsonschema` + `referencing.Registry`:
```python
from python_validator import validate_canonical, validate_canonical_or_raise, validate_pydantic_model

# Validate raw dictionary or API payload
is_valid, errors = validate_canonical("execution-plan", payload)

# Validate Pydantic v2 model instances directly
is_valid, errors = validate_pydantic_model(execution_plan_model, "execution-plan")
```

Key features:
- All schemas are indexed into a local `referencing.Registry`, ensuring `$ref` schema references (e.g. `execution-step.json` referenced by `execution-plan.json`) resolve in sub-millisecond memory without network HTTP calls.
- `validate_pydantic_model` bridges Pydantic v2 instances (`model_dump()`) with canonical contract verification before webhook dispatch.

---

## 6. Decoupling Persistence from API Contracts

A major architectural rule of Applier 2.0 is: **Database persistence models are not API contracts.**

### Persistence Model vs. Wire Contract Differences

| Aspect | MongoDB / Mongoose Internal | Canonical External Contract |
|--------|----------------------------|----------------------------|
| IDs | `_id: ObjectId` | `workflowId: string`, `jobId: string` |
| Maps | Mongoose `Map` (`new Map()`) | Standard JSON key-value Object `{ "key": "val" }` |
| Workflow Structure | Nested `schemaDefinition.pages` | Root `pages: []` |
| Automation Status | Generic `'PAUSED'` | Explicit `'PAUSED_OTP'` / `'PAUSED_CAPTCHA'` |
| Timestamps | JavaScript `Date` | Strict ISO-8601 strings |

### The Adapter Layer (`shared/validators/adapters.js`)

The bidirectional adapters ensure complete isolation:
- `adaptCanonicalWorkflowToMongoose(canonical, userId)`: Translates external canonical workflow into Mongoose internal document layout (`schemaDefinition`, `urlHash`, `userId`).
- `adaptMongooseWorkflowToCanonical(doc)`: Extracts Mongoose document into clean canonical schema.
- `adaptMongooseInterviewStateToCanonical(doc)`: Flattens Mongoose `Map` answers and confidence scores into plain objects.
- `adaptMongooseAutomationJobToCanonical(doc)`: Maps legacy `PAUSED` status into specific `PAUSED_OTP`/`PAUSED_CAPTCHA`, converts logs, and shapes pause context into canonical format.
- `adaptMongooseDocumentToCanonical(doc)`: Normalizes document types and validation status.

---

## 7. Boundary Enforcement Points

Contracts are actively validated at the system integration boundaries:

1. **AI -> Backend Webhook Boundary:**
   - In `ai-service/agents/execution_planner.py`: Planner verifies generated plan with `validate_canonical("execution-plan", plan_dict)` before sending to Node.js webhook.
   - In `backend/src/automation/automation.controller.js` (`webhookReceivePlanController`): Ingress payload validated via `validateExecutionPlan()`.
2. **AI -> Backend Workflow Boundary:**
   - In `backend/src/workflow/workflow.controller.js` (`analyzeUrl`): AI response validated via `validateWorkflow()` before persisting through `adaptCanonicalWorkflowToMongoose()`.

---

## 8. Verification & Test Metrics

- **Node.js Contract Tests (`backend/tests/contract.test.js`):** 36/36 tests passing (100%).
- **Python Contract Tests (`ai-service/tests/test_canonical_contracts.py`):** 17/17 tests passing (100%).
- **Total Python AI Tests (`ai-service`):** 33/33 tests passing (100%).
- **Frontend Production Build:** Verified passing cleanly with Vite.
