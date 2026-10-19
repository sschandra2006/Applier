# Applier — System Architecture & Collaborative Planning Master Brief

> **Document Purpose:** This document is an exhaustive, self-contained technical specification and architectural blueprint of the **Applier** platform as built to date. It is structured specifically for ingestion by an AI Software Architect or Engineering Team to review, critique, scale, refactor, and plan subsequent architectural phases.

---

## 1. System Prompt & Context for the Collaborating AI

```text
You are acting as a Principal Software Architect, Principal AI Architect, and Distributed Systems Engineer.
You have been provided with the complete architectural state and codebase breakdown of "Applier" — an autonomous, AI-driven application assistance and submission platform.

Your task is to collaborate with the user on:
1. Architectural Review & Optimization: Identifying scaling bottlenecks, redundancy, and design improvements.
2. Next-Phase Planning: Architecting Phases 15 through 20 (Automated QA, Distributed Job Queues, AI Learning Loops, Voice/Mobile interfaces, Universal Marketplace).
3. Monorepo & Shared Contract Engineering: Designing shared typing, schemas, and contract-driven development across Node.js, Python, and React.
4. Resiliency & Failure Recovery: Hardening Playwright browser automation, anti-bot mitigations, and human-in-the-loop pause/resume semantics.
```

---

## 2. Platform Mission & End-to-End User Journey

**Applier** automates the tedious, multi-step process of applying to portals (scholarships, government schemes, university admissions, exam registrations, licenses).

### The Golden Workflow:
$$\text{URL Input} \longrightarrow \text{Deep DOM Scan} \longrightarrow \text{Workflow Planning} \longrightarrow \text{Conversational Interview} \longrightarrow \text{Document Prep} \longrightarrow \text{User Review} \longrightarrow \text{Playwright Automation} \longrightarrow \text{Human Checkpoints (OTP/CAPTCHA)} \longrightarrow \text{Submission \& Receipt Capture}$$

1. **URL Ingestion & Portal Analysis:** User enters a portal URL. Node.js Playwright crawls the target site (up to depth 2, max 10 pages) extracting DOM forms, input selectors, buttons, CTA links, and screenshots.
2. **AI Workflow Synthesis:** Python AI Service analyzes scanned inputs and synthesizes a canonical `WorkflowSchema` with logical pages, steps, and validation constraints.
3. **Conversational Interview Loop:** Applier AI interviews the user via a conversational chat interface, collecting missing details, offering dropdown choices, and reusing profile data.
4. **Document Compliance Pipeline:** Documents uploaded by the user pass through an isolated Document Processing Engine (`sharp` + `pdf-lib`) that strips metadata, converts formats, compresses images iteratively, and enforces page/dimension limits.
5. **Review & Approval:** The user reviews a Markdown summary table of all collected answers and clicks **"Submit Application"**.
6. **Execution Planning & Browser Automation:** Python `ExecutionPlanner` maps workflow fields and user answers into an ordered Playwright `ExecutionPlan`. The Node.js browser engine executes the plan in Chromium.
7. **Human-in-the-Loop Checkpoints:** Upon encountering OTP or CAPTCHA:
   - Playwright pauses and captures element screenshots.
   - Frontend displays the CAPTCHA or requests OTP.
   - User inputs the code in chat; Playwright resumes seamlessly without losing browser state.
8. **Submission & Tracking:** Confirmed submissions capture receipts and log application history in MongoDB.

---

## 3. Core Architectural Invariants (Non-Negotiable Rules)

Every future design decision or code change must comply with these 10 principles:

