# Applier 2.0 — Phase 5: Semantic Page Understanding Architecture

## 1. Overview & Objective

Phase 5 establishes the **Semantic Page Understanding** layer across both the Python AI Service (`ai-service/`) and the Browser Worker subsystem (`browser-worker/semantic/`).

### Core Principle: Pure Semantics, Zero Execution Selectors
The fundamental responsibility of Phase 5 is to understand **WHAT** a page and its constituent elements represent in domain terms (e.g. personal details, academic scores, parentage, credentials) **WITHOUT** determining browser execution selectors (CSS, XPath, text coordinates) or synthesizing execution actions.

```
Live DOM → [Phase 4: BrowserObservation] → [Phase 5: SemanticPageModel] → [Phase 6: Execution Planner]
                                              ↑ Pure Semantics Only
                                              ✗ NO CSS / XPath selectors
                                              ✗ NO Execution Actions
```

---

## 2. Canonical Contract Layer

The contract is codified in `shared/schemas/semantic-page-model.json` (`v2.0.0`) and validated via `validateSemanticPageModel`:

```json
{
  "schemaVersion": "2.0.0",
  "modelId": "sem_7a599184-e3f4-4cb1-807d-944743c3aa4e",
  "observationId": "obs_sample_01",
  "url": "https://scholarship.gov.in/apply/fresh",
  "pageType": "APPLICATION_FORM",
  "pageTypeConfidence": 0.89,
  "pageTypeReason": "Multi-field form detected with 8 interactive input controls.",
  "fields": [
    {
      "elementId": "elem_1",
      "semanticType": "applicant.fullName",
      "confidence": 0.95,
      "reason": "Field text/label explicitly indicates applicant official name.",
      "isResolved": true
    },
    {
      "elementId": "elem_2",
      "semanticType": "applicant.fatherName",
      "confidence": 0.95,
      "reason": "Field specifically references father or guardian name.",
      "isResolved": true
    },
    {
      "elementId": "elem_amb_1",
      "semanticType": "applicant.fullName",
      "confidence": 0.50,
      "reason": "Ambiguous matching cue ('Code ref'). Kept unresolved to prevent incorrect mapping.",
      "isResolved": false
    }
  ],
  "summary": "Semantic model for APPLICATION_FORM page. Total fields: 8, Resolved: 8.",
  "metadata": {
    "analyzedAt": "2026-10-03T12:00:00.000Z",
    "durationMs": 4.2,
    "cached": false,
    "modelUsed": "semantic-engine-v2",
    "fieldCount": 8,
    "resolvedCount": 8
  }
}
```

---

## 3. Directory Structure & Subsystem Implementation

```
shared/
├── schemas/semantic-page-model.json       # Canonical JSON Schema (Draft 2020-12)
├── fixtures/valid/semantic-page-model.valid.json # Verified valid fixture
└── validators/index.js                    # validateSemanticPageModel validator

ai-service/
├── core/models.py                         # SemanticField & SemanticPageModel Pydantic v2 models
├── core/orchestrator.py                   # "understand_page" intent registration
├── agents/semantic_understanding_agent.py # High-speed semantic analyzer with state hash cache
└── tests/test_semantic_understanding.py   # 6 comprehensive pytest verification suites

browser-worker/
├── semantic/
│   ├── semantic-page-analyzer.js          # Deterministic Node.js analyzer with state hash cache
│   └── index.js                           # Barrel export (SemanticPageAnalyzer, PAGE_TYPES)
├── browser/
│   ├── session-manager.js                 # session.understandPage() integration
│   └── index.js                           # Export barrel
└── package.json                           # "./semantic" subpath export

backend/
└── tests/semantic.test.js                 # 7 Jest test scenarios
```

---

## 4. Page Type Classification

The classifier categorizes pages into canonical categories:

| Page Type | Detection Criteria | Typical Confidence |
| :--- | :--- | :--- |
| `CAPTCHA` | Presence of CAPTCHA widgets (recaptcha, hcaptcha, audio challenge) | `0.95` |
| `OTP` | One-time password inputs, SMS/email verification token fields | `0.94` |
| `DOCUMENT_UPLOAD` | File upload inputs (`input[type="file"]`), document attachments | `0.92` |
| `PAYMENT` | Checkout gateways, payment tokens, fee payment indicators | `0.93` |
| `SUCCESS` | Application acknowledgment, submission confirmation, ref IDs | `0.95` |
| `ERROR` | HTTP 404/500 errors, session timeout warnings, validation blocks | `0.90` |
| `LOGIN` | Credentials (password input) without signup triggers | `0.91` |
| `REGISTRATION` | Account creation with password and signup cues | `0.92` |
| `REVIEW` | Summary table, read-only verification before final submit | `0.88` |
| `APPLICATION_FORM`| Multiple profile data inputs (`input`, `select`, `textarea`) | `0.89` |
| `LANDING` | Root portal, home pages, scheme introductory pages | `0.75` |
| `UNKNOWN` | No distinctive classification markers | `0.40` |

---

## 5. Field Semantics & Evidence-Based Mapping

Supported canonical types:
- `applicant.fullName`
- `applicant.dateOfBirth`
- `applicant.gender`
- `applicant.email`
- `applicant.phone`
- `applicant.address`
- `applicant.fatherName`
- `applicant.motherName`
- `education.college`
- `education.degree`
- `education.cgpa`
- `financial.income`
- `document.identity`
- `auth.password`
- `UNKNOWN_FIELD`

### Confidence & Ambiguity Rules
1. **Evidence & Reason**: Every mapped field includes the exact linguistic cue or DOM attribute that triggered the classification.
2. **Ambiguity Guard**: Cues that match generic words (such as `code`, `ref`, `temp`, `id`, `value`, `data`, `item`) or have fewer than 3 characters have their confidence capped at `0.50` and are strictly set to `isResolved: false`.
3. **Action Widgets**: Non-input elements (e.g. submit buttons, links, cancel triggers) are mapped to `UNKNOWN_FIELD` with `confidence: 0.30` and `isResolved: false`.
4. **Resolution Threshold**: A field is marked `isResolved: true` **if and only if** `confidence >= 0.70` and no ambiguity markers are present.

---

## 6. Deterministic Caching

To prevent redundant LLM invocations and heavy processing on repeated observations of the same page state, both Python and Node.js analyzers implement SHA-256 state hashing:

$$\text{StateHash} = \text{SHA-256}\left(\text{URL} + \text{":::"} + \text{SortedElementSignatures}\right)$$

Where each element signature consists of:
$$\text{elementId} \mid \text{tag} \mid \text{name} \mid \text{label} \mid \text{placeholder}$$

- Identical observations return from cache in `< 5ms` with `metadata.cached: true`.
- Dynamic mutations or DOM updates alter the hash, cleanly triggering a fresh analysis.

---

## 7. Verification & Safety Baseline

### Verification Results

1. **Python AI Service (`ai-service/`)**:
   - `test_semantic_understanding.py`: 6 / 6 passed.
   - Entire test suite: **40 / 40 passed**.
2. **Node.js Backend & Browser Worker (`backend/`)**:
   - `tests/semantic.test.js`: 7 / 7 passed.
   - Entire test suite: **87 / 87 passed** across 12 test suites.
3. **Frontend (`frontend/`)**:
   - Vite production build: Clean compile in `940ms`.

### Contract & Safety Assertions
- `validateSemanticPageModel` strictly passes on all outputs.
- No field in `SemanticPageModel` contains `selector`, `xpath`, or `action` properties.
- Low-confidence and ambiguous fields are never prematurely resolved.
