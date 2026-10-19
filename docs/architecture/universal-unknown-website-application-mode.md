# Universal Unknown-Website Application Mode
**Applier 2.0 — Phase 20 Architecture Specification**

---

## 1. Executive Overview

The **Universal Unknown-Website Application Mode** is the capstone architectural layer of Applier 2.0. It enables Applier to autonomously, safely, and deterministically complete job, grant, or admissions applications on portals it has never encountered before—without hardcoded website adapters, fragile scraping scripts, or unconstrained internet crawling.

When encountering an unknown website, Applier constructs an adaptive temporary workflow directly from live DOM observation, matches observed fields against the applicant's verified knowledge graph, navigates multi-step forms, handles conditional triggers, attaches required documents from the vault, pauses deterministically for authentication/OTP gates, obtains cryptographic user confirmation, executes actions within strict safety policy constraints, verifies submission using multi-signal receipt extraction, and safely learns a versioned website fingerprint for subsequent runs.

```
USER URL
  ↓
BROWSER OPEN
  ↓
TASK-DIRECTED EXPLORATION
  ↓
APPLICATION ENTRY DETECTION
  ↓
AUTHENTICATION CHECK
  ↓
LIVE OBSERVATION
  ↓
SEMANTIC PAGE UNDERSTANDING
  ↓
FIELD DISCOVERY
  ↓
APPLICANT FIELD MAPPING
  ↓
DOCUMENT EVIDENCE
  ↓
MISSING DATA INTERVIEW
  ↓
VALIDATION
  ↓
USER REVIEW
  ↓
USER CONFIRMATION
  ↓
EXECUTION (OBSERVE -> PLAN -> ACT -> VERIFY)
  ↓
VERIFY
  ↓
RECOVER IF NECESSARY
  ↓
SUBMIT
  ↓
VERIFY SUBMISSION
  ↓
LEARN WEBSITE FINGERPRINT
```

---

## 2. Core Architectural Principles & Invariants

1. **Task-Directed Bounded Exploration (No Unbounded Crawling):**
   Applier never crawls arbitrary links or the wider internet. It explores exclusively the target pages and interaction routes strictly necessary to complete the user's specific application.

2. **Known vs. Unknown Portal Handling:**
   - **Known Website:** Loads the trusted `WebsiteFingerprint`, verifies live state against stored page and field signatures, and adapts gracefully if structural drift is detected.
   - **Unknown Website:** Dynamically synthesizes a temporary workflow from live DOM observation, semantic inference, and applicant knowledge graph mapping.

3. **Absolute Safety Invariant (Never Guess Critical Data):**
   If confidence falls below the strict safety threshold (`< 0.60`) or any required applicant data cannot be verified with high confidence, **AUTOMATION STOPS IMMEDIATELY**. The system halts, pauses into an interactive interview or user review, and requests explicit user clarification. Applier *never guesses* names, identification numbers, addresses, credentials, or answers to critical questions.

4. **Cryptographic Policy Enforcement:**
   AI agents cannot bypass policy. Final submission requires all mandatory fields resolved, zero unresolved conflicts, pre-submission DOM state alignment, and an HMAC-signed `SubmissionConfirmationToken` tied to the specific application ID, user, and field-state hash.

5. **Multi-Signal Verified Submission:**
   Clicking a submit button is never equated with successful submission. Success requires multi-signal corroboration: success page headings, confirmation text, verified application/reference numbers, receipt links, and structural DOM transitions.

6. **Zero Sensitive Data Storage in Fingerprints:**
   Learned fingerprints persist only structural DOM shapes, locator strategies, constraints, and transition sequences. Raw passwords, OTP values, CAPTCHA solutions, and PII are strictly scrubbed prior to persistence.

---

## 3. Detailed Workflow Breakdown

### Phase 1: URL Entry & Known Website Check
The entrypoint receives `targetUrl`, `applicantGraph`, `documentVault`, and `userAnswers`. It extracts the target domain and queries `WebsiteFingerprintService`.
- If an active fingerprint exists (`isKnownWebsite: true`), Applier loads verified locator strategies, page sequence patterns, and upload constraints.
- If no fingerprint exists (`isKnownWebsite: false`), Applier marks the session as an unknown portal and begins live observation.

### Phase 2: Browser Open & Application Entry Detection
The engine launches the Playwright browser session and navigates to the target URL. If on a landing page, it scans for task-directed entry call-to-actions (`Apply Now`, `Start Application`, `Register`, `#btnApply`, etc.) and activates the entry flow.

### Phase 3: Authentication & Checkpoint Gates
The engine inspects the current view for gatekeeper hurdles:
- **Authentication Gate:** If a login wall or account creation is required before accessing the form, the session transitions to `PAUSED_USER_INPUT` with reason `AUTH_REQUIRED`.
- **OTP Checkpoint Gate:** If an OTP or MFA field is detected and `userAnswers.otp` has not yet been supplied, automation pauses with `status: 'PAUSED_OTP'`. Upon receiving the user's OTP, execution resumes cleanly without restarting the application from scratch.

