# Applier 2.0 — Distributed Browser Worker Architecture
**Document ID:** `ARCH-DOC-PHASE2-001`  
**Phase:** Phase 2 (Distributed Browser Worker Architecture)  
**Status:** Approved & Implemented  
**Date:** October 2026  

---

## 1. Architectural Objective

In Applier 1.0, Playwright browser automation ran directly inside the Node.js Express request/event-loop path as an unmanaged asynchronous floating promise (`executePlan(jobId, ...).catch(...)`). This posed severe risks:
- Spawning Chromium processes directly on the API server consumed 150MB–400MB of RAM per user session.
- Heavy DOM scanning or long-running 10-minute application executions blocked event loop operations and threatened server availability.
- A server restart instantly killed in-flight automations and left orphaned Chromium processes lingering in the host OS.

**Applier 2.0 Phase 2 establishes an asynchronous, distributed worker architecture:**

```
[React Frontend]
       │
       ▼ (HTTP API)
[Node.js Express API]  ──► (MongoDB Persistence)
       │
       ▼ (Enqueues Job)
[BullMQ Queue (Redis)]
       │
       ▼ (Worker Pull)
[Browser Worker Microservice]
       │
       ▼ (Managed Child Process)
[Headless Playwright Chromium]
```

Express no longer directly executes Playwright.

---

## 2. Responsibilities Separation

### 2.1 Node.js Express API (`backend/`)
- User authentication & authorization (JWT & Firebase).
- Workflow initiation & URL validation.
- Job creation (`status: 'QUEUED'`).
- Enqueuing jobs into the BullMQ queue (`SCAN_PORTAL`, `EXECUTE_APPLICATION`, `RESUME_APPLICATION`, `RECOVER_APPLICATION`).
- Job status queries & progress polling (`GET /api/v1/automation/status/:jobId`).
- Human checkpoint response ingestion (`POST /api/v1/automation/resume`).
- Database persistence & API responses.

### 2.2 Browser Worker Microservice (`browser-worker/`)
- Headless Chromium process lifecycle & context isolation.
- Multi-page portal web crawling & screenshot extraction (`SCAN_PORTAL`).
- Form automation step execution (`navigate`, `fill`, `click`, `select`, `upload`, `pause`, `screenshot`, `wait`).
- Element screenshot capture for CAPTCHA/OTP pause checkpoints.
- Document downloading and dynamic file upload preparation.
- Continuous heartbeat emission to MongoDB (`lastHeartbeat`).
- Crash recovery and orphaned Chromium process termination.
- Graceful shutdown on OS signals (`SIGINT`, `SIGTERM`).

---

## 3. Queue Architecture & Job Types

The queue system is centered on the `automation-jobs` queue managed by BullMQ over Redis (with an in-memory queue adapter for local testing):

| Job Type | Description | Priority | Timeout | Triggers |
| :--- | :--- | :--- | :--- | :--- |
| `SCAN_PORTAL` | Crawls portal DOM and captures landing screenshot | 1 (Normal) | 120,000 ms | `POST /api/v1/workflow/analyze` (cache miss) |
| `EXECUTE_APPLICATION` | Executes multi-step Playwright form automation plan | 1 (Normal) | 600,000 ms | `POST /api/v1/automation/webhook/plan` |
| `RESUME_APPLICATION` | Resumes execution from paused OTP/CAPTCHA checkpoint | 2 (High) | 300,000 ms | `POST /api/v1/automation/resume` |
| `RECOVER_APPLICATION` | Diagnoses failed/stalled jobs and manages backoff retries | 3 (Urgent) | 120,000 ms | Stalled job detector or worker exception |

### Canonical Job Payload Structure
Every job payload submitted to BullMQ satisfies:
```typescript
interface AutomationJobData {
  jobId: string;
  applicationId?: string | null;
  userId: string;
  correlationId: string;
  jobType: 'SCAN_PORTAL' | 'EXECUTE_APPLICATION' | 'RESUME_APPLICATION' | 'RECOVER_APPLICATION';
  attempt: number;
  priority: number;
  createdAt: string;
  timeout: number;
  status: 'QUEUED' | 'RUNNING' | 'PAUSED_OTP' | 'PAUSED_CAPTCHA' | 'COMPLETED' | 'FAILED';
  targetUrl?: string;
  steps?: Array<ExecutionStep>;
  answers?: Record<string, any>;
  startFromIndex?: number;
  userInput?: Record<string, any>;
  failureReason?: string;
}
```

---

## 4. Reliability & Fault-Tolerance Mechanisms

### 4.1 Retries with Exponential Backoff
- Transient network and portal failures are retried up to `MAX_ATTEMPTS = 3`.
- Backoff intervals follow an exponential curve ($delay \times 2^{attempt - 1}$), starting at 2,000ms (2s, 4s, 8s).
- Attempt counts are persisted to MongoDB.

