# Applier 2.0 — Phase 10: Observe → Plan → Act → Verify Execution Engine

## 1. Overview & Objective

Phase 10 replaces legacy static batch automation ("execute the entire plan blindly") with an **Incremental Verified Execution Engine**.

In previous versions, a sequence of Playwright actions would run without inspecting intermediate DOM states, silently overlooking form validation rejections, input masking discrepancies, or dynamic element re-renders. In Applier 2.0, every single action operates inside a strict **7-stage verified execution loop**:

```
+───────────────────────────────────────────────────────────────────────────────+
│                                  THE EXECUTION LOOP                           │
│                                                                               │
│         [1] OBSERVE ──────────► Capture DOM state, URL, alerts, and hash     │
│              │                                                                │
│              ▼                                                                │
│         [2] PLAN NEXT ACTION ─► Hydrate answers & resolve semantic targets    │
│              │                                                                │
│              ▼                                                                │
│         [3] POLICY CHECK ─────► Validate safety, protocols & intervention gate│
│              │                                                                │
│              ▼                                                                │
│         [4] ACT ──────────────► Execute Playwright action (navigate, fill...) │
│              │                                                                │
│              ▼                                                                │
│         [5] VERIFY ───────────► Post-action verification (read value, alerts) │
│              │                                                                │
│        Passed│   Failed                                                       │
│              ├───► [RECOVERY] ─► Clear & retype / Re-resolve locator / Adapt  │
│              ▼           │                                                    │
│         [6] UPDATE STATE ◄┘ (if recovered, else STOP)                         │
│              │                                                                │
│              ▼                                                                │
│         [7] CHECKPOINT ───────► Persist serializable state at safe points     │
│              │                                                                │
│              └───► OBSERVE AGAIN (Next Step)                                  │
+───────────────────────────────────────────────────────────────────────────────+
```

---

## 2. Supported Actions (All Preserved)

All existing automation actions are supported without removal:

| Action | Execution Method | Verification Target |
| :--- | :--- | :--- |
| **`navigate`** | `page.goto(url, { waitUntil: 'domcontentloaded' })` | URL matches target; no HTTP error or `net::ERR_` pages |
| **`fill`** | Semantic resolver (`resolveAndFill`) or Playwright `.fill()` | Read value matches expected; no `.invalid-feedback` or `aria-invalid` |
| **`select`** | `selectOptionRobust` (native `<select>`, Select2, ARIA combobox) | Selected option value or label matches target choice |
| **`upload`** | `page.setInputFiles(selector, filePath)` | Files attached in element; no portal upload rejection alerts in DOM |
| **`click`** | Semantic locator or `page.click(selector)` | Expected state transition confirmed (URL change, modal open, clean state) |
| **`pause`** | Capture screenshots; trigger user intervention callback | Checkpoint saved; status transitioned to `PAUSED_OTP` / `PAUSED_CAPTCHA` |
| **`screenshot`** | `page.screenshot({ fullPage: true })` | Base64 image payload verified non-empty |

---

## 3. Post-Action Verification Specifications

Execution never assumes that a Playwright call succeeded; it inspects the live DOM:

### 3.1 Fill Verification
1. Reads `node.value` (for standard inputs/textareas) or `node.textContent` (for `contenteditable` / custom textboxes).
2. Performs equality check against expected value.
3. Inspects element and parent wrappers for form validation errors:
   - `aria-invalid="true"`
   - `.is-invalid` or `.has-error` class names
   - Visible `.invalid-feedback`, `.error-message`, or `[role="alert"]` siblings.
4. If invalid: fails with `VALIDATION_ERROR` or `FILL_VALUE_MISMATCH`.

### 3.2 Select Verification
1. Reads selected option value and text content from `<select>` or `role="combobox"`.
2. Verifies substring/exact match against the requested value.
3. If not matched: fails with `SELECT_OPTION_MISMATCH`.

### 3.3 Upload Verification
1. Reads `node.files` collection from input element to verify files are attached.
2. Scans DOM for upload rejection error alerts:
   - "File size exceeds limit", "Invalid file type", "File rejected", "Disallowed format".
