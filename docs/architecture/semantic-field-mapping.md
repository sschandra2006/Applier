# Applier 2.0 — Phase 8: Semantic Field Mapping Engine

## 1. Overview & Objective

Phase 8 implements the **Semantic Field Mapping Engine**, establishing a robust bridge between target web form elements (`WebsiteField`), canonical applicant ground truth (`ApplicantKnowledgeGraph`), and traceable verification artifacts (`DocumentEvidence`).

The engine eliminates dependence on exact HTML attribute names (`name="first_name"`, `id="txt_appl_name"`), instead evaluating **10 heterogeneous signals** to identify semantic intent and extract verified values with deterministic safety.

```
+-----------------------------------------------------------------------------------+
| 1. TARGET PORTAL DISCOVERY (WebsiteField)                                         |
|    - HTML inputs, textareas, selects, radios, checkboxes                          |
|    - Extract: label, role, name, placeholder, autocomplete, nearby text, context  |
+-----------------------------------------------------------------------------------+
                                          │
                                          ▼
+-----------------------------------------------------------------------------------+
| 2. MULTI-SIGNAL SCORING ENGINE (10 Signals)                                       |
|    - Label matching & token heuristics      - ARIA Role structural check          |
|    - HTML name/id pattern resolution        - Placeholder hint inspection         |
|    - Autocomplete token alignment           - Container nearby text inspection    |
|    - Semantic context (Section/Fieldset)    - Page context (Application, Login)   |
|    - Field type compatibility enforcement   - Known portal domain dictionary      |
+-----------------------------------------------------------------------------------+
                                          │
                                          ▼
+-----------------------------------------------------------------------------------+
| 3. KNOWLEDGE GRAPH & EVIDENCE RESOLUTION                                          |
|    - Query canonical domain path (e.g. identity.fullName, contact.email)          |
|    - Active conflict inspection (detects FIELD_CONFLICT between documents)        |
|    - Retrieve candidateValue, source, confidence, and evidence reference          |
+-----------------------------------------------------------------------------------+
                                          │
                                          ▼
+-----------------------------------------------------------------------------------+
| 4. STRICT UNCERTAINTY BARRIER & OUTPUT CLASSIFICATION                             |
|    - MATCHED: High confidence (>= 0.80), clean, verified -> isFillable: true      |
|    - AMBIGUOUS: Competing candidates without clear winner -> isFillable: false    |
|    - CONFLICT: Unresolved conflicting evidences -> isFillable: false              |
|    - MISSING: Target identified, but no value in graph -> isFillable: false       |
|    - REQUIRES_USER: CAPTCHA, OTP, low confidence, type mismatch -> isFillable: false|
+-----------------------------------------------------------------------------------+
```

---

## 2. Multi-Signal Scoring System

The engine combines 10 distinct signals rather than relying on any single attribute:

| Signal | Source | Weight / Impact | Rationale |
| :--- | :--- | :--- | :--- |
| **`label`** | Associated `<label>`, `aria-label`, text preceding input | +0.40 | Primary human-visible intent. Normalizes possessives (`Parent's` $\to$ `Parents`). |
| **`role`** | ARIA role (`textbox`, `combobox`, `radio`, `spinbutton`) | Structural | Prevents mapping button/link controls to applicant data fields. |
| **`name`** | HTML `name` or `id` attributes | +0.25 | Evaluates snake_case, camelCase, dot, and kebab-case tokens. |
| **`placeholder`**| Placeholder attribute | +0.15 | Detects format expectations (e.g. `DD/MM/YYYY`, `10-digit mobile`). |
| **`autocomplete`** | Standard HTML5 autocomplete token | +0.35 | Authoritative machine-readable token (e.g. `bday`, `tel`, `email`, `name`). |
| **`nearby text`** | Siblings, helper text, `aria-describedby` | Contextual | Clarifies modifiers (e.g. "alternate contact", "mention father's name"). |
| **`semantic context`** | Section headers (`<h3>`), fieldset `<legend>` | +0.20 boost / -0.30 penalty | Disambiguates common words ("Name" in "Family" $\to$ `family.fatherName`). |
| **`page context`**| Page classification from Phase 5 | Contextual | Distinguishes login forms, application forms, and payment checkpoints. |
| **`field type`** | HTML input type (`text`, `email`, `date`, `file`, etc.) | +0.10 / -0.60 penalty | Enforces type compatibility; severely penalizes mismatches (e.g. file for email). |
| **`known portal knowledge`** | Indian government / exam / university portal dictionary | +0.25 | Recognizes conventions (`cand_name`, `txt_dob`, `f_name`, `m_name`, `tot_cgpa`). |

---

## 3. Output Contract & Status Semantics

Every mapping adheres to the canonical contract `shared/schemas/semantic-field-mapping.json` (`v2.0.0`):

```json
{
  "websiteFieldId": "txt_applicant_name",
  "applicantField": "applicant.fullName",
  "candidateValue": "Rahul Kumar",
  "source": "DOCUMENT",
  "confidence": 0.99,
  "status": "MATCHED",
  "isFillable": true,
  "evidence": "Aadhaar.pdf",
  "documentId": "doc_aadhaar_001",
  "signalsUsed": ["label", "name", "autocomplete", "known_portal_knowledge"],
  "matchReason": "High confidence match across multiple signals, verified in Applicant Knowledge Graph."
}
```