1. **AI Performs Reasoning Only:** Python AI agents are stateless decision engines. They analyze DOM trees, determine next interview questions, plan execution steps, and classify documents. **Zero browser manipulation or direct DOM interaction occurs inside Python.**
2. **Browser Automation Performs Execution Only:** Playwright operates inside Node.js and contains **zero LLM reasoning**. It exclusively carries out deterministic steps (`navigate`, `fill`, `select`, `click`, `upload`, `pause`, `screenshot`).
3. **Node.js is the API Gateway & System of Record:** Express 5 manages authentication, session state, MongoDB mutations, rate limiting, and process orchestration.
4. **Dedicated Document Processing Engine:** AI agents never manipulate files. Automation never manipulates file bytes directly. All format conversion, compression, and PDF slicing occur in [`backend/src/documents/document.engine.js`](file:///f:/Applier/backend/src/documents/document.engine.js).
5. **Workflows Must Be Resumable:** All execution progress, step indices, form answers, and pause contexts (`PAUSED_OTP`, `PAUSED_CAPTCHA`) are persisted in MongoDB. A crashed or paused run must be able to resume at the exact step.
6. **Stateless AI Orchestration:** The Python microservice receives full context from Node.js per request. It does not store user session state in-memory.
7. **Traceability:** Every user action, AI decision, and automation step is tagged with a correlation ID and logged with timestamps and latency metrics.

---

## 4. Technology Stack & Service Topology

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          APPLIER ARCHITECTURE                          │
└────────────────────────────────────────────────────────────────────────┘

    [ React 19 + Vite Frontend ]             (Port 5173 / Port 80)
                 │
                 │ HTTP REST + Bearer JWT
                 ▼
    [ Node.js + Express 5 Backend ]          (Port 5000)
      - API Gateway & Security (Helmet, RateLimit)
      - MongoDB ODM (Mongoose 9)
      - Document Engine (Sharp, PDF-Lib)
      - Browser Engine (Playwright Headless Chromium)
                 │
                 │ Internal HTTP REST (Correlation IDs)
                 ▼
    [ Python FastAPI AI Microservice ]       (Port 8000)
      - Multi-Agent Orchestrator (10 Agents)
      - LLM Service (Qwen 2.5 on Hugging Face / Serverless)
      - Vector DB (ChromaDB + sentence-transformers)
      - AST JSON Repair & Pydantic Validation

                 │
                 ▼
    [ MongoDB Database (Mongoose 9) ]        (Port 27017)
```

| Layer | Technologies | Key Libraries |
| :--- | :--- | :--- |
| **Frontend** | React 19, Vite, JSX, JavaScript | Tailwind CSS, Lucide React, Framer Motion, Axios |
| **Backend** | Node.js (ESM), Express 5 | Mongoose 9, Playwright, Sharp, pdf-lib, Multer, Pino, Helmet, Nodemailer, Firebase Admin |
| **AI Service** | Python 3.11+, FastAPI, Uvicorn | Pydantic v2, BeautifulSoup4, ChromaDB, sentence-transformers, huggingface_hub, json-repair, Tenacity |
| **Database** | MongoDB 6.0+ | Mongoose 9 ORM schemas with compound indices |
| **DevOps** | Docker, Docker Compose | Multi-container setup (`frontend`, `backend`, `ai-service`, `mongodb`) |

---

## 5. Repository File Map

```text
f:\Applier\
├── package.json                         # Root runner (concurrently starts frontend, backend, ai-service)
├── docker-compose.yml                   # 4-container production topology
├── backend/
│   ├── server.js                        # Express 5 entrypoint, DB retry loop, uncaught handler
│   ├── package.json
│   ├── src/
│   │   ├── config/                      # env.js, logger.js (Pino), axios.js (internalApi with retry)
│   │   ├── middleware/                  # correlationId.middleware.js
│   │   ├── error/                       # error.middleware.js (global fail-safe error handler)
│   │   ├── auth/                        # Firebase sync, email OTP model & routes, JWT middleware
│   │   ├── users/                       # User & Profile models, controllers
│   │   ├── workflow/                    # Workflow model, analyzeUrl controller (crawler + AI orchestrator call)
│   │   ├── interview/                   # InterviewState model, dynamic Q&A, active-field safety fallback
│   │   ├── documents/                   # Document model, DocumentProcessingEngine (Sharp + pdf-lib)
│   │   ├── automation/                  # AutomationJob model, Playwright scanner & resumable executor
│   │   ├── tracking/                    # Application model, dashboard analytics controller
│   │   ├── notifications/               # In-app notifications & Nodemailer service
│   │   ├── admin/                       # Admin dashboard statistics & job inspector
│   │   └── ai-learning/                 # Selector reliability and feedback models
│   └── tests/                           # Jest test suites
├── ai-service/
│   ├── main.py                          # FastAPI app, lifespan health checks, global error formats
│   ├── requirements.txt
│   ├── api/
│   │   ├── middlewares.py               # Correlation ID propagation
│   │   └── routes/execute.py            # POST /api/v1/ai/execute
│   ├── core/
│   │   ├── orchestrator.py              # AIOrchestrator routing to 10 agents
│   │   ├── llm_service.py               # Qwen 2.5 client with JSON repair, retry, caching, embedding
│   │   ├── models.py                    # Canonical Pydantic schemas (WorkflowSchema, ExecutionPlan, etc.)
│   │   ├── context_builder.py           # Standardized context construction from Node payloads
│   │   ├── schema_normalizer.py         # Key aliasing and format normalizer
│   │   ├── confidence_scorer.py         # Confidence scoring engine (0.0 to 1.0)
│   │   ├── cost_manager.py              # Token and latency tracker
│   │   └── ai_logger.py                 # Structured decision logger
│   ├── agents/                          # 10 Specialized Agent implementations
│   │   ├── conversation_agent.py
│   │   ├── website_intelligence_agent.py
│   │   ├── workflow_planner.py
│   │   ├── validation_agent.py
│   │   ├── document_intelligence_agent.py
│   │   ├── execution_planner.py
│   │   ├── recovery_agent.py
│   │   ├── explanation_agent.py
│   │   ├── recommendation_agent.py
│   │   └── knowledge_agent.py
│   ├── services/                        # InterviewAI, WorkflowGenerator, FailureAnalyzer, ChromaDB
│   ├── prompts/                         # Markdown prompt templates and JSON schemas per domain
│   └── tests/                           # Pytest suites (reliability, schema alignment, scanner tests)
├── frontend/
│   ├── vite.config.js
│   ├── src/
│   │   ├── App.jsx                      # React Router definition & Auth/Admin guards
│   │   ├── core/                        # api.client.js, AuthContext.jsx, ErrorBoundary.jsx
│   │   ├── layouts/                     # AuthLayout.jsx, DashboardLayout.jsx
│   │   └── features/
│   │       ├── auth/                    # Unified AuthForm (Email, Password, OTP)
│   │       ├── dashboard/
│   │       │   ├── Dashboard.jsx        # Stats cards, active jobs table, log modal, resume modal
│   │       │   ├── NewApplication.jsx   # Split-pane: Conversational Chat vs Live Execution Monitor
│   │       │   ├── DocumentVault.jsx    # User document repository
│   │       │   └── Settings.jsx         # Profile preferences
│   │       └── admin/
│   │           └── AdminDashboard.jsx   # System health, active automation jobs, metrics
└── uploads/                             # Local vault for raw and processed documents
```

---

## 6. Detailed Subsystem Specifications

### 6.1. Multi-Agent AI Core (`ai-service/`)

All requests route through `POST /api/v1/ai/execute`:
```json
{
  "intent": "continue_interview | scan_portal | plan_workflow | validate_field | process_document | plan_execution | recover_error | explain_error | recommend_actions | retrieve_knowledge",
  "raw_data": {},
  "workflow": {},
  "state": {},
  "user_profile": {},
  "documents": [],
  "lastUserMessage": ""
}
```

#### The 10 Specialized Agents:
1. **`WebsiteIntelligenceAgent` (`agents/website_intelligence_agent.py`):**
   - Parses raw HTML via BeautifulSoup.
   - Extracts forms, fieldsets, tab wizards, inputs, labels, placeholders, and validation attributes.
   - Synthesizes robust selectors (`id` $\rightarrow$ `name` $\rightarrow$ `data-field` $\rightarrow$ `class`).
   - Extracts file upload constraints (`accept` types, nearby max size text e.g. "max 500kb", min dimensions).
   - Detects CAPTCHA and OTP markers (`g-recaptcha`, `h-captcha`, `token_number`).
2. **`WorkflowPlanner` (`agents/workflow_planner.py`):**
   - Takes DOM data and generates a canonical `WorkflowSchema` with logical pages and steps.
   - **Prompt Chunking Engine:** If form inputs exceed 50, automatically divides fields into chunks to avoid LLM context overflow or repetitive loops.
3. **`ConversationAgent` (`agents/conversation_agent.py`):**
   - Interacts with `InterviewAI`. Receives `pendingFields` and `lastUserMessage`.
   - Extracts user answers into structured keys and identifies the next question.
4. **`ValidationAgent` (`agents/validation_agent.py`):**
   - **Stage 1 (Rule Engine):** Zero-latency regex validation for email, phone (10 digits), Aadhaar (12 digits), PAN (`[A-Z]{5}[0-9]{4}[A-Z]`), PIN code (6 digits), age limits, percentage ranges.
   - **Stage 2 (AI Eligibility Check):** Validates complex portal eligibility criteria (income ceilings, conflicting details).
5. **`DocumentIntelligenceAgent` (`agents/document_intelligence_agent.py`):**
   - Vision/multimodal analysis on uploaded documents (base64 or URL).
   - Detects document type (Passport, Aadhaar, PAN, Marksheet, Fee Receipt), extracts fields, and flags quality warnings (blurry, cropped).
6. **`ExecutionPlanner` (`agents/execution_planner.py`):**
   - Maps user answers and workflow selectors into an ordered sequence of Playwright steps.
   - Dispatches the plan back to the Node.js webhook (`POST /api/v1/automation/webhook/plan`).
7. **`RecoveryAgent` (`agents/recovery_agent.py`):**
   - Ingests Playwright execution logs upon failure.
   - Diagnoses root causes (selector shifted, timeout, session expired) and returns updated selectors and retryability flags.
8. **`ExplanationAgent` (`agents/explanation_agent.py`):**
   - Translates raw technical stack traces into empathetic, human-readable user explanations with clear next steps.
9. **`RecommendationAgent` (`agents/recommendation_agent.py`):**
   - Reviews user profile and vault to recommend missing documents or eligible applications.
10. **`KnowledgeAgent` (`agents/knowledge_agent.py`):**
    - Queries ChromaDB using vector embeddings for portal guidelines, FAQs, and schemes.

---

### 6.2. Browser Automation Engine (`backend/src/automation/automation.service.js`)

#### 1. Deep Site Scanner (`scanUrl`):
- Crawls using headless Chromium with standard desktop User-Agents.
- Traverses same-origin URLs up to depth 2, discovering hidden steps and application CTAs (`apply`, `register`, `fresh`, `renewal`).
- Takes a full-page landing screenshot encoded in base64.

#### 2. Resumable Execution Engine (`executePlan`):
- Step Types Supported:
  - `navigate`: Opens page and waits for network idle.
  - `fill`: Types answer; automatically dispatches DOM `input` and `change` events if standard typing is blocked.
  - `select`: Robust 4-tier selection:
    1. Standard Playwright `selectOption()`.
    2. Native DOM matching by exact value, exact label, or substring text.
    3. Select2 / Chosen custom container click + search input fill.
    4. Forced label/value assignment.
  - `upload`: Downloads user file from vault, feeds it into `DocumentProcessingEngine`, writes compliant bytes to a temp file, and attaches it via `page.setInputFiles()`.
  - `pause`: Saves pause state (`PAUSED_OTP` or `PAUSED_CAPTCHA`), captures the CAPTCHA element screenshot, and polls MongoDB until the user resumes with the answer.
  - `screenshot`: Captures final submission confirmation.

---

### 6.3. Document Processing Engine (`backend/src/documents/document.engine.js`)

Operates entirely on raw byte buffers before files touch third-party forms:

```text
[ Raw File Buffer ] ───► [ Format & MIME Check ]
                                 │
         ┌───────────────────────┴───────────────────────┐
         ▼                                               ▼
   [ Image Pipeline (Sharp) ]               [ PDF Pipeline (pdf-lib) ]
   1. Strip EXIF metadata                   1. Strip author & producer metadata
   2. Format conversion (JPEG/PNG)          2. Slice excess pages (maxPages)
   3. Resize within maxDimensions           3. Re-save compact buffer
   4. Grayscale if required                              │
   5. Iterative Compression (90% -> 10%)                 │
         │                                               │
         └───────────────────────┬───────────────────────┘
                                 ▼
                     [ Compliance Verification ]
                     - Byte size <= maxSizeBytes
                     - Extension in acceptedFormats
                                 ▼
                    [ Return Compliant Temp File ]
```

---

### 6.4. Frontend Application Center (`frontend/src/features/dashboard/NewApplication.jsx`)

Split-screen layout designed for high transparency:

- **Left Pane (Interactive AI Conversation):**
  - Displays conversational turns from `InterviewAI`.
  - Renders inline choice pills/options extracted directly from target portal dropdowns.
  - Inline document uploader with real-time compression feedback.
  - Displays inline CAPTCHA images when automation enters `PAUSED_CAPTCHA`.
  - Review Summary Table before final execution.
- **Right Pane (Execution Monitor):**
  - Real-time status badges: `Idle`, `ANALYZING`, `INTERVIEWING`, `READY_TO_EXECUTE`, `RUNNING`, `PAUSED_*`, `COMPLETED`, `FAILED`.
  - Progress bar based on `currentStepIndex / totalSteps`.
  - Live screenshot feed of the target portal.
  - Real-time execution log drawer with error recovery details.

---

## 7. Canonical Data Schemas (MongoDB & Pydantic)

### 7.1. Workflow Schema (`ai-service/core/models.py` & MongoDB `Workflow`)
```json
{
  "name": "National Scholarship Portal 2026",
  "url": "https://scholarships.gov.in/fresh",
  "urlHash": "sha256_hash",
  "schemaVersion": "2.0",
  "landingScreenshot": "base64_string",
  "pages": [
    {
      "id": "step_1_personal",
      "title": "Personal Details",
      "steps": [
        {
          "id": "fullName",
          "type": "text",
          "label": "Full Name as per Aadhaar",
          "selector": "#txt_name",
          "required": true,
          "validation": { "pattern": "^[A-Za-z ]+$" },
          "options": {}
        },
        {
          "id": "identityProof",
          "type": "file",
          "label": "Upload Aadhaar Card",
          "selector": "input[name='file_aadhaar']",
          "required": true,
          "constraints": {
            "acceptedFormats": [".jpg", ".pdf"],
            "maxSizeBytes": 204800
          }
        }
      ]
    }
  ]
}
```

### 7.2. Execution Plan Schema (`ai-service/core/models.py` & `AutomationJob.executionPlan`)
```json
{
  "targetUrl": "https://scholarships.gov.in/fresh",
  "totalSteps": 5,
  "steps": [
    {
      "type": "navigate",
      "url": "https://scholarships.gov.in/fresh",
      "description": "Open portal"
    },
    {
      "type": "fill",
      "selector": "#txt_name",
      "field": "fullName",
      "value": "Jane Doe",
      "description": "Enter Full Name"
    },
    {
      "type": "pause",
      "pauseReason": "CAPTCHA",
      "field": "captchaCode",
      "captchaSelector": "#imgCaptcha",
      "description": "Wait for user to enter CAPTCHA"
    },
    {
      "type": "fill",
      "selector": "#txt_captcha",
      "field": "captchaCode",
      "description": "Enter solved CAPTCHA"
    },
    {
      "type": "click",
      "selector": "#btnSubmit",
      "description": "Submit application"
    }
  ],
  "confidence": 0.95
}
```

### 7.3. Interview State Schema (MongoDB `InterviewState`)
```json
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "workflowId": "ObjectId",
  "status": "IN_PROGRESS | COMPLETED | PAUSED",
  "answers": {
    "fullName": "Jane Doe",
    "email": "jane@example.com",
    "phone": "9876543210"
  },
  "pendingFields": ["income", "identityProof"],
  "completedFields": ["fullName", "email", "phone"],
  "currentField": "income",
  "confidenceScores": {
    "fullName": 0.98,
    "email": 1.0
  }
}
```

---

## 8. Current Implementation Audit & Roadmap Status

| Phase | Description | Status | Implementation Details |
| :---: | :--- | :---: | :--- |
| **0** | Product Architecture | **Done** | Monorepo layout, domain separation, API conventions established. |
| **1** | Foundation | **Done** | Express 5, React 19 + Vite, Python FastAPI, MongoDB operational. |
| **2** | Auth & User Profiles | **Done** | Firebase Authentication + Email OTP + JWT fallback + Profile model. |
| **3** | AI Chat | **Done** | Real-time chat loop, markdown rendering, options metadata pills. |
| **4** | Knowledge Base (RAG) | **Done** | ChromaDB integration, sentence-transformers, `KnowledgeAgent`. |
| **5** | URL Scanner | **Done** | Deep crawling with Playwright (BFS depth 2, max 10 pages). |
| **6** | Workflow Generator | **Done** | `WorkflowPlanner` with prompt chunking for large forms. |
| **7** | Interview Engine | **Done** | State machine with active-field safety fallback & summary review table. |
| **8** | Document Intelligence | **Done** | `DocumentProcessingEngine` (Sharp/pdf-lib) + `DocumentIntelligenceAgent`. |
| **9** | Browser Automation | **Done** | Playwright executor with 4-tier select & OTP/CAPTCHA pause checkpoints. |
| **10** | Submission Engine | **Done** | Review table generated before execution, receipt screenshot capture. |
| **11** | Tracking & Analytics | **Done** | Application dashboard, stats endpoint, live progress polling. |
| **12** | Notifications | **Done** | In-app notifications & Nodemailer email alerts. |
| **13** | Admin Dashboard | **Done** | Platform metrics, active jobs, user management. |
| **14** | Security | **Done** | Helmet, rate-limiting, JWT middleware, correlation IDs. |
| **15** | Testing & QA | **In Progress** | Unit/reliability tests present in `ai-service/tests/` and `backend/tests/`. End-to-end automation test scripts created. |
| **16** | Deployment & DevOps | **In Progress** | `docker-compose.yml` and Dockerfiles created. CI/CD workflow directory initialized. |
| **17** | AI Learning | **Partial** | `ai-learning.model.js` and `FailureAnalyzer` exist; automated feedback loop pending live data. |
| **18** | Voice Assistant | **Planned** | Speech-to-text / Text-to-speech conversational interface. |
| **19** | Mobile Apps | **Planned** | Flutter iOS/Android application client. |
| **20** | Universal Marketplace | **Planned** | Pre-built catalog of scholarships, government schemes, and licenses. |

---

## 9. Identified Technical Debt & Open Architecture Questions

When collaborating with the next AI, focus on these critical areas:

### 1. Monorepo Shared Package Underutilization
- **Issue:** [`shared/src/index.js`](file:///f:/Applier/shared/src/index.js) is currently empty (0 bytes). Schemas are duplicated in Pydantic (`ai-service/core/models.py`) and Mongoose (`backend/src/**`).
- **Discussion Question:** Should we adopt JSON Schema / Zod as the single source of truth and generate Python Pydantic models and TypeScript/JSDoc types automatically?

### 2. Job Queue Architecture for Scale
- **Issue:** Playwright jobs currently run directly inside the Express event loop via `automation.service.js::executePlan()`. Under heavy load (e.g. 50 simultaneous browser instances), memory usage will spike.
- **Discussion Question:** How should we transition to a distributed background worker architecture using **BullMQ / Redis** or a separate worker pool container for Playwright runners?

### 3. Automated CAPTCHA Solving vs Human Fallback
- **Issue:** All CAPTCHAs currently require manual user input via `PAUSED_CAPTCHA`.
- **Discussion Question:** Should we implement an automated AI vision solve pipeline (e.g., using Qwen 2.5 Vision or lightweight OCR) to attempt solving alphanumeric CAPTCHAs first, falling back to the user only if confidence is $< 0.85$?

### 4. WebSocket vs Polling for Live Execution
- **Issue:** The frontend polls `GET /api/v1/automation/status/:jobId` every 2 seconds during active runs.
- **Discussion Question:** Should we replace polling with **Server-Sent Events (SSE)** or **Socket.io** for lower latency and reduced server overhead?

### 5. Multi-Page Crawling Memory & Anti-Bot Evasion
- **Issue:** Portal scanning launches Playwright with a standard browser context. Sophisticated portals (Cloudflare, Akamai) may block headless Chromium.
- **Discussion Question:** What stealth plugins, proxy rotation, and session warm-up strategies should be integrated into `scanUrl`?

---

## 10. How to Use This Brief

When starting a conversation with another AI, provide this document along with your prompt:

> *"I am sharing the complete architectural brief of Applier (`ARCHITECTURE_PLANNING_BRIEF.md`). Review sections 6 through 9, and help me design [Topic: e.g., BullMQ Worker Architecture / Automated CAPTCHA Pipeline / Phase 15 QA Suite]."*
