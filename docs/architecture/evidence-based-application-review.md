# Applier 2.0 — Phase 13: Evidence-Based Application Review

## 1. Overview & Objective

Phase 13 establishes the **Evidence-Based Application Review System**, replacing rudimentary text summaries with a comprehensive, provenance-backed review interface:

```
+───────────────────────────────────────────────────────────────────────────────────+
|                           APPLICATION REVIEW PIPELINE                             |
|                                                                                   |
|  [Applicant Knowledge Graph] + [Document Evidence] + [Interview Answers]         |
|                                  │                                                |
|                                  ▼                                                |
|                   [ApplicationReviewService.build]                                |
|                                  │                                                |
|         ┌────────────────────────┴────────────────────────┐                       |
|         ▼                                                 ▼                       |
|   [Field Evidence Grid]                         [Conflict Resolution UI]          |
|   • Value                                       • Option A vs Option B            |
|   • Source (Document / Profile / User)          • Provenance & Confidence         |
|   • Confidence (e.g. 98%)                       • Mandatory User Resolution       |
|   • Validation & Status                                   │                       |
|         │                                                 │                       |
|         └────────────────────────┬────────────────────────┘                       |
|                                  ▼                                                |
|                     [User Explicit Confirmation]                                  |
|                                  │                                                |
|                                  ▼                                                |
|           [Cryptographic Confirmation Token & SHA-256 Hash]                       |
|                                  │                                                |
|                     [SUBMISSION LOCK ENGAGED]                                     |
|           • AI forbidden from mutating confirmed fields                           |
|           • Post-confirmation user mutation strictly invalidates token            |
|           • Verified execution requires valid active token                        |
+───────────────────────────────────────────────────────────────────────────────────+
```

---

## 2. Core Display Contract: Value, Source, Confidence, Status

Every form field in the application is represented with full provenance transparency:

| Field Property | Description & Examples |
| :--- | :--- |
| **`Field`** | Canonical label and semantic key (e.g., `Date of Birth`, `identity.dateOfBirth`). Badged as `Required` or `Optional`. |
| **`Value`** | Normalized candidate value (e.g., `14-08-2006`, `Rahul Kumar`, `₹ 2,50,000`). Editable inline prior to lock. |
| **`Source`** | Provenance origin (`DOCUMENT`, `PROFILE`, `USER_INPUT`, `PREVIOUS_APPLICATION`, `SYSTEM_DERIVED`, `NONE`). |
| **`Source Details`** | Specific document file, page, or profile attribute (e.g., `Aadhaar.pdf, page 1`, `User Interview`). |
| **`Confidence`** | Normalized numeric score ($0.0 - 1.0$), rendered as percentage and colored bar ($\ge 90\%$ emerald, $\ge 80\%$ amber, $< 80\%$ red). |
| **`Validation`** | Form validation verdict (`Verified`, `Valid`, `Missing Required Field`, `Needs Confirmation`). |
| **`Status`** | Canonical enum: `VERIFIED`, `UNVERIFIED`, `CONFIRMATION_REQUIRED`, `MISSING`, `CONFLICT`, `OPTIONAL_EMPTY`. |

### Example Field Entry:
```
Date of Birth
Value: 14-08-2006
Source: Aadhaar.pdf, page 1
Confidence: 98%
Validation: Verified
Status: VERIFIED [Required]
```

---

## 3. Dedicated Conflict Resolution UI

If the Applicant Knowledge Graph or Document Evidence contains conflicting data for a single field:
1. **Prominent Alerting**: Field is highlighted with amber border, warning icon, and pulsed `Conflict Detected` badge.
2. **Side-by-Side Comparison**:
   - **Option A (Existing Record)**: Value, document source, page, confidence.
   - **Option B (Conflicting Record)**: Value, conflicting document source, page, confidence.
   - **Custom Resolution**: Input field allowing manual user specification.
