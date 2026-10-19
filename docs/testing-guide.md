# Testing & Quality Assurance Guide — Applier 3.0

This guide details the complete testing strategy, test suites, and commands to verify Applier 3.0 functionality, security boundaries, and factual accuracy.

---

## 1. Test Architecture

The testing harness covers four distinct layers:

1. **Backend Unit & Integration Suites (Jest):** Verifies authentication, MongoDB models, workflow orchestrator state transitions, REST endpoints, AES-256 vault encryption, and file security filters.
2. **AI Microservice Test Suite (Pytest):** Verifies requirement classification, context optimization, zero-hallucination validation, and prompt injection defense across 111 test cases.
3. **End-to-End Browser Automation (Playwright):** Launches real Chromium with the packed Manifest V3 extension, opens mock Greenhouse portals, and validates all 23 sequence steps automatically.
4. **Performance & Latency Benchmark Harness:** Measures real execution latencies using high-resolution timers.

---

## 2. Test Execution Commands

### 2.1 Backend Core Applier 3.0 Suites (8 Suites / 72 Tests)
To run all 8 Applier 3.0 core test suites:
```bash
npm run test:backend
```
*Direct Jest invocation:*
```bash
cd backend
npm test -- tests/resume-ingestion.test.js tests/missing-info-engine.test.js tests/resume-generation.test.js tests/chrome-extension.test.js tests/form-autofill-engine.test.js tests/workflow-orchestration.test.js tests/security-reliability-audit.test.js tests/factual-accuracy-audit.test.js
```

### 2.2 Security & Factual Accuracy Audit Suites
To run specifically the security penetration and zero-hallucination verification suites:
```bash
cd backend
npm run test:security
```
Covers:
* Magic byte inspection and EICAR antivirus test signatures.
* Multi-tenant document isolation and path traversal prevention.
* AES-256-GCM authenticated decryption and tamper detection.
* Strict zero-hallucination checks rejecting unverified skills and fabricated companies.
* Pre-submission review barrier and idempotency guards.

### 2.3 Python AI Service Pytest Suite (111 Tests)
To run the full Python AI test suite:
```bash
npm run test:ai
```
*Direct Pytest invocation:*
```bash
cd ai-service
.\venv\Scripts\pytest.exe tests/   # Windows
# or: pytest tests/                # macOS / Linux
```

### 2.4 End-to-End Playwright Browser Automation (23 Steps)
To execute the live browser test with the Manifest V3 Chrome extension against a mock Greenhouse portal:
```bash
npm run test:e2e
```
*Or directly:*
```bash
node scratch/test_complete_workflow_browser.js
```
*Screenshots captured:*
* `greenhouse_prefill.png` — Blank form prior to autofill.
* `greenhouse_filled.png` — Form populated with visual green review highlights.
* `greenhouse_submitted.png` — Pre-submission confirmation barrier.

### 2.5 Performance Benchmark Harness
To measure cycle latencies:
```bash
npm run benchmark
```
*Or directly:*
```bash
node scratch/run_performance_benchmark.js
```

---

## 3. Expected Test Results Benchmark

| Test Layer | Total Tests | Pass Target | Typical Execution Time |
| :--- | :---: | :---: | :---: |
| **Backend Core 3.0 Suites** | 72 | 100% (72/72) | ~7.2 seconds |
| **Python AI Microservice** | 111 | 100% (111/111) | ~72 seconds |
| **Playwright Browser E2E** | 23 Steps | 100% (23/23) | ~14 seconds |
| **Security Audit Tests** | 14 | 100% (14/14) | ~3.5 seconds |
| **Factual Accuracy Tests** | 8 | 100% (8/8) | ~3.4 seconds |
