# Applier 2.0 — Phase 15: Multi-Level Browser Recovery

## 1. Overview & Objective

Phase 15 implements deterministic and AI-assisted browser recovery for Applier 2.0. Rather than treating failures as binary outcomes that immediately terminate execution or blindly loop, the automation runtime utilizes a tiered, policy-guarded **6-Level Recovery Tree**.

### 1.1 Core Safety Invariant
> [!CAUTION]
> **Data Invariant:** Recovery must **NEVER** modify user data silently.
> If any recovery step attempts to alter the applicant's input value (`action.value !== originalValue`), the runtime immediately throws a `DataInvariantViolation` and halts, ensuring full audit integrity. All recovery records mandate `dataModified: false`.

---

## 2. The 6-Level Recovery Tree

The engine traverses through escalating deterministic strategies before invoking adaptive browser reasoning and human checkpoints:

```
                      Action Failure / Verification Rejection
                                      │
                                      ▼
                        [Level 1: Retry Same Action]
                     (Brief settle & immediate replay)
                                      │
                                      ▼
                           [Level 2: Re-Observe]
                     (DOM settle check, state verify)
                                      │
                                      ▼
                      [Level 3: Re-Resolve Locator]
                  (Semantic target resolution cascade)
                                      │
                                      ▼
                   [Level 4: Adaptive Browser Reasoning]
                  (Overlay dismissal, scroll, Laya/AI)
                                      │
                                      ▼
                   [Level 5: Refresh / Recover Session]
                  (Page reload, session reconstruction)
                                      │
                                      ▼
                     [Level 6: Human Checkpoint (Halt)]
                  (Terminal pause, user review screen)
```

### 2.1 Fast-Path & Contextual Routing
- **Upload Rejection (`UPLOAD_REJECTION`)**: Portal validation rejections (file size, format constraints) cannot be brute-forced; routes directly to **Level 6 (Human Checkpoint)**.
- **Browser Crash (`BROWSER_CRASH`)** / **Session Expired (`SESSION_EXPIRED`)**: Bypasses DOM-bound Levels 1–4, escalating directly to **Level 5 (Session Refresh / Reconstruction)** or Level 6.

---

## 3. Canonical Failure Classes (All 10 Handled)

The engine's `classifyFailure` method maps any Playwright exception, DOM error, or verification failure to one of the 10 canonical failure types:

| Failure Class | Key Triggers & DOM Indicators | Primary Recovery Level | Fallback Protocol |
| :--- | :--- | :--- | :--- |
| **`SELECTOR_FAILURE`** | Invalid CSS syntax, `Failed to execute 'querySelector'`, unescaped characters | **Level 3** (`RE_RESOLVE_LOCATOR`) | Semantic fallback via role, label, or text ID |
| **`ELEMENT_MISSING`** | Element not found in DOM, zero matched nodes, dynamic re-render | **Level 3** (`RE_RESOLVE_LOCATOR`) | Re-resolve via accessible labels; escalate to AI |
| **`TIMEOUT`** | Network lag, animation delay, locator wait exceeded limit | **Level 1** (`RETRY_SAME_ACTION`) | Settle delay; if persistent, Level 5 refresh |
| **`NAVIGATION_FAILURE`** | `net::ERR_`, connection drops, navigation aborted | **Level 5** (`REFRESH_SESSION`) | Page reload / navigation retry |
| **`SESSION_EXPIRED`** | 401/403, CSRF expiry, redirected to login, session timeout | **Level 5** (`REFRESH_SESSION`) | Reload or pause at `OTP`/re-auth checkpoint |
| **`UNEXPECTED_MODAL`** | Cookie banners, promotional dialogs, backdrop pointer intercept | **Level 4** (`ADAPTIVE_REASONING`) | Auto-dismiss dialog or click outside overlay |
| **`VALIDATION_FAILURE`** | Form constraint mismatch, `.is-invalid`, pattern rejected | **Level 6** (`HUMAN_CHECKPOINT`) | Prevent data mutation; halt for applicant confirmation |
| **`UPLOAD_REJECTION`** | File size exceedance, format rejected by portal | **Level 6** (`HUMAN_CHECKPOINT`) | Immediate checkpoint for manual user file review |
| **`PAGE_CHANGED`** | Single Page App route mutation, DOM detached / stale element | **Level 2** (`RE_OBSERVE`) | Re-observe DOM tree, re-resolve target, re-execute |
| **`BROWSER_CRASH`** | Process exit, `TargetClosedError`, connection severed | **Level 5** (`REFRESH_SESSION`) | BrowserManager process reconstruction & session restore |

