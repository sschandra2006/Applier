# Applier 2.0 — Phase 12: Browser Action Policy and Submission Safety

## 1. Overview & Objective

Phase 12 establishes a deterministic, non-bypassable **Action Policy & Submission Safety Layer** that sits strictly between AI/adaptive reasoning engines and low-level Playwright execution:

```
+─────────────────────────────────────────────────────────────────────────────────+
|                                POLICY MEDIATION                                 |
|                                                                                 |
|   [AI / Adaptive Engine]                                                        |
|   (Proposes next action or plan step)                                           |
|              │                                                                  |
|              ▼                                                                  |
|   [Policy Evaluation Gate] ◄─── (ActionPolicyEngine & ConfirmationTokenService) |
|              │                                                                  |
|        Passed│   Blocked (Violation)                                            |
|              ├───► [HALT EXECUTION] (Emit diagnostic report & token state)       |
|              ▼                                                                  |
|   [Playwright Executor]                                                         |
|   (Deterministic browser execution)                                             |
|              │                                                                  |
|              ▼                                                                  |
|   [Verification Engine]                                                         |
|   (Post-action DOM verification & state update)                                 |
+─────────────────────────────────────────────────────────────────────────────────+
```

### Core Axioms
1. **AI Cannot Bypass Policy**: No model output, heuristic proposal, or adaptive recovery strategy can trigger browser actions without explicit policy clearance.
2. **Deterministic Risk Tiers**: All interactions are classified into strict risk tiers before execution.
3. **Five-Point Submission Barrier**: Final form submission or payment execution requires satisfaction of five independent safety criteria.
4. **Token Invalidation on Mutation**: Confirmation tokens are bound cryptographically to the exact form field state; any subsequent alteration immediately and irreversibly invalidates the token.

---

## 2. Action Risk Categories

Every candidate action is categorized by `ActionPolicyEngine.classifyAction(action, context)` into one of four risk categories:

| Risk Category | Action Types / Targets | Evaluation Rules & Requirements |
| :--- | :--- | :--- |
| **`LOW_RISK`** | `read`, `observe`, `screenshot` | Always permitted. Read-only interactions that do not mutate DOM state or transmit data. |
| **`NORMAL`** | Standard `fill`, `select`, `upload`, `navigate` | Permitted provided values are non-null and target URLs adhere to safe protocols (`http:`, `https:`). Unsafe schemes (`javascript:`, `vbscript:`) are blocked. |
| **`SENSITIVE`** | Account credentials (`password`, `auth_token`), Financial fields (`financial.*`, `salary`, `bankAccount`, `card_number`), Identity fields (`identity.*`, `aadhaar`, `pan`, `passport`, `ssn`) | Requires mapping confidence $\ge 0.85$ and zero unresolved conflicts in the Applicant Knowledge Graph (`KnowledgeVerificationStatus !== CONFLICT`). |
| **`CRITICAL`** | Form submissions (`type: submit`, `isFinalSubmission: true`, `final_submit`), Payments (`payment`, `pay_now`), Final confirmations | Requires all five submission safety criteria to be satisfied. |

---

## 3. The Five-Point Submission Safety Criteria

For any `CRITICAL` action, the policy evaluates the following five prerequisites sequentially:

```
                          CRITICAL ACTION PROPOSED
                                     │
                                     ▼
                [1] All Required Fields Resolved?
                       ├── NO ──► Block: UNRESOLVED_REQUIRED_FIELDS
                       └── YES
                                     │
                                     ▼
                [2] Form Validation Passed Cleanly?
                       ├── NO ──► Block: VALIDATION_FAILED
                       └── YES
                                     │
                                     ▼
                [3] Knowledge Graph Free of Active Conflicts?
                       ├── NO ──► Block: UNRESOLVED_CONFLICT
                       └── YES
                                     │
                                     ▼
                [4] Valid User Confirmation Token Provided?
                       ├── NO ──► Block: MISSING_USER_CONFIRMATION
                       └── YES
                                     │
                                     ▼
                [4b] Form Hash Matches Token State Exactly?
                       ├── NO ──► Invalidate Token & Block: FORM_MUTATED_AFTER_CONFIRMATION
                       └── YES
                                     │
                                     ▼
                [5] Page State Matches Expected Submission State?
                       ├── NO ──► Block: PAGE_STATE_MISMATCH
                       └── YES
                                     │
                                     ▼
                        [ACTION APPROVED / ALLOWED]
```

1. **All Required Fields Resolved**:
   - `context.requiredFields` are inspected against current field state / answers.
   - Any missing, null, or empty string values halt execution with `UNRESOLVED_REQUIRED_FIELDS`.
2. **Form Validation Passed**:
   - Live DOM verification must confirm absence of `.invalid-feedback`, `aria-invalid="true"`, or portal alert banners.
   - Any outstanding validation errors halt execution with `VALIDATION_FAILED`.
3. **No Unresolved Conflicts**:
   - Applicant Knowledge Graph verification status must not be `CONFLICT`.
   - Discrepancies between extracted document evidence and profile truth halt execution with `UNRESOLVED_CONFLICT`.
4. **Explicit User Confirmation & Cryptographic Token Verification**:
   - A signed confirmation token must be presented in `context.confirmationToken`.
   - The token signature is verified against application secret and timestamp expiration.
   - The current field state hash is recomputed and compared against the token's bound `fieldStateHash`. If mismatched, the token is permanently flagged as `INVALIDATED`.
5. **Page State Consistency**:
   - Current page state (`context.currentPageState` / `pageType`) must match expected target state (e.g., `APPLICATION_FORM` or `REVIEW`).
   - Prevents submissions triggered on incorrect steps, error overlays, or landing pages.