3. If rejection detected: fails with `UPLOAD_REJECTED` (marked non-retryable).

### 3.4 Click Verification
1. If `expectedUrl` specified: checks URL transition.
2. If `expectedSelector` specified: verifies appearance of target element.
3. Scans DOM for submission error banners (`[role="alert"].error`, `.fatal-error`).

### 3.5 Navigate Verification
1. Verifies that page did not land on `net::ERR_`, 404, or unhandled browser error page.
2. Verifies `document.readyState` is interactive/complete.

---

## 4. Failure Protocol & Recovery Engine

> [!IMPORTANT]
> **Deterministic Safety Barrier:** If verification fails, the engine **never blindly continues** to the next step. It sends the failure directly to the `RecoveryHandler`.

```
                    VERIFICATION FAILED
                            │
                            ▼
               Error Type Classification
         ┌──────────────────┼──────────────────┐
         │                  │                  │
FILL_VALUE_MISMATCH     DOM_CHANGED      VALIDATION_ERROR
         │                  │                  │
         ▼                  ▼                  ▼
  [Recovery A]        [Recovery B]        [Recovery C]
Clear & re-type     Re-observe DOM &    Normalize format
with delay, or      Re-resolve target   (strip dashes,
direct DOM event    via Phase 9         trim spaces)
dispatch            semantic locator          │
         │                  │                 │
         └──────────────────┼─────────────────┘
                            │
               Re-verify via ActionVerifier
               ┌────────────┴────────────┐
               ▼                         ▼
            PASSED                    FAILED
        (Status: RECOVERED)     (Status: FAILED)
        Continue to next step   STOP EXECUTION
```

### Recovery Strategies
- **`CLEAR_AND_RETYPE`**: Focuses, selects all text, backspaces, and re-types with sequential delay (handles reactive masked inputs).
- **`DOM_DISPATCH`**: Sets value directly on element property and dispatches synthetic `input`, `change`, and `blur` events (bypasses complex virtual DOM event traps).
- **`RE_RESOLVE_LOCATOR`**: Re-observes the page and queries `RuntimeLocatorResolver` from Phase 9 to locate relocated elements.
- **`ADAPT_VALUE_FORMAT`**: Cleans and normalizes phone numbers or dates when validation errors indicate format mismatches.
- **`ABORT`**: When retries are exhausted or a portal explicitly rejects an upload (`UPLOAD_REJECTED`), cleanly halts with full diagnostic evidence.

---

## 5. Checkpoint Persistence

After significant actions (`navigate`, `fill`, `select`, `upload`, `pause`), the state controller captures a clean, JSON-serializable checkpoint via `CheckpointManager`:

- `checkpointVersion`: `"2.0.0"`
- `sessionId`: Unique browser session ID
- `url`: Current page URL
- `workflowStep` / `executionStep`: Current step index
- `storageState`: Cookies and origins snapshot
- `checkpointState`: Answers snapshot, job status, verified step count

Checkpoints are verified to be strictly free of circular references and Playwright objects.

---

## 6. Canonical Contract: `action-verification.json`

Every verified step produces a canonical payload conforming to `schemaVersion: 2.0.0`:

```json
{
  "schemaVersion": "2.0.0",
  "verificationId": "ver_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "stepIndex": 1,
  "actionType": "fill",
  "status": "PASSED",
  "target": "applicant.fullName",
  "expected": "Rahul Kumar",
  "actual": "Rahul Kumar",
  "evidence": "Value read from input field '#fullName' matches expected value. No validation errors found.",
  "error": null,
  "recoveryAttempted": false,
  "recoveryOutcome": null,
  "timestamp": "2026-10-03T23:30:00.000Z"
}
```

Registered across:
- `shared/schemas/action-verification.json`
- `shared/enums/index.js` (`ActionVerificationStatus`, `ExecutionLoopPhase`, `RecoveryStrategy`)
- `shared/validators/index.js` (`validateActionVerification`)
- `ai-service/core/models.py` (`ActionVerificationModel`)
