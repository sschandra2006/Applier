# Migration Risks & Architectural Vulnerabilities

> **Module:** Migration Safety & Risk Assessment  
> **Status:** Phase 0 Verified  
> **Source of Truth:** Codebase inspection of `f:\Applier`  

---

## 1. Critical Architectural Risks

### 🚨 Risk 1: Playwright In-Process Execution & Event Loop Saturation
- **Vulnerability:** [`backend/src/automation/automation.service.js`](file:///f:/Applier/backend/src/automation/automation.service.js) launches Chromium headless browsers directly within the Node.js Express process.
- **Impact:**
  - Launching 5–10 simultaneous application jobs will consume 2GB–4GB of host memory.
  - A browser segmentation fault or memory leak can crash the primary API gateway serving all users.
  - Pausing for OTP or CAPTCHA holds an open browser instance in memory for up to 5 minutes via a `while` loop with `waitForTimeout(5000)`.
- **Migration Safeguard for Phase 1/2:**
  - Decouple browser execution from the Express HTTP server.
  - Introduce an asynchronous worker boundary (e.g. BullMQ with Redis or independent worker containers) with concurrency limits and dedicated memory ceilings.

---

### 🚨 Risk 2: Webhook Endpoint Without Authentication or Ingress Validation
- **Vulnerability:** In [`backend/src/automation/automation.routes.js`](file:///f:/Applier/backend/src/automation/automation.routes.js):
  ```javascript
  router.post('/webhook', statusWebhookController);
  router.post('/webhook/plan', webhookReceivePlanController);
  ```
  These routes are placed **above** `router.use(requireJwtAuth);` and possess **zero authentication or secret verification**.
- **Impact:** Any external actor who discovers or reaches port 5000 can send arbitrary JSON to `/api/v1/automation/webhook/plan`, injecting arbitrary execution steps (`navigate`, `fill`, `click`) that the backend will immediately launch in Chromium!
- **Migration Safeguard:**
  - Secure internal webhooks using a shared HMAC signature (`x-webhook-signature`) or shared secret token verified by middleware.
  - Validate the `ExecutionPlan` payload using strict Zod schemas before persisting or executing.

---

### 🚨 Risk 3: Docker Compose Environment Variable Mismatch
- **Vulnerability:** In [`docker-compose.yml`](file:///f:/Applier/docker-compose.yml), line 20:
  ```yaml
  PYTHON_API_URL=http://ai-service:8000/api/v1
  ```
  However, in [`backend/src/workflow/workflow.controller.js`](file:///f:/Applier/backend/src/workflow/workflow.controller.js), the code posts directly to `config.pythonApiUrl`:
  ```javascript
  const aiResponse = await internalApi.post(PYTHON_API_URL, { intent: 'plan_workflow', ... });
  ```
  And in [`backend/src/config/env.js`](file:///f:/Applier/backend/src/config/env.js), the default is:
  ```javascript
  PYTHON_API_URL: z.string().url().optional().default('http://127.0.0.1:8000/api/v1/ai/execute')
  ```
- **Impact:** If deployed via `docker-compose up`, requests will post to `http://ai-service:8000/api/v1` (which does not exist, resulting in a 404), rather than `http://ai-service:8000/api/v1/ai/execute`!
- **Migration Safeguard:** Synchronize `docker-compose.yml` to specify `http://ai-service:8000/api/v1/ai/execute`.

---

### ⚠️ Risk 4: Empty Monorepo Shared Package & Schema Drift
- **Vulnerability:** [`shared/src/index.js`](file:///f:/Applier/shared/src/index.js) is completely empty. Domain schemas are maintained independently in Python (`core/models.py`) and Node.js Mongoose models.
- **Impact:**
  - Changes to fields in Python `WorkflowSchema` or `ExecutionPlan` are not automatically reflected in Node.js or React, creating silent runtime bugs.
  - Type drift between `InterviewState` answers (Map in Node, Dict in Python, Object in React).
- **Migration Safeguard:**
  - Establish `shared/` as the single source of truth for schemas using Zod.
  - Automatically derive TypeScript types and validate JSON payloads across both Express and FastAPI.

---

### ⚠️ Risk 5: Base64 Receipt Bloat in MongoDB Documents
- **Vulnerability:** In `automation.service.js`, full-page screenshots are saved directly into the `AutomationJob` log stream:
  ```javascript
  additionalData: { base64Receipt: base64Screenshot }
  ```
- **Impact:** Full-page screenshots can exceed 2MB–5MB per image. Storing multiple screenshots in `logs` arrays inside a single MongoDB document quickly approaches MongoDB's 16MB document limit (`BSONDocumentTooLarge`) and degrades query performance.
- **Migration Safeguard:**
  - Store screenshots as files on disk (`/uploads/receipts/`) or object storage (S3/Firebase Storage).
  - Store only the relative file URL in the database document.

---

### ⚠️ Risk 6: Lack of Anti-Bot & Evasion Protections in Crawler
- **Vulnerability:** `scanUrl` launches vanilla Playwright Chromium without stealth plugins.
- **Impact:** Target portals protected by Cloudflare, Akamai, or AWS WAF will challenge or block headless Chromium during the scanning phase, causing `scanUrl` to fail with 403 or Cloudflare turnstile loops.
- **Migration Safeguard:**
  - Introduce stealth headers, randomized viewport sizing, and anti-fingerprinting configurations.

---

## 2. Summary of Migration Risk Levels

| Risk Item | Severity | Likelihood | Recommended Mitigation Phase |
| :--- | :---: | :---: | :---: |
| In-Process Playwright Execution | **CRITICAL** | High | Phase 1 (Queue & Worker Isolation) |
| Unauthenticated Webhook Plan Route | **CRITICAL** | High | Phase 1 (HMAC / Internal Secret) |
| Docker Compose `PYTHON_API_URL` Mismatch | **HIGH** | Guaranteed in Docker | Phase 1 (Config Alignment) |
| Base64 Screenshot Document Bloat | **HIGH** | Medium | Phase 1 (File/Storage Offloading) |
| Python `str.trim()` Bug | **MEDIUM** | Immediate | Phase 1 (Safe Bugfix) |
| Empty Shared Monorepo Package | **MEDIUM** | Progressive | Phase 2 (Contract Unification) |
| Headless Anti-Bot Blocking | **MEDIUM** | High on Gov sites | Phase 2 (Stealth Crawler) |
