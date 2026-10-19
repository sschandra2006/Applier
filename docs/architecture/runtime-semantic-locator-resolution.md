# Applier 2.0 — Phase 9: Runtime Semantic Locator Resolution

## 1. Overview & Objective

Phase 9 implements the **Runtime Semantic Locator Resolution Engine**, discarding fragile, auto-generated CSS selectors and brittle absolute XPaths as the primary identity of web form elements.

In Applier 2.0, automation workflows specify high-level **Semantic Targets** (e.g. `applicant.fullName`, `contact.email`, `applicant.dateOfBirth`). The runtime resolver queries the live Playwright browser context (`Page` or `Frame`), evaluating a strict 9-tier hierarchy of locator strategies from highest accessibility semantics down to contextual fallbacks.

```
+───────────────────────────────────────────────────────────────────────────────+
│                           SEMANTIC TARGET REQUEST                             │
│                  target: "applicant.fullName", value: "Rahul Kumar"           │
+───────────────────────────────────────────────────────────────────────────────+
                                        │
                                        ▼
+───────────────────────────────────────────────────────────────────────────────+
│                    9-TIER RESOLUTION PRIORITY HIERARCHY                       │
│                                                                               │
│  [1] ACCESSIBLE_ROLE_NAME  ───► getByRole(role, { name: regex })  (Conf: 0.99) │
│  [2] LABEL                 ───► getByLabel(regex)                 (Conf: 0.95) │
│  [3] SEMANTIC_RELATIONSHIP ───► fieldset:has-text(...) >> input   (Conf: 0.90) │
│  [4] PLACEHOLDER           ───► getByPlaceholder(regex)           (Conf: 0.85) │
│  [5] NAME                  ───► [name="fullname"]                 (Conf: 0.80) │
│  [6] STABLE_TEST_ID        ───► [data-testid="applicant-fullname"](Conf: 0.95) │
│  [7] STABLE_DOM_ATTRIBUTES ───► [autocomplete="name"]             (Conf: 0.85) │
│  [8] CSS                   ───► Resilient structural CSS          (Conf: 0.70) │
│  [9] XPATH                 ───► Contextual relative XPath         (Conf: 0.60) │
+───────────────────────────────────────────────────────────────────────────────+
                   │                                          │
             Element Found                              All Exhausted
                   ▼                                          ▼
+──────────────────────────────────────+   +────────────────────────────────────+
│          RESOLVED LOCATOR            │   │      STRICT FAILURE BARRIER        │
│ • live element handle                │   │ • found: false                     │
│ • strategy: ACCESSIBLE_ROLE_NAME     │   │ • strategy: "LOCATOR_NOT_FOUND"    │
│ • confidence: 0.99                   │   │ • confidence: 0.0                  │
│ • framePath: "kyc-frame" (or null)   │   │ • error: "LOCATOR_NOT_FOUND"       │
│ • metadata: { role, boundingBox... } │   │ • NO GUESSING SILENTLY             │
+──────────────────────────────────────+   +────────────────────────────────────+
```

---

## 2. Strict Resolution Order (Strongest to Weakest)

The engine resolves targets in strict descending order of semantic stability. The resolver stops immediately at the first interactive, visible match:

| Priority | Strategy | Implementation / Selector Pattern | Base Confidence | Rationale |
| :---: | :--- | :--- | :---: | :--- |
| **1** | **`ACCESSIBLE_ROLE_NAME`** | `page.getByRole(role, { name: regex })` | **0.99** | Highest standard. Matches how screen readers and users perceive the UI. Resilient to structural and class refactors. |
| **2** | **`LABEL`** | `page.getByLabel(regex)` or `<label for="...">` | **0.95** | Direct association between human label text and form control. Handles wrapped and associated labels. |
| **3** | **`SEMANTIC_RELATIONSHIP`** | `fieldset:has-text(...) >> input`, container context | **0.90** | Resolves ambiguous fields (e.g. "Name" inside a "Father's Details" fieldset vs "Mother's Details"). |
| **4** | **`PLACEHOLDER`** | `page.getByPlaceholder(regex)` | **0.85** | Helpful user guidance cues (e.g., `DD/MM/YYYY`, `10-digit mobile number`). |
| **5** | **`NAME`** | `input[name="..."]`, `select[name="..."]` | **0.80** | Standard backend form submission keys (`cand_name`, `txt_dob`, `user_email`). |
| **6** | **`STABLE_TEST_ID`** | `[data-testid="..."]`, `[data-cy="..."]`, `[data-test]` | **0.95** | Developer QA hooks explicitly created to guarantee testing stability. |
| **7** | **`STABLE_DOM_ATTRIBUTES`** | `[autocomplete="..."]`, `data-field-type` | **0.85** | Standardized HTML5 browser autofill tokens (`bday`, `tel`, `postal-code`, `name`). |
| **8** | **`CSS`** | Resilient structural CSS (non-dynamic, non-hashed) | **0.70** | Structural selectors without ephemeral class names or dynamic hash IDs. |
| **9** | **`XPATH`** | Relative semantic XPath (e.g., `//label[...]/following::input[1]`) | **0.60** | Contextual traversal. Used **strictly as a last resort**. |

---

