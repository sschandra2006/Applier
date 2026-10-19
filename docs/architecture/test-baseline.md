# Test & Build Baseline

> **Module:** Test Execution & Quality Verification Baseline  
> **Status:** Phase 0 Verified  
> **Execution Date:** 2026-10-03  
> **Environment:** Windows, Node.js 20+, Python 3.13.9, Vite 8.1.1  

---

## 1. Test Execution Summary

| Test Suite / Target | Framework | Total Items | Passed | Failed | Skipped | Status | Duration |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Backend Unit Tests** | Jest (VM Modules) | 1 | 1 | 0 | 0 | **PASS** | 12.14s |
| **Backend Syntax Validation** | `node --check` | 23 files | 23 | 0 | 0 | **PASS** | 1.80s |
| **AI Service Unit Tests** | Pytest 9.1.1 | 16 | 15 | 1 | 0 | **FAIL** | 48.99s |
| **AI Startup Validation** | Python lifespan | 1 | 1 | 0 | 0 | **PASS** | 1.20s |
| **Frontend Unit Tests** | Vitest 4.1.10 | 0 | 0 | 0 | 0 | **PASS (0 tests)**| 0.40s |
| **Frontend Lint** | Oxlint 1.71.0 | 27 files | 27 | 0 (9 warnings)| 0 | **PASS** | 0.20s |
| **Frontend Production Build** | Vite 8.1.1 | 2,268 modules| 2,268 | 0 | 0 | **PASS** | 11.01s |

---

## 2. Detailed Test Suite Results

### 2.1. Backend Tests ([`backend/tests/health.test.js`](file:///f:/Applier/backend/tests/health.test.js))
Command: `npm test` (`cross-env NODE_OPTIONS=--experimental-vm-modules jest`)
```text
PASS tests/health.test.js (10.231 s)
  GET /api/v1/health
    ✓ should return 200 OK and success true (47 ms)

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
Snapshots:   0 total
Time:        12.137 s
```
- **Result:** **PASSED**.
- **Coverage Assessment:** Extremely minimal. Only tests an in-memory mock Express health endpoint. Zero unit or integration tests exist for:
  - `auth.controller.js`
  - `workflow.controller.js`
  - `interview.service.js`
  - `automation.service.js`
  - `document.engine.js`

### 2.2. Backend Syntax Validation (`node --check`)
Command: `Get-ChildItem -Path "src" -Recurse -Filter "*.js" | ForEach-Object { node --check $_.FullName }`
- **Result:** **PASSED** across all 23 backend source files. Zero syntax or ES module parsing errors.

### 2.3. AI Service Tests ([`ai-service/tests/`](file:///f:/Applier/ai-service/tests/))
Command: `venv\Scripts\pytest tests -v`
```text
tests/test_document_processor.py::test_document_processor_manager_initialization PASSED [  6%]
tests/test_full_site_scan_and_interview.py::test_website_intelligence_agent_multi_page_scan PASSED [ 12%]
tests/test_full_site_scan_and_interview.py::test_workflow_planner_multi_page_build_form_data PASSED [ 18%]
tests/test_full_site_scan_and_interview.py::test_interview_ai_uses_scanned_site_fields FAILED [ 25%]
tests/test_llm_service.py::test_startup_check_success PASSED             [ 31%]
tests/test_llm_service.py::test_generate_content_success PASSED          [ 37%]
tests/test_llm_service.py::test_generate_content_fallback PASSED         [ 43%]
tests/test_llm_service.py::test_embed_content PASSED                     [ 50%]
tests/test_reliability.py::test_safe_generate_clean_json PASSED          [ 56%]
tests/test_reliability.py::test_safe_generate_markdown_stripping PASSED  [ 62%]
tests/test_reliability.py::test_safe_generate_json_repair PASSED         [ 68%]
tests/test_reliability.py::test_safe_generate_schema_validation_retry PASSED [ 75%]
tests/test_reliability.py::test_safe_generate_max_retries_exceeded PASSED [ 81%]
tests/test_schema_alignment.py::test_global_alias_resolution PASSED      [ 87%]
tests/test_schema_alignment.py::test_contextual_title_resolution PASSED  [ 93%]
tests/test_schema_alignment.py::test_missing_required_field_fails PASSED [100%]
```

#### Detailed Failure Trace:
```text
FAILED tests/test_full_site_scan_and_interview.py::test_interview_ai_uses_scanned_site_fields
AttributeError: 'str' object has no attribute 'trim'. Did you mean: 'strip'?
Location: ai-service/services/interview_ai.py:88
```
- **Analysis:** Code bug in fallback question validation. Python string object has no `.trim()` attribute.
- **Pass Rate:** 93.75% (15/16 passed).

### 2.4. AI Service Startup Validation
Command: `python -c "from core.llm_service import llm_service; llm_service.startup_check()"`
```text
INFO:LLMService:Running AI Service startup validation for model: 'Qwen/Qwen2.5-Coder-32B-Instruct'...
INFO:LLMService:Startup validation completed successfully.
```
- **Result:** **PASSED**. Validates that model configuration, token handlers, and fallback routes initialize properly.

### 2.5. Frontend Linting (Oxlint)
Command: `npm run lint` in `frontend/`
- **Result:** **PASSED** (0 errors, 9 warnings).
- **Warnings Overview:**
  - 1 unused error parameter in `ErrorBoundary.jsx`.
  - 1 unused component import in `App.jsx` (`ErrorBoundary`).
  - 1 fast-refresh hook export warning in `AuthContext.jsx`.
  - 5 unused Lucide icons (`FileUp`, `Play`, `RotateCcw`, `Trash2`, `apiClient`) in `DocumentVault.jsx` and `Dashboard.jsx`.
  - 1 unused variable (`lastLog`) in `NewApplication.jsx`.

### 2.6. Frontend Production Build (Vite)
Command: `npm run build` in `frontend/`
```text
vite v8.1.5 building client environment for production...
transforming...✓ 2268 modules transformed.
rendering chunks...
dist/index.html                   0.45 kB │ gzip:   0.29 kB
dist/assets/index-Muy4-xxn.css   49.80 kB │ gzip:   8.61 kB
dist/assets/index-ubks5cs8.js   584.45 kB │ gzip: 182.74 kB
✓ built in 11.01s
```
- **Result:** **PASSED**. Zero TypeScript or JSX compilation errors. Note: Main bundle is 584 kB, suggesting future route code-splitting with `React.lazy()` will be beneficial.

---

## 3. Missing Test Areas (Critical Test Debt)

1. **Backend Integration Testing:**
   - No tests exist verifying Express routes against an in-memory MongoDB instance (`mongodb-memory-server`).
   - `workflow.controller.js` and `interview.controller.js` have zero automated test coverage.
2. **Playwright Automation Testing:**
   - Neither `scanUrl` nor `executePlan` have mock integration tests. They are only exercised via manual script runs (`test_e2e_workflow.js`, `test_analyze.cjs`).
3. **Frontend Component Tests:**
   - Although `@testing-library/react` and `vitest` are configured, there are zero test files (`.test.jsx` / `.spec.jsx`) written in `frontend/src/`.
4. **Document Processing Engine Tests:**
   - No automated tests verify `sharp` compression boundaries or `pdf-lib` page count enforcement.
