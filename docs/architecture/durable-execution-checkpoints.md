# Applier 2.0 — Phase 16: Durable Execution Checkpoints

## 1. Overview & Objective

Phase 16 establishes **Durable Execution Checkpoints & Resumption** for Applier 2.0. Rather than treating application execution as fragile or ephemeral, every workflow is rendered durably resumable across:

- **Browser crash**: Browser process terminates unexpectedly (`TargetClosedError` or SIGKILL).
- **Worker restart**: Distributed browser worker instance halts or restarts during active filling.
- **API restart**: Backend API server crashes or restarts, clearing in-memory caches.
- **Network failure**: Portal drops connection or encounters connection timeouts.
- **OTP pause**: Portal halts for SMS / Email OTP verification.
- **CAPTCHA pause**: Portal displays a graphical challenge or puzzle.
- **User leaving application**: Applicant abandons session and returns hours or days later.

---

## 2. Canonical Checkpoint Specification (`execution-checkpoint.json` v2.0.0)

Every checkpoint captures a strictly serializable snapshot conforming to `shared/schemas/execution-checkpoint.json`:

| Field | Type | Description |
| :--- | :--- | :--- |
| `schemaVersion` | `string` | Canonical schema version (`2.0.0`). |
| `checkpointId` | `string` | Unique immutable checkpoint ID (`chk_...`). |
| `applicationId` | `string` | Target application identifier. |
| `jobId` | `string` | BullMQ automation job identifier. |
| `page` | `object` | Current page descriptor (`pageId`, `title`, `url`). |
| `url` | `string` | Settled URL of the active browser page. |
| `semanticPage` | `object` | Classified semantic page model (e.g. `APPLICATION_FORM`, `PERSONAL_INFO`). |
| `currentField` | `string` | Semantic field target currently being acted upon or paused at. |
| `completedFields` | `array` | Exhaustive list of verified fields already filled on the portal. |
| `executionStep` | `integer` | 0-indexed current workflow step. |
| `browserStateMetadata` | `object` | Storage state (cookies, origins), active tabs count, viewport, user agent. |
| `pendingCheckpoint` | `object` | Non-sensitive pause context (`pauseReason`, `fieldName`, `captchaImageBase64`). |
| `lastVerifiedAction` | `object` | Last verified action snapshot (`actionType`, `target`, `verifiedAt`, `verificationResult`). |
| `sanitizedAnswers` | `object` | Applicant data snapshot with all sensitive secrets stripped. |
| `status` | `string` | Canonical job status (`RUNNING`, `PAUSED_OTP`, `PAUSED_CAPTCHA`, `COMPLETED`, etc.). |

---

## 3. Secret Hygiene & Privacy Invariant

> [!CAUTION]
> **Data Privacy Invariant:** Never persist secrets unnecessarily. Do not store raw OTP/CAPTCHA values permanently.

1. **Answer Sanitization (`sanitizeAnswers`)**:
   - Any applicant values matching sensitive regex patterns (`/otp/i`, `/captcha/i`, `/password/i`, `/pin/i`, `/cvv/i`, `/secret/i`) are stripped from persistent checkpoint storage.
2. **Ephemeral Injection Only**:
   - When a user supplies an OTP or solves a CAPTCHA, the solution is passed transiently through memory (`userInput`) directly into the active Playwright `fill` action.
   - It is **never** written permanently to MongoDB `InterviewState.answers` or `ExecutionCheckpoint.sanitizedAnswers`.
3. **Secret Hygiene Assertion (`assertNoSecretsPersisted`)**:
   - Pre-save hooks and manager validations recursively inspect every checkpoint document.
   - Any raw secret found raises an immediate `SecretHygieneViolation` error.

---

## 4. The 6-Stage Resumption Protocol

Resumption executes through 6 deterministic phases, avoiding naive selector reuse:

```
                            RESUME TRIGGER
                                  │
                                  ▼
                        [1. RESTORE JOB]
        (Load checkpoint, execution plan, progress, and sanitized answers)
                                  │
                                  ▼
                   [2. RESTORE BROWSER SESSION]
      (Re-attach live page if alive, or new context with storageState)
                                  │
                                  ▼
                      [3. VERIFY CURRENT PAGE]
         (Navigate to checkpoint URL if needed, confirm page health)
                                  │
                                  ▼
                         [4. RE-OBSERVE]
        (Fresh DOM observation: inputs, alerts, page title, DOM hash)
                                  │
                                  ▼
                      [5. RECONCILE STATE]
     (Compare completedFields vs live DOM, advance step index,
      clear stale selectors to force dynamic semantic resolution)
                                  │
                                  ▼
                          [6. CONTINUE]
        (Resume execution loop via fresh RuntimeLocatorResolver)
```

### Stale Selector Avoidance
> [!IMPORTANT]
> **No Blind Resumption:** Checkpoints do not rely on brittle, cached CSS selectors.
> During state reconciliation, all remaining steps have their cached locators invalidated (`resolvedLocator = null`). Execution invokes `RuntimeLocatorResolver` to resolve live elements dynamically using semantic targets, accessible roles, labels, and stable attributes.

---

## 5. Architectural Components

1. **`DurableCheckpointManager`** (`browser-worker/execution/durable-checkpoint.manager.js`):
   - Captures, validates, and stores checkpoints in MongoDB and memory.
   - Extracts storage state, cookies count, and viewport from Playwright contexts.
2. **`DurableResumptionEngine`** (`browser-worker/execution/durable-resumption.engine.js`):
   - Orchestrates the 6-stage resumption protocol.
   - Handles ephemeral user input injection for OTP and CAPTCHA steps.
3. **`ExecutionCheckpoint` Model** (`backend/src/automation/execution-checkpoint.model.js`):
   - Mongoose schema tracking persistent checkpoint history.
4. **`SecretSanitizer`** (`browser-worker/execution/secret-sanitizer.js`):
   - Privacy guard enforcing zero permanent retention of raw credentials and OTP codes.
5. **`PolicyChecker` & `VerifiedExecutionEngine`**:
   - Gates automated actions targeting CAPTCHA/OTP while allowing verified resumption steps with user-supplied values.

---

## 6. Verification & Test Matrix

Verified via `backend/tests/durable-execution-checkpoint.test.js`:

| Scenario | Tested Behavior | Result |
| :--- | :--- | :--- |
| **Worker Restart** | Worker 1 terminates abruptly; Worker 2 restores job from checkpoint, reconciles completed fields, and finishes remaining steps. | **PASS** |
| **Browser Crash** | Browser terminates; new context created with restored cookies, navigates to checkpoint URL, re-observes DOM, and completes. | **PASS** |
| **OTP Pause** | Halts without storing raw OTP in checkpoint; user supplies OTP; resumes cleanly without persisting secret permanently. | **PASS** |
| **CAPTCHA Pause** | Pauses with captcha screenshot; user provides solution; fills via runtime locator and resumes to completion. | **PASS** |
| **API Restart** | In-memory store cleared; state successfully rehydrated from durable checkpoint model; execution completes. | **PASS** |
| **Resume After Timeout** | Step times out; resume verifies page, re-observes DOM, advances past already-verified steps without repeating actions. | **PASS** |
| **Secret Hygiene** | Throws `SecretHygieneViolation` when raw secret is present; sanitizes sensitive applicant answers. | **PASS** |
| **Contract Schema** | Validates generated checkpoint against canonical `execution-checkpoint.json` (`v2.0.0`). | **PASS** |
