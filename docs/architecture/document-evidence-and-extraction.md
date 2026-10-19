# Applier 2.0 — Phase 7: Document Evidence and Extraction Architecture

## 1. Overview & Objective

Phase 7 establishes the formal architectural separation between:
1. **Document Processing**: Physical transformation, compression, image resizing, and PDF metadata sanitization.
2. **Document Understanding & Evidence Extraction**: Quality inspection, classification, OCR/vision analysis, and traceable evidence extraction.
3. **Applicant Truth**: The canonical Applicant Knowledge Graph, guarded by strict uncertainty barriers.

```
+-------------------------------------------------------------------------------+
| 1. DOCUMENT PROCESSING (DocumentProcessingEngine)                             |
|    - Buffer validation & format preparation                                   |
|    - Sharp image resizing, compression, grayscale                            |
|    - pdf-lib metadata sanitization & size compliance                          |
+-------------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------------+
| 2. DOCUMENT UNDERSTANDING & EVIDENCE EXTRACTION (DocumentUnderstandingEngine)|
|    - Quality Assessment: blur, crop, missing pages, unreadable text           |
|    - Document Classification: type identification & mismatch detection       |
|    - Field Extraction with Trace Evidence (page, region, rawValue, normalized)|
|    - Internal Document Conflict Detection                                     |
+-------------------------------------------------------------------------------+
                                    |
                                    v  [STRICT UNCERTAINTY BARRIER]
                                    |  (Never automatically verify uncertain extractions)
+-------------------------------------------------------------------------------+
| 3. APPLICANT TRUTH (ApplicantKnowledgeGraph)                                  |
|    - High confidence + clean quality -> VERIFIED candidate                    |
|    - Low confidence / poor quality -> CONFIRMATION_REQUIRED / UNVERIFIED       |
|    - Contradictory values -> FIELD_CONFLICT                                   |
+-------------------------------------------------------------------------------+
```

---

## 2. The End-to-End Pipeline

```
Raw Document
→ Validation (Mime & Size)
→ Quality Assessment (Blur, Crop, Missing Pages, Readability)
→ OCR / Text Extraction
→ Vision & Layout Analysis
→ Document Classification (e.g. AADHAAR, PAN, MARKSHEET)
→ Field Extraction
→ Evidence Generation (DocumentEvidence contract)
→ Normalized Applicant Field
→ Knowledge Graph Ingestion with Uncertainty Barrier
```

---

## 3. Canonical Evidence Model

Defined in `shared/schemas/document-evidence.json` (`v2.0.0`) and validated via `validateDocumentEvidence`:

```json
{
  "schemaVersion": "2.0.0",
  "evidenceId": "evi_test_aadhaar_dob_01",
  "documentId": "doc_test_aadhaar_001",
  "fieldKey": "identity.dateOfBirth",
  "page": 1,
  "region": {
    "x": 120,
    "y": 240,
    "width": 250,
    "height": 45,
    "unit": "pixel"
  },
  "extractionMethod": "OCR",
  "rawValue": "DOB: 14/08/2006",
  "normalizedValue": "14-08-2006",
  "extractedValue": "14-08-2006",
  "confidence": 0.98,
  "timestamp": "2026-10-03T12:00:00.000Z",
  "quality": {
    "isBlurry": false,
    "isCropped": false,
    "isUnreadable": false,
    "missingPages": false,
    "qualityScore": 0.98
  },
  "verifier": "VISION_LLM",
  "verifiedAt": "2026-10-03T12:00:00.000Z"
}
```

---

## 4. Quality Assessment & Flaw Detection

The engine detects physical and optical flaws in uploaded files:

| Quality Flaw | Detection Method | Consequence |
| :--- | :--- | :--- |
| **`blur`** | Image variance / Laplacian edge density inspection | Confidence penalized; flagged `isBlurry: true` |
| **`crop`** | Dimensions $< 100\times 100\text{px}$ or extreme aspect ratio ($> 4.0$ or $< 0.25$) | Flagged `isCropped: true`; prevented from automatic verification |
| **`missingPages`** | `PDFDocument.getPageCount() < expectedPages` | Flagged `missingPages: true`; quality score reduced |
| **`unsupported format`**| Mime-type not in supported list (`PDF`, `JPEG`, `PNG`, `WEBP`) | Direct validation rejection |
| **`unreadable text`** | Extracted characters $< 5$ or alphanumeric density $< 40\%$ | Flagged `isUnreadable: true`; confidence penalized |
| **`conflicting information`** | Multi-page contradictory extractions (e.g. Page 1 DOB $\ne$ Page 2 DOB) | Internal document conflict raised |

---

## 5. Strict Uncertainty Barrier

### The Golden Rule
> **"Never convert an uncertain extraction into a verified applicant value automatically."**

An extraction is permitted to become `VERIFIED` in the Applicant Knowledge Graph **if and only if all** of the following conditions hold:
1. `confidence >= 0.85`
2. `quality.isBlurry === false`
3. `quality.isCropped === false`
4. `quality.isUnreadable === false`
5. Detected document type strictly matches expected upload type.
6. No internal document contradictions exist.

If **any** condition fails:
- The value is ingested as `CONFIRMATION_REQUIRED` or `UNVERIFIED`.
- It remains unverified until the user explicitly confirms or resolves it in the conversational interview.

---

## 6. Supported Document Types

All existing types in the repository are preserved:
- `AADHAAR`
- `PAN`
- `PASSPORT`
- `DRIVING_LICENCE`
- `BIRTH_CERTIFICATE`
- `MARKSHEET` (includes `SSC_MEMO`, `INTERMEDIATE`, `DEGREE`)
- `INCOME_CERTIFICATE` (includes `INCOME_CERT`)
- `CASTE_CERT`
- `RESIDENCE`
- `PHOTO`
- `SIGNATURE`
- `PASSBOOK`
- `FEE_RECEIPT`
- `RESUME`
- `OTHER`

---

## 7. Directory Structure & Key Files

```
shared/
├── schemas/document-evidence.json                # Canonical DocumentEvidence schema
├── fixtures/valid/document-evidence.valid.json   # Valid reference fixture
└── validators/index.js                           # validateDocumentEvidence validator

backend/
├── src/documents/
│   ├── document.engine.js                        # DocumentProcessingEngine (Upload preparation)
│   ├── document-understanding.engine.js          # DocumentUnderstandingEngine (Phase 7 pipeline)
│   ├── document.model.js                         # Mongoose schema
│   └── index.js                                  # Barrel export
└── tests/
    └── document-understanding.test.js            # 7 Jest test scenarios

ai-service/
├── core/models.py                                # DocumentEvidenceModel & DocumentQualityModel
├── agents/document_intelligence_agent.py         # Vision & LLM document agent
└── tests/
    ├── test_canonical_contracts.py               # Canonical fixture validation
    └── test_document_processor.py                # 4 pytest test scenarios
```

---

## 8. Verification & Safety Baseline

- **Node.js Backend**: `tests/document-understanding.test.js`: **7 / 7 passed**
  - Scenario 1: PDF Document Processing & Evidence Extraction
  - Scenario 2: Image Processing & Normalization
  - Scenario 3: Multi-page PDF Inspection & Missing Pages Detection
  - Scenario 4: Poor Quality Document (Blur / Crop) & Uncertainty Barrier
  - Scenario 5: Wrong Document Type Detection
  - Scenario 6: Conflicting Values Within and Across Documents
  - Scenario 7: Low-Confidence OCR strictly remains Unverified
- **Python AI Service**: `test_document_processor.py` (4 / 4 passed), `test_canonical_contracts.py` (20 / 20 passed).
- **Full Python Test Suite**: **48 / 48 passed**.
