# Contract & Schema Audit

> **Module:** Cross-Service Contracts & Data Model Synchronization  
> **Status:** Phase 0 Verified  
> **Source of Truth:** Codebase inspection of `backend/`, `ai-service/`, `frontend/`, and `shared/`  

---

## 1. Overview & Current Monorepo State

Currently, **no shared contract system is active**:
- The repository contains a top-level directory [`shared/`](file:///f:/Applier/shared) with `package.json` referencing `zod: ^4.4.3`.
- However, [`shared/src/index.js`](file:///f:/Applier/shared/src/index.js) is **completely empty (0 bytes)**.
- As a consequence, schemas are declared and maintained independently in:
  1. Python Pydantic v2 models (`ai-service/core/models.py`).
  2. Node.js Mongoose models (`backend/src/**/**.model.js`).
  3. React UI components and state representations (`frontend/src/**`).

This document records all contract duplications, divergence, producers, consumers, and validation gaps.

---

## 2. In-Depth Contract Matrix

### 2.1. `WorkflowSchema`

| Aspect | Details |
| :--- | :--- |
| **Python Definition** | [`ai-service/core/models.py`](file:///f:/Applier/ai-service/core/models.py) (`WorkflowSchema`, `WorkflowPage`, `WorkflowStep`) |
| **Node.js Definition** | [`backend/src/workflow/workflow.model.js`](file:///f:/Applier/backend/src/workflow/workflow.model.js) (`workflowSchema`, `pageSchema`, `stepSchema`) |
| **React Representation** | Implicit in [`frontend/src/features/dashboard/NewApplication.jsx`](file:///f:/Applier/frontend/src/features/dashboard/NewApplication.jsx) |
| **Producer** | `WorkflowPlanner` (`ai-service/agents/workflow_planner.py`) |
| **Consumers** | Backend `workflow.controller.js`, `interview.service.js`, `automation.service.js`, Frontend UI |
| **Schema Divergence** | - **Python:** Strictly typed with Pydantic v2. Uses `AliasChoices('label', 'title', 'name', 'text')` for normalization. Validates fields: `id`, `type`, `label`, `selector`, `required`, `validation`, `options`, `metadata`, `extensions`.<br>- **Node.js:** Mongoose schema uses `mongoose.Schema.Types.Mixed` for `validation`, `options`, `metadata`, and `extensions`. Steps do not enforce selector existence or valid field types.<br>- **React:** Reads directly from `workflow.schemaDefinition.pages[].steps[]` without validation. |
| **Missing Validation** | Node.js does not validate the AI-generated `WorkflowSchema` before inserting into MongoDB; if Python returns malformed JSON or partial steps, Mongoose saves it as-is. |

---

### 2.2. `ExecutionPlan`

| Aspect | Details |
| :--- | :--- |
| **Python Definition** | [`ai-service/core/models.py`](file:///f:/Applier/ai-service/core/models.py) (`ExecutionPlan`, `ExecutionStep`) |
| **Node.js Definition** | [`backend/src/automation/automation.model.js`](file:///f:/Applier/backend/src/automation/automation.model.js) (`executionPlan: { type: Array, default: [] }`) |
| **React Representation** | Consumed in [`frontend/src/features/dashboard/NewApplication.jsx`](file:///f:/Applier/frontend/src/features/dashboard/NewApplication.jsx) as `job.executionPlan` |
| **Producer** | `ExecutionPlanner` (`ai-service/agents/execution_planner.py`) |
| **Consumers** | Backend `webhookReceivePlanController()`, `executePlan()`, Frontend Execution Monitor |
| **Schema Divergence** | - **Python:** Strongly typed: `type` is a strict literal (`navigate`, `fill`, `click`, `select`, `upload`, `pause`, `wait`, `screenshot`). Attributes include `selector`, `field`, `value`, `url`, `description`, `waitAfterMs`, `constraints`, `pauseReason`, `captchaSelector`.<br>- **Node.js:** Stored as an unvalidated raw JavaScript Array (`type: Array`) inside `AutomationJob`. Node performs no type or structural validation when receiving this via webhook.<br>- **React:** Iterates steps expecting `step.description` or `step.type`. |
| **Missing Validation** | **CRITICAL GAP:** `backend/src/automation/automation.controller.js` accepts `plan` in `webhookReceivePlanController` with zero schema checking. If an unsupported step type or missing selector is passed, the error is only caught during runtime execution inside Chromium. |

---

### 2.3. `InterviewState`

| Aspect | Details |
| :--- | :--- |
| **Python Definition** | [`ai-service/services/interview_ai.py`](file:///f:/Applier/ai-service/services/interview_ai.py) (`ExtractedAnswer` output schema; state received as untyped `dict`) |
| **Node.js Definition** | [`backend/src/interview/interview-state.model.js`](file:///f:/Applier/backend/src/interview/interview-state.model.js) (`interviewStateSchema`) |
| **React Representation** | Consumed in [`frontend/src/features/dashboard/NewApplication.jsx`](file:///f:/Applier/frontend/src/features/dashboard/NewApplication.jsx) (`state.status`, `state.pendingFields`) |
| **Producers** | Backend `interview.service.js` (updates state), AI `ConversationAgent` (extracts answers) |
| **Consumers** | Frontend Chat UI, Backend `automation.service.js` (extracts answers for form filling) |
| **Schema Divergence** | - **Node.js:** Mongoose stores `answers` as a `Map` of `Mixed`, `confidenceScores` as a `Map` of `Number`. Node must convert this to a plain object via `Object.fromEntries(state.answers)` before sending to Python.<br>- **Python:** Receives `answers` as a standard JSON dictionary. Emits `ExtractedAnswer` (`extracted_data`, `nextField`, `question`, `confidence`, `requiresClarification`).<br>- **React:** Consumes JSON payload returned by Express endpoints. |
| **Missing Validation** | Neither Python nor Node validates the exact shape of dynamic answer values (e.g. date strings, numbers, phone strings). Everything is treated as loose strings or mixed objects. |

---

### 2.4. `Document`

| Aspect | Details |
| :--- | :--- |
| **Python Definition** | [`ai-service/core/models.py`](file:///f:/Applier/ai-service/core/models.py) (`DocumentExtraction`) |
| **Node.js Definition** | [`backend/src/documents/document.model.js`](file:///f:/Applier/backend/src/documents/document.model.js) (`documentSchema`) |
| **React Representation** | [`frontend/src/features/dashboard/DocumentVault.jsx`](file:///f:/Applier/frontend/src/features/dashboard/DocumentVault.jsx) |
| **Producer** | Backend `uploadDocument()` & `uploadInlineDocument()`, AI `DocumentIntelligenceAgent` |
| **Consumers** | Frontend Document Vault, Backend `executePlan()` (file uploader) |
| **Schema Divergence** | - **Node.js:** Mongoose stores `type: String`, `fileName: String`, `fileUrl: String`, `mimeType: String`, `validationStatus: { type: String, enum: ['PENDING', 'VALID', 'INVALID'] }`.<br>- **Python:** `DocumentExtraction` outputs `documentType`, `extractedFields`, `confidence`, `isValid`, `warnings`.<br>- **React:** Relies on `type`, `fileName`, `fileUrl`, `mimeType`. |
| **Missing Validation** | `type` is not governed by a shared enum across Node, Python, and React. A document can be labeled `identityProof` in workflow, `aadhaar` in user input, and `ID Card` in Python vision extraction, causing mapping friction. |

---

### 2.5. `AutomationJob`

| Aspect | Details |
| :--- | :--- |
| **Node.js Definition** | [`backend/src/automation/automation.model.js`](file:///f:/Applier/backend/src/automation/automation.model.js) |
| **Python Definition** | Untyped input payload in [`ai-service/api/routes/execute.py`](file:///f:/Applier/ai-service/api/routes/execute.py) |
| **React Representation** | Polled by [`frontend/src/features/dashboard/NewApplication.jsx`](file:///f:/Applier/frontend/src/features/dashboard/NewApplication.jsx) & [`Dashboard.jsx`](file:///f:/Applier/frontend/src/features/dashboard/Dashboard.jsx) |
| **Producer** | Backend `automation.service.js` |
| **Consumers** | Frontend live poll, AI `RecoveryAgent` (analyzes job failure logs) |
| **Status Enum Contract** | - **Node.js Mongoose:** `enum: ['QUEUED', 'RUNNING', 'PAUSED_OTP', 'PAUSED_CAPTCHA', 'COMPLETED', 'FAILED']`.<br>- **Node.js Webhook Controller:** Converts legacy `PAUSED_FOR_USER_INPUT` to `PAUSED_OTP`.<br>- **React Frontend:** Explicitly handles `PAUSED_OTP`, `PAUSED_CAPTCHA`, `RUNNING`, `COMPLETED`, `FAILED`. |
| **Missing Validation** | `logs[].additionalData` is defined as `mongoose.Schema.Types.Mixed`. Contains base64 screenshots (`base64Receipt`) that cause significant document bloat in MongoDB when uncompressed. |

---

### 2.6. `Application`

| Aspect | Details |
| :--- | :--- |
| **Node.js Definition** | [`backend/src/tracking/application.model.js`](file:///f:/Applier/backend/src/tracking/application.model.js) |
| **React Representation** | [`frontend/src/features/dashboard/Dashboard.jsx`](file:///f:/Applier/frontend/src/features/dashboard/Dashboard.jsx) |
| **Producer** | Backend tracking/automation |
| **Consumers** | Frontend tracking dashboard |
| **Schema Divergence** | `Application` model has `status: ['SUBMITTED', 'REJECTED', 'APPROVED', 'IN_REVIEW']`. However, `tracking.controller.js` queries `AutomationJob` to populate the dashboard applications list instead of `Application`! This represents an internal model mismatch. |

---

### 2.7. `User` & `Profile`

| Aspect | Details |
| :--- | :--- |
| **Node.js Definition** | [`backend/src/users/user.model.js`](file:///f:/Applier/backend/src/users/user.model.js) & [`profile.model.js`](file:///f:/Applier/backend/src/users/profile.model.js) |
| **Python Definition** | Received as generic `user_profile: dict` in [`AIExecuteRequest`](file:///f:/Applier/ai-service/api/routes/execute.py) |
| **React Representation** | [`frontend/src/core/contexts/AuthContext.jsx`](file:///f:/Applier/frontend/src/core/contexts/AuthContext.jsx) & [`Settings.jsx`](file:///f:/Applier/frontend/src/features/dashboard/Settings.jsx) |
| **Schema Divergence** | `Profile` has extensive demographic fields (`dateOfBirth`, `gender`, `address`, `education`, `aadhaarNumber`, `panNumber`), but Python receives an unstructured dict with no validation. |

---

## 3. Summary of Contract Deficiencies

1. **Monorepo Invariant Broken:** `shared/src/index.js` is empty. No unified Zod, JSON Schema, or TypeScript types exist between the tiers.
2. **Untyped Webhook Payloads:** `webhookReceivePlanController` accepts external JSON into the Node.js execution engine without schema validation.
3. **Mongoose `Mixed` Proliferation:** Key domain fields (`validation`, `options`, `metadata`, `executionPlan`, `logs.additionalData`) are typed as `Mixed`, disabling database-level schema enforcement.
4. **Model Collision in Tracking:** Tracking dashboard queries `AutomationJob` rather than `Application`, leaving the `Application` collection largely unpopulated.