### Phase 4: Live Observation & Semantic Page Understanding
The engine performs a DOM sweep via `page.$$eval`:
- Extracts tags, IDs, names, types, placeholders, associated `<label>` text, ARIA labels, accept filters, required flags, and live visibility (`offsetParent !== null`).
- Analyzes semantic purpose (personal identity, contact info, educational qualifications, professional experience, documents, security tokens).

### Phase 5: Applicant Field Mapping & Document Evidence
Observed fields are correlated against three evidentiary tiers:
1. `userAnswers` (explicit runtime inputs provided by the user).
2. `applicantGraph` (verified graph nodes from the applicant's profile).
3. `documentVault` (verified PDF/DOCX files with document evidence extraction).
Each mapping is assigned a confidence score (`0.00` to `1.00`), provenance source (`APPLICANT_GRAPH`, `USER_ANSWER`, `DOCUMENT_EVIDENCE`), and verification status.

### Phase 6: Missing Data Interview & Validation Barrier
- If any required field lacks a verified value or if the overall mean confidence falls below `0.60`, Applier transitions to `PAUSED_USER_INPUT` (`phase: 'INTERVIEW'`).
- The user is presented with targeted questions for missing or ambiguous fields.

### Phase 7: User Review & Cryptographic Confirmation Token
Before executing mutations on sensitive fields or final submissions, Applier requires explicit user review.
- When confirmed, `ConfirmationTokenService` computes a canonical SHA-256 hash of the alphabetical field-state map.
- Generates an HMAC-signed confirmation token: `<payloadBase64>.<signature>`.
- Any material change to form fields after token issuance invalidates the token, preventing unauthorized execution.

### Phase 8: Execution Loop (Observe → Plan → Act → Verify)
The engine executes mutations sequentially using the multi-step loop:
1. **Visibility & Conditional Handling:** Checks element visibility. If a dependent field is hidden behind a conditional trigger (e.g., "Do you have prior experience?" checkbox), it activates the trigger first, awaits DOM update, and populates the revealed input.
2. **Action Dispatch by Type:**
   - `file`: Resolves appropriate document from `documentVault` and attaches via `setInputFiles`.
   - `select`: Dispatches `selectOption` with normalized value.
   - `checkbox` / `radio`: Dispatches `check()` / `click()`.
   - `text` / `email` / `tel`: Dispatches `fill()`, verifies value against DOM state.
3. **Multi-Page Transitions:** Detects sequential step buttons (`#btnNext`, `Continue to Review`, etc.). If present, clicks the button, monitors page transition events, and iterates to the next form step.

### Phase 9: Verified Submission & Receipt Capture
Once all steps are completed and the submission button is reached:
1. `VerifiedSubmissionEngine.submitAndVerify` verifies the cryptographic confirmation token and duplicate submission guards.
2. Dispatches submission click.
3. Observes post-submission state, extracting headings, confirmation alerts, and URL changes.
4. Scans for application reference numbers using robust multi-pattern and structured ID regexes (e.g., `APP-UNKNOWN-1001`, `REF-MULTI-2002`, `APP-VERIFIED-8008`).
5. Persists receipt evidence and screenshots to MongoDB.

### Phase 10: Website Fingerprint Learning
Upon verified completion:
- If unknown website: Calls `WebsiteFingerprintService.recordFirstVisit()`, persisting candidate locator strategies, structural DOM signatures, page transition paths, and upload constraints.
- If known website: Calls `recordRepeatVisit()`, incrementing confidence, promoting candidate locators to trusted status, and recording verified field mappings.
- The session concludes with `status: 'COMPLETED'` and `phase: 'LEARNED'`.

---

## 4. Contract Specification: `UniversalApplicationSession`

Canonical Schema ID: `https://applier.ai/schemas/universal-application-session.json` (`v2.0.0`)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://applier.ai/schemas/universal-application-session.json",
  "title": "UniversalApplicationSession",
  "type": "object",
  "properties": {
    "schemaVersion": { "type": "string", "const": "2.0.0" },
    "sessionId": { "type": "string", "pattern": "^uas_[a-zA-Z0-9_.-]+$" },
    "userId": { "type": "string" },
    "targetUrl": { "type": "string" },
    "domain": { "type": "string" },
    "isKnownWebsite": { "type": "boolean" },
    "fingerprintId": { "type": ["string", "null"] },
    "phase": {
      "type": "string",
      "enum": [
        "INIT", "EXPLORATION", "ENTRY_DETECTED", "AUTH_CHECKED",
        "OBSERVATION", "SEMANTIC_UNDERSTANDING", "FIELD_MAPPING",
        "DOCUMENT_EVIDENCE", "INTERVIEW", "VALIDATION", "USER_REVIEW",
        "CONFIRMED", "EXECUTING", "VERIFYING", "RECOVERING",
        "SUBMITTED", "SUBMISSION_VERIFIED", "LEARNED", "FAILED",
        "PAUSED_USER_INPUT"
      ]
    },
    "status": {
      "type": "string",
      "enum": ["ACTIVE", "PAUSED_USER_INPUT", "PAUSED_OTP", "COMPLETED", "FAILED"]
    },
    "temporaryWorkflow": { "type": ["object", "null"] },
    "mappedFields": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "fieldId": { "type": "string" },
          "semanticTarget": { "type": "string" },
          "value": { "type": ["string", "number", "boolean", "null"] },
          "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
          "source": { "type": "string" },
          "verified": { "type": "boolean" }
        },
        "required": ["fieldId", "semanticTarget", "confidence"]
      }
    },
    "missingFields": { "type": "array", "items": { "type": "string" } },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
    "requiresUserInput": { "type": "boolean" },
    "confirmationToken": { "type": ["string", "null"] },
    "submissionResult": { "type": ["object", "null"] },
    "learnedFingerprint": { "type": ["object", "null"] },
    "error": { "type": ["string", "null"] }
  },
  "required": [
    "schemaVersion", "sessionId", "userId", "targetUrl", "domain",
    "isKnownWebsite", "phase", "status", "confidence",
    "requiresUserInput", "missingFields", "mappedFields"
  ]
}
```

---

## 5. Verification Matrix: 8 Synthetic Test Scenarios

The test suite in `backend/tests/universal-application.test.js` exercises all 8 synthetic website scenarios plus the safety invariant:

| # | Scenario | Challenge | Architectural Resolution | Test Status |
|---|---|---|---|---|
| 1 | **Unknown Form** | Previously unseen single-page portal with no stored fingerprint | Discovers DOM fields, matches applicant graph, auto-confirms, submits, verifies reference number `APP-UNKNOWN-1001`, persists candidate `WebsiteFingerprint` | **PASS** |
| 2 | **Multi-Page Form** | Multi-step portal with sequential step navigation (`#step1` → `#step2`) | Evaluates step-by-step interactive inputs, navigates via `#btnNext`, discovers Step 2 fields, fills education details, submits, verifies `REF-MULTI-2002` | **PASS** |
| 3 | **Dynamic Form** | Client-side DOM elements rendered dynamically via JavaScript (`setTimeout`) | Dynamically re-observes interactive DOM elements, maps newly injected fields, fills candidate details, submits, verifies `APP-DYNAMIC-3003` | **PASS** |
| 4 | **Conditional Field** | Dependent inputs hidden until trigger element is checked | Detects conditional trigger, activates checkbox (`hasExperience: true`), re-evaluates visibility, populates revealed dependent input (`yearsExperience: 5`), submits `APP-COND-4004` | **PASS** |
| 5 | **Document Upload** | Required resume attachment with `.pdf` constraints | Identifies file input, matches document from `documentVault`, verifies file type, attaches file via Playwright `setInputFiles`, submits `APP-UPLOAD-5005` | **PASS** |
| 6 | **Review Page** | Pre-submission review summary screen requiring user confirmation | Fills initial page, transitions through `#btnNext` to Review screen, validates confirmation token, dispatches final submission, verifies `APP-REVIEW-6006` | **PASS** |
| 7 | **OTP Checkpoint** | Authentication gatekeeper requiring runtime mobile OTP | Pauses automation on Run 1 with `status: 'PAUSED_OTP'` and `requiresUserInput: true`; resumes on Run 2 with `userAnswers.otp`, fills OTP, submits `APP-OTP-7007` | **PASS** |
| 8 | **Final Submission** | Multi-signal verification and receipt capture | Verifies multi-signal confirmation heading, extracted reference number `APP-VERIFIED-8008`, receipt link, and activates learned fingerprint for `portal.enterprise-apply.com` | **PASS** |
| 9 | **Safety Guard** | Obscure form with unknown required security field | Mean confidence drops to `0.25` (< `0.60`), required data unknown; halts immediately with `PAUSED_USER_INPUT`, refuses to guess critical applicant data | **PASS** |

---

## 6. Security & Failure Guarantees

1. **Non-Guessing Policy:**
   Applier refuses to fabricate or interpolate identity values, social security numbers, tax identifiers, exam roll numbers, or unknown security codes. Any unmapped required field immediately triggers `PAUSED_USER_INPUT`.
2. **Duplicate Submission Protection:**
   Existing verified submissions for the same application ID and confirmation URL are locked. Attempting to resubmit produces `SUBMISSION_DUPLICATE_BLOCKED` to protect applicants from double-billing or disqualified submissions.
3. **Receipt Evidence Persistence:**
   Every verified submission records the full URL, page title, confirmation heading, reference number, timestamp, and visual receipt screenshot in the durable MongoDB record.
