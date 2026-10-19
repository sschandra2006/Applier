# Applier 2.0 — Phase 6: Applicant Knowledge Graph Architecture

## 1. Overview & Objective

Phase 6 establishes the **Applicant Knowledge Graph** as the canonical single source of truth for applicant information across Applier 2.0.

In legacy workflows, applicant information was scattered across fragmented databases, transient interview sessions, and individual document attachments without global provenance or conflict resolution. The Applicant Knowledge Graph formalizes a unified, multi-source graph that tracks atomic properties, extraction confidence, verification status, and historical audit trails.

```
+--------------------+   +---------------------+   +---------------------+
|   User Profile     |   | Verified Documents  |   | Conversational Q&A  |
+--------------------+   +---------------------+   +---------------------+
           \                        |                        /
            \                       |                       /
             v                      v                      v
        +-------------------------------------------------------+
        |            APPLICANT KNOWLEDGE GRAPH                  |
        |  - Provenance Tracking (source, evidence)             |
        |  - Confidence Scoring & Verification Status           |
        |  - Non-Destructive Conflict Detection (FIELD_CONFLICT)|
        |  - Audit History Preservation                         |
        +-------------------------------------------------------+
                                    |
                                    v
        +-------------------------------------------------------+
        |                 INTERVIEW ENGINE                      |
        |  - VERIFIED: Skip field completely                    |
        |  - CONFIRMATION_REQUIRED: Ask for confirmation        |
        |  - CONFLICT: Present conflict to user for choice      |
        |  - UNKNOWN: Ask user standard question                |
        +-------------------------------------------------------+
```

---

## 2. Canonical Model Structure

The model is defined in `shared/schemas/applicant-knowledge-graph.json` (`v2.0.0`) and validated via `validateApplicantKnowledgeGraph`:

### Domain Hierarchy
```
Applicant
├── Identity       (fullName, firstName, lastName, dateOfBirth, gender, aadhaarNumber, panNumber...)
├── Contact        (email, phone, alternatePhone, whatsapp...)
├── Address        (street, city, state, pincode, country...)
├── Education      (college, degree, cgpa, tenthMarks, twelfthMarks, passingYear...)
├── Family         (fatherName, motherName, guardianName, familyAnnualIncome...)
├── Financial      (annualIncome, bankAccountNumber, bankIfsc, bankName...)
├── Preferences    (preferredLanguage, locationPreference...)
├── Documents      (aadhaarCard, panCard, marksheets...)
└── Conflicts      (Active and resolved FIELD_CONFLICT records)
```

### Atomic Knowledge Node Specification
Every property in the graph is represented as a structured node:

| Attribute | Type | Description |
| :--- | :--- | :--- |
| `value` | Any | Atomic value (string, number, boolean, array, object) |
| `source` | Enum | Origin: `PROFILE`, `DOCUMENT`, `USER_INPUT`, `PREVIOUS_APPLICATION`, `SYSTEM_DERIVED` |
| `confidence` | Number | Confidence score between `0.0` and `1.0` |
| `verificationStatus` | Enum | `VERIFIED`, `UNVERIFIED`, `CONFIRMATION_REQUIRED`, `CONFLICT` |
| `updatedAt` | String | ISO 8601 timestamp of last update |
| `evidence` | String | Provenance note, document name, or reasoning |
| `history` | Array | Previous values, source metadata, and transition timestamps |

---

## 3. Conflict Detection & Resolution

### Non-Destructive Conflict Principle
The system **never silently overwrites differing values** from non-user sources.