## 3. Resolver Output Contract

Every resolution yields a canonical `RuntimeLocator` object conforming to `shared/schemas/runtime-locator.json` (`v2.0.0`):

```json
{
  "schemaVersion": "2.0.0",
  "resolutionId": "res_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "semanticTarget": "applicant.fullName",
  "found": true,
  "strategy": "ACCESSIBLE_ROLE_NAME",
  "confidence": 0.99,
  "evidence": "Matched accessible role \"textbox\" with accessible name matching \"full\\s*name\".",
  "selector": "role=textbox[name=/full\\s*name/i]",
  "framePath": null,
  "metadata": {
    "tagName": "INPUT",
    "role": "textbox",
    "inputType": "text",
    "isEditable": true,
    "boundingBox": { "x": 100, "y": 140, "width": 300, "height": 36 }
  },
  "error": null,
  "timestamp": "2026-10-03T23:20:00.000Z"
}
```

### Return Signature
- `element`: The live Playwright `Locator` object ready for actions (`.fill()`, `.click()`, `.evaluate()`).
- `strategy`: The winning strategy from `LocatorStrategy`.
- `confidence`: Calculated confidence score ($0.0 \le c \le 1.0$).
- `evidence`: Human-readable trace explaining the exact attribute, text, or relation that confirmed the element.
- `framePath`: Path to the child iframe if resolved within one, otherwise `null`.
- `metadata`: Live DOM inspection metrics (tag name, ARIA role, input type, bounding box).
- `canonicalPayload`: Validated contract object ready for cross-service events.

---

## 4. Failure Mode & Strict Uncertainty Barrier

When no reliable locator strategy matches the target:

```json
{
  "schemaVersion": "2.0.0",
  "resolutionId": "res_f8e7d6c5-b4a3-2109-8765-43210fedcba9",
  "semanticTarget": "financial.annualIncome",
  "found": false,
  "strategy": "LOCATOR_NOT_FOUND",
  "confidence": 0.0,
  "evidence": "No reliable locator found matching semantic target \"financial.annualIncome\" across all 9 resolution strategies.",
  "selector": null,
  "framePath": null,
  "metadata": null,
  "error": "LOCATOR_NOT_FOUND",
  "timestamp": "2026-10-03T23:20:01.000Z"
}
```

> [!IMPORTANT]
> **Deterministic Safety:** The engine **never guesses silently**. It will never grab the nearest arbitrary `<input>` or click an unconfirmed control. If the target cannot be reliably authenticated through the 9 strategies, resolution fails with `LOCATOR_NOT_FOUND`, triggering an explicit workflow pause or user intervention request.

---

## 5. Verified Scenario Matrix

The engine has been verified against 8 diverse fixture scenarios reproducing real-world enterprise and portal architectures:

| Scenario | Challenge | Winning Strategy | Validation Result |
| :--- | :--- | :---: | :--- |
| **1. Normal Label** | Standard associated `<label for="...">` and `<input>` | `LABEL` | Successfully resolved `applicant.fullName` |
| **2. Different Label** | Non-standard wording ("Candidate's Legal Full Name") | `LABEL` | Successfully matched regex pattern without exact string match |
| **3. Custom Input** | `div[contenteditable="true"][role="textbox"]` | `ACCESSIBLE_ROLE_NAME` | ARIA role + name resolved; input filled via synthetic DOM events |
| **4. Custom Dropdown** | `div[role="combobox"]` with ARIA popup | `ACCESSIBLE_ROLE_NAME` | Successfully identified custom select component |
| **5. React Dynamic Form** | Dynamic state bindings, controlled inputs | `LABEL` | Synthetic change events triggered state updates |
| **6. Dynamic IDs** | Random IDs (`id=":r1:"`, `dyn_guid_4f3a_99`) | `ACCESSIBLE_ROLE_NAME` | Bypassed volatile hash IDs entirely via accessible name |
| **7. Nested Elements** | Shadow wrappers, complex divs, fieldset context | `SEMANTIC_RELATIONSHIP` | Disambiguated fields inside nested fieldset containers |
| **8. Iframe Embedding** | Form rendered within cross-frame `<iframe>` | `LABEL` / `framePath` | Recursively searched `page.frames()`, returning element + `framePath` |

---

## 6. Architecture & File Structure

```
shared/
├── schemas/
│   └── runtime-locator.json            # Canonical v2.0.0 JSON Schema
├── enums/
│   └── index.js                        # LocatorStrategy enum definition
├── fixtures/valid/
│   └── runtime-locator.valid.json      # Reference fixture
└── validators/
    └── index.js                        # validateRuntimeLocator Ajv validator

ai-service/
├── core/
│   └── models.py                       # RuntimeLocatorModel, LocatorStrategyType
└── tests/
    └── test_canonical_contracts.py     # Schema compliance verification

browser-worker/
└── locator/
    ├── index.js                        # Module entrypoint & exports
    ├── fixtures.js                     # 8 Scenario HTML fixtures
    └── runtime-locator.resolver.js     # 9-Strategy priority resolver & fill utility

backend/tests/
├── contract.test.js                    # Schema validation tests
└── runtime-locator.test.js             # 12 Playwright integration tests across all scenarios
```
