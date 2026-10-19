# Comprehensive Dependency & Component Map

> **Module:** Architecture Baseline & Component Inventory  
> **Status:** Phase 0 Verified  
> **Source of Truth:** Codebase inspection of `f:\Applier`  

---

## 1. System Entry Points

```
[User / Browser] ────► frontend/src/main.jsx ───► frontend/src/App.jsx
                                                          │
                                                          ▼ (HTTP Port 5000)
                                                backend/server.js
                                                          │
                                                          ▼ (Internal HTTP Port 8000)
                                                ai-service/main.py
```

| Subsystem | Entry Point File | Description | Port / Protocol |
| :--- | :--- | :--- | :--- |
| **Root Runner** | [`package.json`](file:///f:/Applier/package.json) | Orchestrates concurrent startup of all 3 subsystems via `npm start`. | N/A |
| **Frontend** | [`frontend/src/main.jsx`](file:///f:/Applier/frontend/src/main.jsx) | Initializes React 19 DOM root, mounts [`App.jsx`](file:///f:/Applier/frontend/src/App.jsx). | 5173 / HTTP |
| **Backend** | [`backend/server.js`](file:///f:/Applier/backend/server.js) | Express 5 application bootstrap, DB connection, security & route registration. | 5000 / HTTP |
| **AI Service** | [`ai-service/main.py`](file:///f:/Applier/ai-service/main.py) | FastAPI application with lifespan health check, mounts API routes. | 8000 / HTTP |

---

## 2. Backend Inventory (`backend/src/`)

### 2.1. Routes & Controllers Map
All backend routes are mounted under `/api/v1` in [`backend/server.js`](file:///f:/Applier/backend/server.js):

| Route Path | Route File | Controller File | Action Methods |
| :--- | :--- | :--- | :--- |
| `/api/v1/auth` | [`auth.routes.js`](file:///f:/Applier/backend/src/auth/auth.routes.js) | [`auth.controller.js`](file:///f:/Applier/backend/src/auth/auth.controller.js) | `register`, `login`, `devLogin`, `sendOtp` |
| `/api/v1/users` | [`users.routes.js`](file:///f:/Applier/backend/src/users/users.routes.js) | [`users.controller.js`](file:///f:/Applier/backend/src/users/users.controller.js) | `getProfile`, `updateProfile` |
| `/api/v1/workflow` | [`workflow.routes.js`](file:///f:/Applier/backend/src/workflow/workflow.routes.js) | [`workflow.controller.js`](file:///f:/Applier/backend/src/workflow/workflow.controller.js) | `analyzeUrl` |
| `/api/v1/interview` | [`interview.routes.js`](file:///f:/Applier/backend/src/interview/interview.routes.js) | [`interview.controller.js`](file:///f:/Applier/backend/src/interview/interview.controller.js) | `sendMessageController` |
| `/api/v1/automation` | [`automation.routes.js`](file:///f:/Applier/backend/src/automation/automation.routes.js) | [`automation.controller.js`](file:///f:/Applier/backend/src/automation/automation.controller.js) | `executeAutomationController`, `resumeAutomationController`, `webhookReceivePlanController`, `statusWebhookController`, `getStatusController` |
| `/api/v1/documents` | [`documents.routes.js`](file:///f:/Applier/backend/src/documents/documents.routes.js) | [`documents.controller.js`](file:///f:/Applier/backend/src/documents/documents.controller.js) | `uploadDocument`, `getDocuments`, `deleteDocument`, `uploadInlineDocument` |
| `/api/v1/tracking` | [`tracking.routes.js`](file:///f:/Applier/backend/src/tracking/tracking.routes.js) | [`tracking.controller.js`](file:///f:/Applier/backend/src/tracking/tracking.controller.js) | `getDashboardStats`, `getRecentActivity`, `getApplications` |
| `/api/v1/admin` | [`admin.routes.js`](file:///f:/Applier/backend/src/admin/admin.routes.js) | [`admin.controller.js`](file:///f:/Applier/backend/src/admin/admin.controller.js) | `getAdminStats`, `getAllUsers`, `getAllJobs` |
| `/api/v1/health` | Embedded in `server.js` | N/A | Returns `{ success: true, message: 'Applier API is running' }` |

### 2.2. Backend Services & Helpers
- **`auth.service.js`:** Handles Firebase user creation/sync and JWT generation (`jsonwebtoken`).
- **`interview.service.js`:** Manages conversation turn progression, field deduplication, fuzzy answer extraction, and final markdown summary review table creation.
- **`automation.service.js`:** Core Playwright orchestrator:
  - `scanUrl()`: Crawls target URL, discovers CTA options, extracts inputs, captures landing screenshot.
  - `startAutomation()`: Creates `AutomationJob` in `QUEUED` status, calls AI execution planner.
  - `saveAndStartPlan()`: Attaches execution steps, switches job to `RUNNING`, fires `executePlan()`.
  - `executePlan()`: Iterates Playwright steps (`navigate`, `fill`, `select`, `upload`, `pause`, `screenshot`).
  - `resumePlan()`: Merges user OTP/CAPTCHA input, sets status back to `RUNNING`.
  - `selectOptionRobust()`: 4-tier selection strategy for HTML, Select2, and custom dropdowns.
  - `updateJobStatus()` / `logJobError()`: Logs step updates and triggers AI error recovery.
- **`document.engine.js`:** `DocumentProcessingEngine` executing metadata stripping, format conversion, resizing, iterative quality compression (`sharp`), and PDF page slicing (`pdf-lib`).
- **`notifications.service.js`:** Sends system alerts and Nodemailer emails.
- **`internalApi` ([`config/axios.js`](file:///f:/Applier/backend/src/config/axios.js)):** Axios client with 120s timeout and exponential backoff retry for AI service calls.

### 2.3. MongoDB Data Models
All models utilize Mongoose 9.x:

| Model | File | Primary Responsibility |
| :--- | :--- | :--- |
| `User` | [`user.model.js`](file:///f:/Applier/backend/src/users/user.model.js) | Account identity, Firebase UID, email, role (`USER`, `ADMIN`). |
| `Profile` | [`profile.model.js`](file:///f:/Applier/backend/src/users/profile.model.js) | Reusable demographic, educational, and identity information. |
| `Workflow` | [`workflow.model.js`](file:///f:/Applier/backend/src/workflow/workflow.model.js) | Scanned portal metadata, `urlHash`, landing screenshot, and canonical `schemaDefinition`. |
| `InterviewState` | [`interview-state.model.js`](file:///f:/Applier/backend/src/interview/interview-state.model.js) | Active Q&A state, `answers` Map, pending/completed fields, active field. |
| `AutomationJob` | [`automation.model.js`](file:///f:/Applier/backend/src/automation/automation.model.js) | Execution lifecycle, status, step pointer, pause context (CAPTCHA base64), logs. |
| `Conversation` | [`conversation.model.js`](file:///f:/Applier/backend/src/chat/conversation.model.js) | Chat session container linked to an `InterviewState`. |
| `Message` | [`message.model.js`](file:///f:/Applier/backend/src/chat/message.model.js) | Individual user and AI chat turns with metadata options. |
| `Document` | [`document.model.js`](file:///f:/Applier/backend/src/documents/document.model.js) | Vault documents, file URLs, mime types, extracted text. |
| `Application` | [`application.model.js`](file:///f:/Applier/backend/src/tracking/application.model.js) | Historical submissions, tracking numbers, and receipt URLs. |
| `Otp` | [`otp.model.js`](file:///f:/Applier/backend/src/auth/otp.model.js) | Temporary registration OTPs with TTL index. |
| `AILearning` | [`ai-learning.model.js`](file:///f:/Applier/backend/src/ai-learning/ai-learning.model.js) | Failure analysis records and selector reliability metrics. |
| `Notification` | [`notification.model.js`](file:///f:/Applier/backend/src/notifications/notification.model.js) | System alerts and user notifications. |

---

## 3. AI Service Inventory (`ai-service/`)

### 3.1. Routes & Orchestrator
- **Route:** `POST /api/v1/ai/execute` ([`api/routes/execute.py`](file:///f:/Applier/ai-service/api/routes/execute.py))
- **Dispatcher:** [`core/orchestrator.py`](file:///f:/Applier/ai-service/core/orchestrator.py) (`AIOrchestrator.execute()`)
- Standard input contract:
  ```json
  {
    "intent": "<INTENT_NAME>",
    "raw_data": {},
    "workflow": {},
    "state": {},
    "user_profile": {},
    "documents": [],
    "lastUserMessage": ""
  }
  ```

### 3.2. Specialized Agents Map
| Intent | Agent Class | File | Dependency / LLM Call |
| :--- | :--- | :--- | :--- |
| `scan_portal` | `WebsiteIntelligenceAgent` | `agents/website_intelligence_agent.py` | BeautifulSoup DOM parsing (Deterministic, zero LLM) |
| `plan_workflow` | `WorkflowPlanner` | `agents/workflow_planner.py` | Calls `services/workflow_generator.py` (LLM) |
| `continue_interview` | `ConversationAgent` | `agents/conversation_agent.py` | Calls `services/interview_ai.py` (LLM) |
| `validate_field` | `ValidationAgent` | `agents/validation_agent.py` | Stage 1: Regex rules; Stage 2: LLM eligibility |
| `process_document` | `DocumentIntelligenceAgent` | `agents/document_intelligence_agent.py` | Base64 / URL image inspection (LLM/Vision) |
| `plan_execution` | `ExecutionPlanner` | `agents/execution_planner.py` | Plans steps (LLM), sends webhook to Node.js |
| `recover_error` | `RecoveryAgent` | `agents/recovery_agent.py` | Calls `services/failure_analyzer.py` (Heuristic + LLM) |
| `explain_error` | `ExplanationAgent` | `agents/explanation_agent.py` | Generates user explanations (LLM) |
| `recommend_actions` | `RecommendationAgent` | `agents/recommendation_agent.py` | Profile & Vault analysis (LLM) |
| `retrieve_knowledge` | `KnowledgeAgent` | `agents/knowledge_agent.py` | Queries ChromaDB via embeddings (RAG) |

### 3.3. AI Core Infrastructure
- **`core/llm_service.py`:** Singleton `LLMService` handling model calls, retries (`tenacity`), JSON repair (`json_repair`), caching (`cache/llm_cache.json`), and embeddings (`embed_content`).
- **`core/models.py`:** Pydantic models for `WorkflowSchema`, `ExecutionPlan`, `DocumentExtraction`, `RecoveryInsight`, `UserExplanation`, `RecommendationList`.
- **`core/context_builder.py`:** Standardizes unstructured input dictionaries.
- **`core/confidence_scorer.py`:** Scores agent output confidence (0.0 to 1.0).
- **`core/cost_manager.py`:** In-memory latency and token estimation tracker.
- **`services/vector_db.py`:** ChromaDB store with persistent client (`./chroma_db`).

---

## 4. Frontend Component Inventory (`frontend/src/`)

### 4.1. API Client Wrappers
- **`core/api/api.client.js`:** Axios instance configured with baseURL `/api/v1` and Bearer JWT interceptor.
- **`features/auth/services/auth.api.js`:** `loginApi`, `registerApi`, `devLoginApi`, `sendOtpApi`.
- **`features/dashboard/services/automation.api.js`:**
  - `analyzeUrlApi(targetUrl)`
  - `sendInterviewMessageApi(conversationId, content)`
  - `executeApplicationApi(interviewStateId)`
  - `fetchAutomationStatusApi(jobId)`
  - `resumeAutomationApi(jobId, userInput)`
  - `uploadInlineDocumentApi(file, expectedType)`
- **`features/dashboard/services/documents.api.js`:** `fetchDocumentsApi`, `uploadDocumentApi`, `deleteDocumentApi`.
- **`features/dashboard/services/tracking.api.js`:** `fetchDashboardStatsApi`, `fetchApplicationsApi`, `fetchRecentActivityApi`.
- **`features/dashboard/services/users.api.js`:** `fetchUserProfileApi`, `updateUserProfileApi`.

### 4.2. Views & Component Hierarchy
```
App.jsx (Router)
├── /auth (AuthLayout)
│   └── AuthForm (Email/Password, Google, OTP verification)
├── /dashboard (DashboardLayout - ProtectedRoute)
│   ├── /dashboard (Dashboard: StatCards, Recent Applications Table)
│   │   ├── ViewLogsModal
│   │   └── ResumeModal
│   ├── /dashboard/new (NewApplication)
│   │   ├── Left Pane: Conversational Chat, Choice Pills, Inline Uploader, CAPTCHA Display
│   │   └── Right Pane: Execution Monitor, Browser Preview, Step Progress, Control Buttons
│   ├── /dashboard/documents (DocumentVault)
│   └── /dashboard/settings (Settings)
└── /admin (AdminRoute)
    └── AdminDashboard (Platform metrics, Job list, User inspector)
```

---

## 5. Background Workers & Concurrency Model

- **Background Worker Status:** **NONE.**
- **Actual Runtime Model:**
  - When `POST /api/v1/automation/webhook/plan` triggers `saveAndStartPlan()`, it calls:
    ```javascript
    executePlan(jobId, targetUrl, steps, answers, 0).catch(err => { ... });
    ```
  - `executePlan` runs asynchronously as an unmanaged floating promise directly on the Node.js event loop.
  - Headless Chromium runs as a child process of the Node.js server.
  - When a job pauses for OTP or CAPTCHA, `executePlan` enters an in-memory loop polling MongoDB:
    ```javascript
    while (!answered && pollCount < 60) {
        await page.waitForTimeout(5000);
        ...
    }
    ```
  - **Critical Concurrency Implication:** The Playwright browser instance and page context remain alive in memory for up to 5 minutes waiting for user input. There is no distributed queue (e.g. BullMQ/Redis) or worker process pool.