---

## 4. Loop Avoidance & Maximum Attempts Guard

To guarantee that recovery never enters infinite loops:
1. **Loop Detection (`detectLoop`)**: Tracks strategy history per failure type. If an identical strategy fails twice for the same failure class, the engine marks the strategy as cycled and escalates immediately to the next level.
2. **Strict `maxAttempts` (Default: 6)**: The total recovery steps across all levels cannot exceed `maxAttempts`. When the limit is reached, the engine cleanly halts at **Level 6 (Human Checkpoint)**.

---

## 5. Structured Recovery Logging (`recovery-record.json`)

Every recovery attempt produces an immutable, validated JSON record complying with `shared/schemas/recovery-record.json` (`v2.0.0`):

```json
{
  "schemaVersion": "2.0.0",
  "recoveryId": "rec_3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "timestamp": "2026-10-04T18:15:20.123Z",
  "originalAction": {
    "type": "fill",
    "target": "applicant.fullName",
    "value": "Rahul Kumar",
    "url": "https://portal.gov.in/apply",
    "stepIndex": 2
  },
  "failure": {
    "type": "SELECTOR_FAILURE",
    "message": "Invalid CSS selector: input:invalid-syntax[(@#",
    "evidence": "Selector syntax invalid or unsupported"
  },
  "strategy": "RE_RESOLVE_LOCATOR",
  "result": "SUCCESS",
  "attempt": 1,
  "duration": 42,
  "dataModified": false,
  "details": {
    "resolvedStrategy": "ACCESSIBLE_ROLE_AND_NAME",
    "confidence": 0.95
  }
}
```

### Required Fields
- `originalAction`: Snapshots `type`, `target`, `value`, `url`, `stepIndex`.
- `failure`: Categorized `type`, `message`, `evidence`.
- `strategy`: Canonical recovery level attempted.
- `result`: One of `SUCCESS`, `ESCALATED`, `CHECKPOINT_CREATED`, `ABORTED`.
- `attempt`: Current attempt ordinal index (1-based).
- `duration`: Milliseconds elapsed during recovery step.
- `dataModified`: Must strictly be `false`.

---

## 6. Verification & Test Matrix

The implementation is verified via `backend/tests/multi-level-recovery.test.js` covering all canonical scenarios:

1. **Failure Class 1: Selector Failure** → Recovered via semantic target re-resolution.
2. **Failure Class 2: Element Missing** → Recovered via accessible label resolution.
3. **Failure Class 3: Timeout** → Recovered via settle delay and retry.
4. **Failure Class 4: Navigation Failure** → Recovered via session reload and navigation retry.
5. **Failure Class 5: Session Expired** → Recovered via page refresh and state re-hydration.
6. **Failure Class 6: Unexpected Modal** → Recovered via adaptive modal dismissal.
7. **Failure Class 7: Validation Failure & Data Invariant** → Escalated to Human Checkpoint without silent data mutation.
8. **Data Invariant Tamper Guard** → Throws `DataInvariantViolation` if `action.value` is modified.
9. **Failure Class 8: Upload Rejection** → Directly halts at Human Checkpoint.
10. **Failure Class 9: Page Changed** → Recovered by re-observing DOM and re-resolving locator.
11. **Failure Class 10: Browser Crash** → Reconstructed session via BrowserManager.
12. **Loop Detection** → Automatically breaks repetitive strategy cycles.
13. **Max Attempts Limit** → Strictly halts at `maxAttempts` cleanly.
14. **Canonical Schema Logging** → All recovery records validate against `recovery-record.json`.