---

## 4. Cryptographic Confirmation Token Architecture

The `ConfirmationTokenService` guarantees non-repudiation and prevents stale confirmations through HMAC-SHA256 signatures and deterministic state hashing.

### 4.1 Deterministic Field State Hashing
To detect any subtle form modification after user confirmation:
1. Field state keys are sorted alphabetically.
2. Values are normalized to trimmed strings (or JSON representations for complex structures).
3. Canonical key-value pairs are serialized deterministically and hashed using SHA-256:
   $$\text{fieldStateHash} = \text{SHA256}\left(\sum_{k \in \text{sorted}(K)} k + \text{":"} + \text{val}(k) + \text{";"}\right)$$

### 4.2 Token Payload & Signature
```json
{
  "schemaVersion": "2.0.0",
  "tokenId": "tok_9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "applicationId": "app_2026_scholarship_01",
  "userId": "usr_987654",
  "workflowVersion": "2.0.0",
  "fieldStateHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "status": "ISSUED",
  "expiresAt": "2026-10-04T12:30:00.000Z",
  "signature": "hmac_sha256_signature_hex"
}
```

### 4.3 Form Mutation Invalidation
If a form field is modified after the user issues confirmation:
1. Verification re-computes `currentHash` across the active DOM/field state.
2. `currentHash !== token.fieldStateHash` triggers immediate invalidation.
3. Token status transitions to `INVALIDATED`.
4. Reason code is recorded as `FORM_MUTATED_AFTER_CONFIRMATION`.
5. Further submission attempts with this token are blocked permanently until a new confirmation is explicitly authorized by the user.

---

## 5. Canonical Contracts

Two canonical JSON schemas (`v2.0.0`) formalize safety decisions and confirmation tokens:

### 5.1 `shared/schemas/action-policy.json`
Specifies the policy evaluation output:
- `schemaVersion`: `"2.0.0"`
- `evaluationId`: UUID with `pol_` prefix
- `actionType`: Proposed action name
- `riskCategory`: `LOW_RISK` | `NORMAL` | `SENSITIVE` | `CRITICAL`
- `decision`: `ALLOWED` | `BLOCKED` | `REQUIRE_CONFIRMATION` | `ESCALATE`
- `allowed`: Boolean clearance flag
- `violationCode`: Optional enum (`MISSING_USER_CONFIRMATION`, `FORM_MUTATED_AFTER_CONFIRMATION`, `LOW_CONFIDENCE_FIELD`, `UNRESOLVED_CONFLICT`, `UNRESOLVED_REQUIRED_FIELDS`, `PAGE_STATE_MISMATCH`, `UNSAFE_PROTOCOL`)
- `reason`: Human-readable justification
- `confidence`: Numeric score (0.0 – 1.0)
- `fieldStateHash`: Deterministic hash if evaluated

### 5.2 `shared/schemas/submission-confirmation.json`
Specifies the confirmation token structure:
- `schemaVersion`: `"2.0.0"`
- `tokenId`: UUID with `tok_` prefix
- `applicationId`: Portal application reference
- `userId`: User issuing confirmation
- `workflowVersion`: Execution version
- `fieldStateHash`: SHA-256 hash of form state at confirmation time
- `status`: `ISSUED` | `USED` | `EXPIRED` | `INVALIDATED`
- `signature`: Cryptographic HMAC-SHA256 signature
- `expiresAt`: ISO 8601 timestamp

Both schemas are integrated across the shared contract validator, Python Pydantic models (`SubmissionConfirmationModel`, `ActionPolicyModel`), and Jest test fixtures.

---

## 6. Execution Loop Integration

In `browser-worker/execution/verified-execution.engine.js`, Step 3 of the 7-stage loop evaluates every planned action:

```javascript
// Step 3: POLICY CHECK
const policyResult = this.policyEngine.evaluateAction({
  action: plannedAction,
  context: {
    ...context,
    applicationId: this.applicationId,
    fieldState: answers,
    confirmationToken: context.confirmationToken
  }
});

if (!policyResult.allowed) {
  return {
    status: ExecutionStatus.BLOCKED_BY_POLICY,
    violation: policyResult.violationCode,
    reason: policyResult.reason
  };
}
```

---

## 7. Verification & Test Suite Coverage

The test suite in `backend/tests/action-policy.test.js` exercises all critical policy invariants:

1. **Attempt Submission Without Confirmation**:
   - Result: Blocked with `MISSING_USER_CONFIRMATION`.
2. **Attempt Submission After Form Mutation**:
   - Token generated with initial answers; a field is then altered.
   - Result: Blocked with `FORM_MUTATED_AFTER_CONFIRMATION`, token invalidated.
3. **Attempt Low-Confidence Field Execution**:
   - Sensitive identity field (`identity.aadhaar`) evaluated with confidence `0.65 < 0.85`.
   - Result: Blocked with `LOW_CONFIDENCE_FIELD`.
4. **Attempt Execution with Unresolved Conflict**:
   - Financial field (`financial.income`) flagged with `KnowledgeVerificationStatus.CONFLICT`.
   - Result: Blocked with `UNRESOLVED_CONFLICT`.
5. **Attempt Submission with Page State Mismatch**:
   - Expected `APPLICATION_FORM`, current page is `LANDING`.
   - Result: Blocked with `PAGE_STATE_MISMATCH`.
6. **Legitimate Verified Submission**:
   - All five prerequisites satisfied; valid HMAC token matching form state.
   - Result: Approved (`ALLOWED`).
