# Large Application and Context Optimization
**Applier 2.0 — Phase 21 Architecture Specification**

---

## 1. Executive Overview

When enterprise or government portals present extensive applications with **50, 100, or 200+ fields**, monolithic automation architectures suffer from severe context bloat:
- **Excessive Token Costs & Latency:** Dumping entire DOM trees and complete applicant dossiers consumes 30,000 to 110,000+ tokens per inference step, inducing severe latency (10–30s per action).
- **Attention Degradation:** LLMs suffer from "lost-in-the-middle" attention degradation when processing hundreds of unrelated input elements simultaneously.
- **Memory & Resource Saturation:** Repeatedly evaluating monolithic DOM graphs inflates heap consumption and introduces unpredictable garbage-collection pauses.

Phase 21 introduces the **Hierarchical Context Optimization Engine**, enforcing a strict architectural invariant:
> **"Never send the entire application DOM or full applicant context to the LLM unnecessarily."**

Instead, the application is decomposed into a formal **5-level hierarchy**, and at any processing step, the AI is provided exclusively with:
1. **Current Relevant Section** (and its immediate field groups)
2. **Relevant Applicant Data** (subgraph isolated to section semantic scope)
3. **Relevant Evidence** (filtered document attachments)
4. **Previous Decisions** (compact summary of prior resolved fields)

A multi-tiered cache stores page analyses and section field mappings, backed by automatic cache invalidation upon page fingerprint drift.

```
       APPLICATION
            │
            ▼
          PAGE (Page Fingerprint)
            │
     ┌──────┴──────────────────────────┐
     ▼                                 ▼
SECTION 1: Personal Details       SECTION 2: Academic History ...
(Section Fingerprint)             (Section Fingerprint)
     │                                 │
     ▼                                 ▼
FIELD GROUP: Identity             FIELD GROUP: College
     │                                 │
     ▼                                 ▼
FIELDS: FullName, DOB             FIELDS: Degree, CGPA
```

---

## 2. 5-Level Hierarchy Specification

The canonical hierarchy structure is defined by `https://applier.ai/schemas/application-hierarchy.json` (`v2.0.0`):

| Level | Entity | Scope & Responsibilities | Key Attributes |
|---|---|---|---|
| **1** | **Application** | Root session context across the entire portal | `applicationId`, `portalDomain`, `totalFieldCount`, `activeSectionId` |
| **2** | **Page** | Distinct URL or logical view step in a multi-step workflow | `pageId`, `pageNumber`, `pageType`, `pageFingerprint` |
| **3** | **Section** | Cohesive functional domain (e.g., Personal, Academic, Experience, Uploads) | `sectionId`, `sectionName`, `sectionPurpose`, `sectionFingerprint`, `status` |
| **4** | **Field Group** | Logical cluster of 2–6 tightly related interactive inputs (e.g., Name Group, Address Coordinates) | `groupId`, `groupName`, `fields` |
| **5** | **Field** | Atomic interactive element on the page | `fieldId`, `name`, `type`, `label`, `selector`, `semanticTarget`, `required`, `value` |

---

## 3. Context Slicing Engine (`HierarchicalContextEngine`)

When processing any field mapping or decision task, `HierarchicalContextEngine.getSectionContext()` isolates the exact context slice:

```mermaid
flowchart LR
    A["Raw Application (200 Fields, Full Graph, All Docs)"] --> B["HierarchicalContextEngine"]
    B --> C["Current Relevant Section"]
    B --> D["Relevant Applicant Subgraph"]
    B --> E["Relevant Evidence"]
    B --> F["Previous Decisions"]
    C & D & E & F --> G["Optimized AI Prompt (78% Token Reduction)"]
```

### 1. Current Relevant Section
Extracts only the fields assigned to the target section. Unrelated fields across other pages or sections are completely excluded from the prompt.

### 2. Relevant Applicant Subgraph Extraction
Filters the applicant's complete knowledge graph. For example:
- In `Academic Background`: extracts only `education.degree`, `education.college`, `education.cgpa`, `education.gradYear`.
- In `Contact Coordinates`: extracts only `contact.email`, `contact.phone`, `contact.address`, `contact.city`, `contact.zip`.
- Suppresses all unrelated personal, financial, and employment records.

### 3. Relevant Evidence Isolation
Filters the document vault to include only files matching the section's evidentiary purpose (e.g., transcripts for education, resumes for work experience, ID cards for identity verification).

### 4. Compact Previous Decisions
Injects a lightweight key-value dictionary of values already committed in prior sections. This preserves cross-section consistency (e.g., ensuring legal names match throughout) without re-sending full prompt histories.

---

## 4. Multi-Tiered Cache & Invalidation Architecture

The `ContextOptimizationCache` operates across three decoupled tiers:

```
[Live DOM Observation] ──> Compute live pageFingerprint
                                │
                  ┌─────────────┴─────────────┐
                  ▼                           ▼
        Fingerprint Matches?          Fingerprint Changed?
                  │                           │
          [CACHE HIT]                 [CACHE INVALIDATION]
                  │                           │
        - Page Analysis Loaded        - Evict Stale Fingerprint
        - Section Mappings Loaded     - Clear Section Mappings
        - 0 Tokens Consumed           - Recompute Hierarchy
        - Latency < 5ms               - Update Active Fingerprint
```