#### Example Scenario:
1. Date of Birth extracted from **Aadhaar**: `14-08-2006` (confidence `0.98`, status `VERIFIED`).
2. Subsequent Date of Birth extracted from **10th Marksheet**: `15-08-2006` (confidence `0.95`).
3. **Behavior**:
   - The original value `14-08-2006` is retained.
   - The field's status transitions to `CONFLICT`.
   - A `FIELD_CONFLICT` record is registered under `graph.conflicts`:
     ```json
     {
       "conflictId": "conf_dob_01",
       "path": "identity.dateOfBirth",
       "existingValue": {
         "value": "14-08-2006",
         "source": "DOCUMENT",
         "confidence": 0.98
       },
       "conflictingValue": {
         "value": "15-08-2006",
         "source": "DOCUMENT",
         "confidence": 0.95
       },
       "status": "UNRESOLVED",
       "reason": "FIELD_CONFLICT",
       "detectedAt": "2026-10-03T12:00:00.000Z"
     }
     ```

### User Resolution & Corrections
- When the user selects or inputs the correct value (`source: USER_INPUT`), the user input is authoritative:
  1. The previous value and conflict context are archived to node `history`.
  2. The chosen value is set with `confidence: 1.0` and `verificationStatus: VERIFIED`.
  3. The conflict is marked `RESOLVED` with details of the resolving actor.

---

## 4. Conversational Interview Optimization

The interview engine (`backend/src/interview/interview.service.js` and `ai-service/services/interview_ai.py`) checks the Applicant Knowledge Graph before initiating questions:

| Field Graph Status | Interview Action | Experience |
| :--- | :--- | :--- |
| **`VERIFIED`** | **DO NOT ASK** | Automatically pre-fills `state.answers`, omits field from `pendingFields`. Completely skipped. |
| **`CONFIRMATION_REQUIRED`** | **ASK CONFIRMATION** | "We found that your Father's Name is John Doe. Could you please confirm if this is correct?" |
| **`CONFLICT`** | **SHOW CONFLICT** | "⚠️ We found conflicting records for Date of Birth: '14-08-2006' vs '15-08-2006'. Which one is correct?" |
| **`UNKNOWN`** | **ASK USER** | Standard field inquiry using scanned site form labels and dropdown choices. |

---

## 5. Backward Compatibility & Migration Safety

Existing user profile data (`Profile` Mongoose model) migrates cleanly and safely:
- Existing `Profile` schema fields are preserved without deletion.
- `importProfile(graph, profile)` non-destructively populates `identity`, `contact`, and `address` domains in the Knowledge Graph with `source: PROFILE`.
- If an applicant starts an application without an existing graph, the system automatically hydrates the graph from their profile on the fly.

---

## 6. Directory Structure & Key Files

```
shared/
├── schemas/applicant-knowledge-graph.json        # Canonical JSON Schema
├── fixtures/valid/applicant-knowledge-graph.valid.json # Valid reference fixture
├── enums/index.js                                # KnowledgeSourceType, KnowledgeVerificationStatus
└── validators/index.js                           # validateApplicantKnowledgeGraph

backend/
├── src/knowledge/
│   ├── knowledge-graph.model.js                  # Mongoose persistent schema
│   ├── knowledge-graph.service.js                # Core knowledge graph service & conflict manager
│   └── index.js                                  # Barrel export
├── src/interview/
│   └── interview.service.js                      # Interview engine integration
└── tests/
    └── knowledge-graph.test.js                   # 7 comprehensive Jest test scenarios

ai-service/
├── core/models.py                                # KnowledgeNode, FieldConflict, ApplicantKnowledgeGraph
├── services/interview_ai.py                      # Confirmation & conflict prompt rules
└── tests/
    ├── test_canonical_contracts.py               # Schema catalog & fixture test
    └── test_knowledge_graph.py                   # 3 pytest test suites
```

---

## 7. Verification & Safety Baseline

- **Node.js Backend**: `tests/knowledge-graph.test.js` (7 / 7 passed).
- **Python AI Service**: `test_knowledge_graph.py` (3 / 3 passed), `test_canonical_contracts.py` (19 / 19 passed).
- **Full Python Test Suite**: **44 / 44 passed**.
- All generated graphs validated against `validateApplicantKnowledgeGraph`.