3. **Submission Gate**: `canConfirm` is strictly set to `false`. Confirmation is permanently blocked until the user resolves every open conflict.
4. **Resolution Effect**: Selecting an option resolves the conflict in the Knowledge Graph, updates the authoritative field value, records audit history, and recalculates review metrics.

---

## 4. Missing Data Categorization

The interface explicitly categorizes all non-resolved fields:
- **`Missing Required`**: Marked with red badge and warning. Blocks confirmation (`canConfirm: false`).
- **`Missing Optional`**: Marked with gray pill (`OPTIONAL_EMPTY`). Non-blocking.
- **`Needs Confirmation`**: Low-confidence fields ($< 0.85$). Highlighted in purple for user awareness.

The UI provides instant filter tabs:
- `All Fields (N)`
- `Conflicts (N)`
- `Missing Required (N)`
- `Needs Confirmation (N)`
- `Verified (N)`

---

## 5. Explicit Confirmation & Submission Lock

Confirmation is not an implicit checkbox; it is a cryptographic barrier.

### 5.1 Token Generation
When the user clicks **"Explicitly Confirm & Lock Application"**:
1. Prerequisites verified: `missingRequired === 0` and `conflictsCount === 0`.
2. All form answers are deterministically sorted alphabetically and hashed with SHA-256 (`fieldStateHash`).
3. Cryptographically signed confirmation token (`HMAC-SHA256`) is generated by `ConfirmationTokenService`.
4. Review state transitions to `CONFIRMED` and `isLocked: true`.

### 5.2 Protection Axioms
- **AI Forbidden from Mutating Confirmed Values**: Any AI attempt to alter a locked field throws `CONFIRMED_VALUE_PROTECTED` and is rejected immediately.
- **Form Mutation Strictly Invalidates Confirmation**: If the user modifies any field post-confirmation, the live hash diverges from the token hash. The token is immediately revoked (`FORM_MUTATED_AFTER_CONFIRMATION`), `isLocked` resets to `false`, and re-confirmation is required.
- **Non-Bypassable Automation Barrier**: `executeAutomationController` and Playwright verified executor enforce `verifySubmissionLock` before launching browser execution.

---

## 6. Canonical Contract: `application-review.json` (v2.0.0)

Registered in `shared/schemas/index.json` and validated across frontend, backend, and Python:
- `schemaVersion`: `"2.0.0"`
- `reviewId`: string
- `applicationId`: string
- `userId`: string
- `status`: `PENDING_REVIEW` | `READY_FOR_CONFIRMATION` | `CONFIRMED` | `LOCKED` | `MUTATED_INVALIDATED` | `HAS_CONFLICTS` | `INCOMPLETE`
- `fields`: Array of `ReviewField` (key, label, value, source, sourceDetails, confidence, validation, status, isRequired, isMissing, conflict)
- `summary`: Object (totalFields, verifiedFields, missingRequired, missingOptional, conflictsCount, needsConfirmationCount, canConfirm)
- `confirmation`: Object or null (confirmationId, token, fieldStateHash, confirmedAt, confirmedBy, isLocked)

---

## 7. Test Suite Coverage

Validated in `backend/tests/application-review.test.js` (10/10 tests passed):

| Test Category | Invariant Verified | Outcome |
| :--- | :--- | :---: |
| **Review Rendering** | Fields correctly render Value, Source, Confidence, Validation, Status; canonical v2.0.0 validation passed | **PASSED** |
| **Conflict Resolution** | Detects conflicting records, displays both options with sources, unblocks upon user resolution | **PASSED** |
| **Confirmation** | Issues HMAC-signed token bound to deterministic SHA-256 field state hash | **PASSED** |
| **Post-Confirmation Mutation** | Invalidates token upon value changes; strictly rejects AI updates to confirmed values | **PASSED** |
| **Submission Lock** | Blocks execution if unconfirmed or mutated; approves only when token matches live form state | **PASSED** |