### Classification Statuses:
1. **`MATCHED`**:
   - Single unambiguous target identified with confidence $\ge 0.80$.
   - Verified or clean candidate value retrieved from `ApplicantKnowledgeGraph`.
   - Field types are compatible.
   - **`isFillable: true`**.
2. **`AMBIGUOUS`**:
   - Multiple candidate semantic fields match with competitive scores ($\Delta < 0.15$).
   - Returns candidate alternatives in `alternativeMatches`.
   - **`isFillable: false`** (Never auto-fills).
3. **`MISSING`**:
   - Field is semantically identified (e.g. `financial.bankAccountNumber`), but Applicant Knowledge Graph contains no value.
   - `candidateValue: null`.
   - **`isFillable: false`**.
4. **`CONFLICT`**:
   - Applicant Knowledge Graph has an active unresolved `FIELD_CONFLICT` (e.g. Aadhaar says `14-08-2006` vs Marksheet says `15-08-2006`).
   - Returns competing evidence details in `conflictDetails`.
   - **`isFillable: false`** (Never auto-fills).
5. **`REQUIRES_USER`**:
   - Human-interactive fields (CAPTCHA, OTP, declaration checkboxes).
   - Low-confidence mappings ($< 0.80$).
   - Severe semantic type mismatches (e.g. `file` input labeled `Email`).
   - **`isFillable: false`**.

---

## 4. The Golden Rule of Automated Filling

> **"Never automatically fill AMBIGUOUS, CONFLICT, MISSING, REQUIRES_USER, or LOW_CONFIDENCE fields."**

```javascript
isFillable(mapping) {
  if (mapping.status === 'AMBIGUOUS') return false;
  if (mapping.status === 'CONFLICT') return false;
  if (mapping.status === 'MISSING') return false;
  if (mapping.status === 'REQUIRES_USER') return false;
  if ((mapping.confidence ?? 0) < this.confidenceThreshold) return false;
  return mapping.status === 'MATCHED';
}
```

---

## 5. Directory Structure & Key Files

```
shared/
├── schemas/semantic-field-mapping.json            # Canonical SemanticFieldMapping schema
├── fixtures/valid/semantic-field-mapping.valid.json # Valid reference fixture
├── fixtures/valid/field-mapping-scenarios.fixture.json # 7 canonical test scenarios fixture
├── enums/index.js                                 # MappingStatus enum
├── validators/index.js                            # validateSemanticFieldMapping validator
└── src/index.js                                   # Shared barrel exports

backend/
├── src/mapping/
│   ├── semantic-field-mapping.engine.js           # Multi-Signal SemanticFieldMappingEngine
│   └── index.js                                   # Barrel export
└── tests/
    └── semantic-field-mapping.test.js             # 12 Jest test cases covering all 7+ scenarios

ai-service/
├── core/models.py                                 # Pydantic FieldMappingModel & MappingSetModel
├── agents/semantic_mapping_agent.py               # Python SemanticFieldMappingAgent
└── tests/
    ├── test_canonical_contracts.py                # Schema & fixture validation tests
    └── test_semantic_mapping.py                   # 9 Pytest unit & scenario tests
```

---

## 6. Verification & Test Coverage

### Node.js Backend (`backend/tests/semantic-field-mapping.test.js`)
- **12 / 12 passed**:
  1. `Exact Match`: "Full Name", name "fullName", autocomplete "name" $\to$ `Rahul Kumar` (`MATCHED`, `isFillable: true`, `evidence: Aadhaar.pdf`).
  2. `Synonym`: "Candidate Legal Name", name "cand_name" $\to$ `applicant.fullName` (`MATCHED`, `isFillable: true`).
  3. `Different Wording`: "Parent's / Guardian's Full Name", section context "Family", nearby text "father's official name" $\to$ `family.fatherName` (`MATCHED`, `candidateValue: Suresh Kumar`, `isFillable: true`).
  4. `Missing Data`: "Bank Account Number" $\to$ `financial.bankAccountNumber` (`MISSING`, `candidateValue: null`, `isFillable: false`).
  5. `Conflicting Data`: "Date of Birth" with active conflict (14-08-2006 vs 15-08-2006) $\to$ `CONFLICT` (`isFillable: false`, `conflictDetails` populated).
  6. `Wrong Semantic Type`: File upload input labeled "Email Address" $\to$ `REQUIRES_USER` (`isFillable: false`).
  7. `Low Confidence`: Vague label "Reference Code" $\to$ `REQUIRES_USER` (`confidence < 0.80`, `isFillable: false`).
  8. `Ambiguous Signals`: Competing candidates with close scores $\to$ `AMBIGUOUS` (`isFillable: false`, `alternativeMatches` populated).
  9. `Security Fields`: CAPTCHA & OTP $\to$ `REQUIRES_USER` (`isFillable: false`).
  10. `Page Batch Mapping`: Full page mapping with canonical schema validation.
  11. `The Golden Rule`: Strict assertion that `isFillable` is false for all uncertain / non-matched statuses.

### Full Suite Status
- **Backend Tests**: **117 / 117 passed** across 15 test suites.
- **AI Service Tests**: **58 / 58 passed** (`pytest tests`).
- **Frontend Build**: **Vite build succeeded** in 10.19s.