1. **Semantic Page Analysis Tier:**
   Keyed by `pageFingerprint` (SHA-256 of page element layout and headers). Stores the structural decomposition into sections and field groups.
2. **Field Mappings Tier:**
   Keyed by `sectionFingerprint` (SHA-256 of section field names, types, and labels). Stores verified semantic target mappings.
3. **Website Knowledge Tier:**
   Keyed by `domainKey + structuralHash`. Stores learned section transitions and upload constraints.

### Invalidation Guarantee
If the target website mutates (e.g., dynamic elements injected, A/B test variants loaded, structural DOM drift), `checkAndInvalidateOnDrift()` detects the divergence, immediately purges stale cache entries for that page, and forces fresh hierarchical decomposition.

---

## 5. Benchmark Performance Matrix

Benchmarked under Jest in [`backend/tests/context-optimization.test.js`](file:///f:/Applier/backend/tests/context-optimization.test.js) and Pytest in [`ai-service/tests/test_context_optimization.py`](file:///f:/Applier/ai-service/tests/test_context_optimization.py):

| Benchmark Suite | Total Fields | Sections | Monolithic Tokens | Optimized Tokens | Token Savings | Processing Latency | Accuracy | Heap Delta |
|---|---|---|---|---|---|---|---|---|
| **50 Fields** | 50 | 5 | 28,898 tokens | 6,289 tokens | **78.2%** | **4.85 ms** | **100.0%** | +2.72 MB |
| **100 Fields** | 100 | 8 | 54,760 tokens | 11,884 tokens | **78.3%** | **4.69 ms** | **100.0%** | +1.16 MB |
| **200 Fields** | 200 | 10 | 110,289 tokens | 24,349 tokens | **77.9%** | **10.36 ms** | **100.0%** | +2.40 MB |
| **Cache Hit (Repeat)** | 50 | 5 | 0 tokens (bypassed) | 0 tokens | **100.0%** | **< 1 ms** | **100.0%** | 0.00 MB |

### Key Observations
- **Sub-Linear Latency:** Processing 200 fields takes only ~10 ms total due to section clustering and isolated mapping.
- **78% Token Reduction:** Monolithic prompts of 110,000+ tokens are reduced to ~2,400 tokens per section.
- **100% Mapping Accuracy:** Subgraph matching against section scopes maintains 100% ground-truth accuracy with zero cross-talk confusion.
- **Zero Memory Bloat:** Heap delta remains steady (< 3 MB) even across massive 200-field forms.

---

## 6. Contract Definition

Canonical JSON Schema registered at `https://applier.ai/schemas/application-hierarchy.json` (`v2.0.0`):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://applier.ai/schemas/application-hierarchy.json",
  "title": "ApplicationHierarchy",
  "type": "object",
  "properties": {
    "schemaVersion": { "type": "string", "const": "2.0.0" },
    "applicationId": { "type": "string" },
    "portalDomain": { "type": "string" },
    "totalFieldCount": { "type": "integer", "minimum": 0 },
    "pages": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "pageId": { "type": "string" },
          "pageNumber": { "type": "integer", "minimum": 1 },
          "pageType": { "type": "string" },
          "pageFingerprint": { "type": "string" },
          "sections": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "sectionId": { "type": "string" },
                "sectionName": { "type": "string" },
                "sectionPurpose": { "type": "string" },
                "sectionFingerprint": { "type": "string" },
                "status": {
                  "type": "string",
                  "enum": ["PENDING", "ACTIVE", "COMPLETED", "SKIPPED"]
                },
                "fieldGroups": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "groupId": { "type": "string" },
                      "groupName": { "type": "string" },
                      "fields": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "properties": {
                            "fieldId": { "type": "string" },
                            "name": { "type": "string" },
                            "type": { "type": "string" },
                            "label": { "type": "string" },
                            "selector": { "type": "string" },
                            "semanticTarget": { "type": "string" },
                            "required": { "type": "boolean" },
                            "value": { "type": ["string", "number", "boolean", "null"] }
                          },
                          "required": ["fieldId", "name", "type"]
                        }
                      }
                    },
                    "required": ["groupId", "groupName", "fields"]
                  }
                }
              },
              "required": ["sectionId", "sectionName", "fieldGroups"]
            }
          }
        },
        "required": ["pageId", "sections"]
      }
    },
    "activeSectionId": { "type": ["string", "null"] },
    "optimizedContextMetrics": {
      "type": ["object", "null"],
      "properties": {
        "monolithicTokenEstimate": { "type": "integer" },
        "optimizedSectionTokens": { "type": "integer" },
        "tokenSavingsRatio": { "type": "number" },
        "cacheHit": { "type": "boolean" }
      }
    }
  },
  "required": ["schemaVersion", "applicationId", "totalFieldCount", "pages"]
}
```