### 4.2 Job Timeout Enforcement
- Individual jobs enforce strict execution timeouts (`JOB_TIMEOUTS_MS`).
- If an automation hangs (e.g., an unresponsive portal or infinite page loop), the worker race timer aborts execution, closes the Playwright context, and marks the job with `failureReason: "JobTimeoutError"`.

### 4.3 Browser Process Leak Prevention (`BrowserManager`)
- `BrowserManager` maintains a registry of active Playwright instances and their operating system Process IDs (PIDs).
- All browser operations are wrapped in `try ... finally { await browserManager.closeBrowser(b); }`.
- If `browser.close()` times out (5,000ms), `BrowserManager` forcefully issues `SIGKILL` (or Windows `taskkill /F /T /PID`).
- Global process hooks (`SIGINT`, `SIGTERM`, `beforeExit`) guarantee: **Never leave Chromium processes running after job termination.**

### 4.4 Worker Crash Recovery & Orphan Job Detection (`OrphanDetector`)
- Runs periodically (every 30 seconds) and on worker startup.
- Queries MongoDB for jobs marked `status: 'RUNNING'` whose `lastHeartbeat` is older than `STALLED_JOB_THRESHOLD_MS` (2 minutes).
- Automatically re-enqueues stalled jobs starting from their last successfully persisted `currentStepIndex`.
- Guarantees: **Jobs survive API or worker restarts without state corruption.**

### 4.5 Graceful Shutdown
- Catches `SIGINT` and `SIGTERM`.
- Stops pulling new jobs from BullMQ.
- Allows in-flight steps to complete or checkpoint.
- Closes all active browser processes.
- Closes Redis and MongoDB connections cleanly.

---

## 5. MongoDB Persistence Schema Updates

`AutomationJob` (`backend/src/automation/automation.model.js`) was updated with dedicated worker tracking fields:

```javascript
{
  jobType: {
    type: String,
    enum: ['SCAN_PORTAL', 'EXECUTE_APPLICATION', 'RESUME_APPLICATION', 'RECOVER_APPLICATION'],
    default: 'EXECUTE_APPLICATION'
  },
  applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Application' },
  correlationId: { type: String },
  attempt: { type: Number, default: 1 },
  maxAttempts: { type: Number, default: 3 },
  priority: { type: Number, default: 1 },
  timeoutMs: { type: Number, default: 600000 },
  workerStatus: {
    type: String,
    enum: ['IDLE', 'ASSIGNED', 'RUNNING', 'COMPLETED', 'FAILED', 'STALLED'],
    default: 'IDLE'
  },
  workerId: { type: String },
  lastHeartbeat: { type: Date },
  failureReason: { type: String }
}
```

*Note:* Browser objects, contexts, and Playwright handles are **never** stored in MongoDB.

---

## 6. API Compatibility & Zero-Regression Verification

Existing external endpoints remain 100% backward-compatible:
1. `POST /api/v1/workflow/analyze`: delegates DOM crawling via `enqueueScanPortalAndAwait()`.
2. `POST /api/v1/automation/webhook/plan`: validates plan against canonical JSON Schema, updates MongoDB, and enqueues `EXECUTE_APPLICATION`.
3. `POST /api/v1/automation/resume`: records user OTP/CAPTCHA into answers, updates checkpoint, and enqueues `RESUME_APPLICATION`.
4. `GET /api/v1/automation/status/:jobId`: returns job state, step progress, worker status, and base64 receipts.

---

## 7. Automated Test Suite Metrics

All test suites pass across the entire repository:

### Backend Test Suites (`npm test` in `backend/`)
- `tests/queue.test.js`: 5 passed (Job types, metadata, priority queuing)
- `tests/worker.test.js`: 4 passed (Job routing, scanner, executor, AI recovery)
- `tests/retry.test.js`: 2 passed (Exponential backoff, attempt tracking, terminal failure)
- `tests/timeout.test.js`: 1 passed (Job timeout enforcement & abort)
- `tests/cleanup.test.js`: 3 passed (PID tracking, multi-browser cleanup, leak prevention)
- `tests/crash.test.js`: 2 passed (Stalled job detection, step resumption)
- `tests/integration.test.js`: 1 passed (End-to-end API → Queue → Worker → Playwright → Completion)
- `tests/contract.test.js`: 35 passed (Phase 1 Canonical schemas & adapters)
- `tests/health.test.js`: 1 passed (Server health endpoint)
**Total: 54 passed, 0 failed (100% Pass rate)**

### Python AI Test Suites (`pytest tests` in `ai-service/`)
- `test_canonical_contracts.py`: 17 passed
- `test_document_processor.py`: 1 passed
- `test_full_site_scan_and_interview.py`: 3 passed
- `test_llm_service.py`: 4 passed
- `test_reliability.py`: 5 passed
- `test_schema_alignment.py`: 3 passed
**Total: 33 passed, 0 failed (100% Pass rate)**

### Frontend Production Build (`npm run build` in `frontend/`)
- Vite build completed in 1.04s without errors.
