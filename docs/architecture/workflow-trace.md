# End-to-End Workflow Trace (Actual Implementation)

> **Module:** Execution Trace Analysis  
> **Status:** Phase 0 Verified  
> **Source of Truth:** Direct codebase trace of `f:\Applier`  

---

## 1. Overview of the Traced Run

This document traces the exact sequence of code calls, database mutations, and network communications across a complete application submission lifecycle:

$$\text{URL Input} \longrightarrow \text{DOM Crawl} \longrightarrow \text{Workflow Gen} \longrightarrow \text{Interview Q\&A} \longrightarrow \text{Doc Processing} \longrightarrow \text{Plan Gen} \longrightarrow \text{Browser Execution} \longrightarrow \text{OTP/CAPTCHA Pause} \longrightarrow \text{Resumption} \longrightarrow \text{Receipt}$$

---

## 2. Step-by-Step Execution Trace

### Step 1: URL Ingestion
- **User Action:** Types target portal URL (e.g. `https://scholarships.gov.in/fresh`) into [`NewApplication.jsx`](file:///f:/Applier/frontend/src/features/dashboard/NewApplication.jsx) and clicks **"Start"**.
- **Frontend Handler:** `startAnalysis()` in [`frontend/src/features/dashboard/NewApplication.jsx`](file:///f:/Applier/frontend/src/features/dashboard/NewApplication.jsx).
- **HTTP Call:** Calls `analyzeUrlApi(targetUrl)` in [`features/dashboard/services/automation.api.js`](file:///f:/Applier/frontend/src/features/dashboard/services/automation.api.js):
  ```http
  POST /api/v1/workflow/analyze
  Authorization: Bearer <jwt_token>
  Content-Type: application/json
  { "targetUrl": "https://scholarships.gov.in/fresh" }
  ```
- **Backend Route:** [`backend/src/workflow/workflow.routes.js`](file:///f:/Applier/backend/src/workflow/workflow.routes.js) $\rightarrow$ invokes `analyzeUrl()`.

---

### Step 2: Website Scan (Playwright DOM Crawler)
- **Backend Function:** `analyzeUrl()` in [`backend/src/workflow/workflow.controller.js`](file:///f:/Applier/backend/src/workflow/workflow.controller.js).
- **Hashing & Cache Check:** Computes `urlHash = crypto.createHash('sha256').update(targetUrl).digest('hex')`.
  - Checks if `Workflow.findOne({ urlHash })` exists with valid steps. If cached, reuses schema.
- **Crawler Call:** On cache miss, calls `scanUrl(targetUrl)` in [`backend/src/automation/automation.service.js`](file:///f:/Applier/backend/src/automation/automation.service.js).
- **Playwright Execution:**
  - Launches Chromium: `const browser = await chromium.launch({ headless: true })`.
  - Sets context with Chrome desktop User-Agent.
  - Opens target page with 30s timeout and network idle check (8s soft timeout).
  - Captures landing screenshot: `await page.screenshot({ fullPage: true })` $\rightarrow$ converted to base64.
  - Scans same-origin DOM links up to depth 2 (max 10 pages).
  - Extracts form inputs (`input`, `select`, `textarea`), labels, and CTA buttons (`apply`, `register`, `fresh`).
  - Returns payload: `{ url, title, pagesScanned, pages, html, screenshot }`.
  - Cleans up browser: `finally { if (browser) await browser.close(); }`.

---

### Step 3: Workflow Planning (AI Reasoning)
- **Backend Controller:** `analyzeUrl()` in [`backend/src/workflow/workflow.controller.js`](file:///f:/Applier/backend/src/workflow/workflow.controller.js).
- **HTTP Call to AI Service:**
  ```http
  POST http://127.0.0.1:8000/api/v1/ai/execute
  Headers: { "x-correlation-id": req.correlationId }
  {
    "intent": "plan_workflow",
    "raw_data": { ...scannedData... }
  }
  ```
- **AI Service Route:** [`ai-service/api/routes/execute.py::execute_ai()`](file:///f:/Applier/ai-service/api/routes/execute.py).
- **AI Orchestrator:** [`ai-service/core/orchestrator.py::AIOrchestrator.execute()`](file:///f:/Applier/ai-service/core/orchestrator.py) routes to `WorkflowPlanner`.
- **Agent Execution:** [`ai-service/agents/workflow_planner.py::WorkflowPlanner.process()`](file:///f:/Applier/ai-service/agents/workflow_planner.py):
  - Calls `_build_form_data()` to format inputs from scanned pages.
  - Calls `services/workflow_generator.py::generate_workflow(form_data)`.
  - **Chunking Logic:** If $>50$ inputs, breaks forms into 50-field slices to prevent LLM context saturation.
  - **LLM Call:** Calls `core/llm_service.py::llm_service.generate_safe_json()` with prompt, validating output into `core/models.py::WorkflowSchema`.
  - Returns `{ action: "workflow_planned", schema: { name, pages: [ { steps: [...] } ] }, confidence: 0.95 }`.
- **Database Mutation:** Backend saves workflow:
  ```javascript
  workflow = await Workflow.create({
    userId,
    name: schema.name,
    url: targetUrl,
    urlHash,
    landingScreenshot,
    schemaDefinition: schema
  });
  ```

---

### Step 4: Interview Initialization & Conversational Q&A
- **Backend Function:** `startInterview(userId, workflow._id)` in [`backend/src/interview/interview.service.js`](file:///f:/Applier/backend/src/interview/interview.service.js).
  - Flattens all steps across `workflow.schemaDefinition.pages`.
  - Excludes non-interactive or security fields (`pause`, `hidden`, `captcha`, `token`, `terms`, `cookie`).
  - Normalizes and deduplicates labels.
  - Creates MongoDB record:
    ```javascript
    const state = await InterviewState.create({
      userId, workflowId, pendingFields, currentField: pendingFields[0], status: 'IN_PROGRESS'
    });
    ```
  - Creates Conversation record:
    ```javascript
    const conversation = await Conversation.create({
      userId, title: `Interview: ${workflow.name}`, metadata: { interviewStateId: state._id }
    });
    ```
  - Dispatches first greeting turn via `processUserMessage()`.
- **Subsequent Chat Turns:**
  - User submits reply in frontend $\rightarrow$ `POST /api/v1/interview/message`.
  - Handled by `sendMessageController()` in [`backend/src/interview/interview.controller.js`](file:///f:/Applier/backend/src/interview/interview.controller.js).
  - Calls `processUserMessage(conversationId, userId, content)` in [`backend/src/interview/interview.service.js`](file:///f:/Applier/backend/src/interview/interview.service.js).
  - Saves user `Message` in MongoDB.
  - Queries `Document.find({ userId })` to provide Document Vault context.
  - Calls AI Service:
    ```http
    POST http://127.0.0.1:8000/api/v1/ai/execute
    {
      "intent": "continue_interview",
      "state": { answers, pendingFields, completedFields, currentField, fieldDetails, availableDocuments },
      "lastUserMessage": content
    }
    ```
  - AI Service routes to `ConversationAgent` $\rightarrow$ calls `services/interview_ai.py::process_interview_turn()`.
  - Generates `ExtractedAnswer` via `llm_service.generate_safe_json()`.
  - **Fuzzy Matching & Persistence:** Node updates `state.answers`, `state.completedFields`, and removes key from `state.pendingFields`.
  - **Active Field Safety Fallback:** If the LLM omitted extracted keys when the user answered directly, Node automatically maps the response to `state.currentField`.
  - **Syncing Question Text:** Node verifies `aiResponseContent` is 100% in sync with the next field's label and options.
  - Saves AI `Message` with options metadata.
- **Interview Completion:**
  - When `state.pendingFields.length === 0`:
    - Sets `state.status = 'COMPLETED'`.
    - Generates a Markdown summary table of all answers.
    - Appends message: `"All information has been collected! Click 🚀 Submit Application to launch live execution."`
    - Frontend transitions to state `READY_TO_EXECUTE`.

---

### Step 5: Document Upload & Processing Pipeline
- **User Upload Trigger:** Uploads file in chat or Document Vault.
- **Frontend Handler:** `handleFileUpload()` in [`NewApplication.jsx`](file:///f:/Applier/frontend/src/features/dashboard/NewApplication.jsx).
- **HTTP Call:** Calls `uploadInlineDocumentApi(file, 'document')` $\rightarrow$ `POST /api/v1/documents/upload-inline`.
- **Backend Controller:** `uploadInlineDocument()` in [`backend/src/documents/documents.controller.js`](file:///f:/Applier/backend/src/documents/documents.controller.js).
- **Multer Middleware:** Writes raw file to `uploads/`.
- **Engine Processing:** If file has constraints (`maxSizeKb`, `allowedFormats`), Sharp runs iterative compression:
  - Strips EXIF metadata.
  - Converts format to JPEG/PNG if needed.
  - Reduces quality iteratively (down to 10%) until file size fits within `maxBytes`.
- **Database Mutation:** Creates `Document` record with file URL and validation status `VALID`.
- **Chat Injection:** System posts message `"[System: User uploaded a file: <filename>. Saved to vault.]"` to advance the interview.

---

### Step 6: Execution Planning
- **User Action:** Clicks **"🚀 Submit Application"** in [`NewApplication.jsx`](file:///f:/Applier/frontend/src/features/dashboard/NewApplication.jsx).
- **HTTP Call:** Calls `executeApplicationApi(interviewStateId)` $\rightarrow$ `POST /api/v1/automation/execute`.
- **Backend Controller:** `executeAutomationController()` in [`backend/src/automation/automation.controller.js`](file:///f:/Applier/backend/src/automation/automation.controller.js).
- **Backend Service:** `startAutomation(userId, interviewStateId)` in [`backend/src/automation/automation.service.js`](file:///f:/Applier/backend/src/automation/automation.service.js).
  - Creates `AutomationJob` in MongoDB with status `QUEUED`.
  - Sends asynchronous request to AI Service:
    ```http
    POST http://127.0.0.1:8000/api/v1/ai/execute
    {
      "intent": "plan_execution",
      "raw_data": { jobId, stateId, answers, workflowUrl },
      "workflow": schemaDefinition
    }
    ```
- **AI Agent Execution:** `ExecutionPlanner` in [`ai-service/agents/execution_planner.py`](file:///f:/Applier/ai-service/agents/execution_planner.py).
  - Compiles workflow fields and user answers into a structured prompt.
  - Calls `llm_service.generate_safe_json()` to produce `core/models.py::ExecutionPlan`.
  - Dispatches plan via webhook back to Node.js:
    ```http
    POST http://localhost:5000/api/v1/automation/webhook/plan
    { "jobId": jobId, "stateId": stateId, "plan": plan_dict }
    ```
- **Backend Webhook Handler:** `webhookReceivePlanController()` in [`backend/src/automation/automation.controller.js`](file:///f:/Applier/backend/src/automation/automation.controller.js).
  - Calls `saveAndStartPlan(jobId, plan)` in [`backend/src/automation/automation.service.js`](file:///f:/Applier/backend/src/automation/automation.service.js).
  - Updates `AutomationJob` status to `RUNNING`.
  - Fires `executePlan(jobId, targetUrl, steps, answers, 0)` asynchronously.

---

### Step 7: Live Browser Execution & Checkpoints
- **Function:** `executePlan()` in [`backend/src/automation/automation.service.js`](file:///f:/Applier/backend/src/automation/automation.service.js).
- **Browser Lifecycle:** Launches `chromium.launch({ headless: true })`, opens page.
- **Step Iteration:**
  1. `navigate`: `await page.goto(step.url, { waitUntil: 'domcontentloaded', timeout: 30000 })`.
  2. `fill`: Evaluates `answers[step.field]`, executes `await page.fill(step.selector, value)`. If blocked, dispatches DOM `input` & `change` events.
  3. `select`: Invokes `selectOptionRobust(page, step.selector, value)`:
     - Tries native Playwright `page.selectOption()`.
     - Tries DOM element evaluation for exact value/label match.
     - Tries Select2 container click and search field interaction.
  4. `upload`:
     - Downloads document from local `/uploads` or external URL.
     - Invokes `DocumentProcessingEngine.prepareDocument(buffer, mimeType, step.constraints)`.
     - Writes prepared bytes to temp file via `DocumentProcessingEngine.writeToTempFile()`.
     - Executes `await page.setInputFiles(step.selector, tempFilePath)`.
  5. `pause` (OTP or CAPTCHA):
     - Sets job status: `PAUSED_CAPTCHA` or `PAUSED_OTP`.
     - If CAPTCHA: Screenshots specific element via `await captchaEl.screenshot()` and stores as base64 in `job.pauseContext.captchaImageBase64`.
     - Enters in-memory polling loop (`while (!answered && pollCount < 60) await page.waitForTimeout(5000)`).
     - Frontend poll detects pause, presents CAPTCHA image or OTP input prompt in chat.
     - User inputs code $\rightarrow$ frontend calls `resumeAutomationApi(jobId, { [fieldName]: code })` $\rightarrow$ `POST /api/v1/automation/resume`.
     - Handled by `resumePlan()`: saves code to `state.answers`, sets `job.status = 'RUNNING'`.
     - Polling loop detects status change, reloads answers, and continues iteration.
  6. `screenshot`: Captures confirmation receipt: `await page.screenshot({ fullPage: true })` $\rightarrow$ stored in `job.logs[].additionalData.base64Receipt`.
  7. Final status updated: `COMPLETED`.
  8. Browser cleanup: `finally { await browser.close(); }`.

---

### Step 8: Final Submission Tracking & Receipt Display
- **Frontend Live Poll:** [`NewApplication.jsx`](file:///f:/Applier/frontend/src/features/dashboard/NewApplication.jsx) detects `status === 'COMPLETED'`.
- **UI Update:**
  - Progress bar reaches 100%.
  - Browser preview displays the base64 confirmation receipt.
  - Chat posts success announcement.
- **Application History:** Job appears in [`Dashboard.jsx`](file:///f:/Applier/frontend/src/features/dashboard/Dashboard.jsx) with receipt preview and execution log inspection modal.
