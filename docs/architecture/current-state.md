# Current State Architecture Baseline

> **Module:** Architecture Baseline & State of the System  
> **Status:** Phase 0 Verified  
> **Source of Truth:** Codebase inspection of `f:\Applier`  

---

## 1. Executive Summary

Applier is an end-to-end autonomous application submission system designed to:
1. Ingest any third-party portal URL.
2. Crawl and analyze multi-page forms using headless Playwright.
3. Synthesize a canonical multi-step workflow schema using Python AI agents.
4. Interview the applicant conversationally, mapping answers to target fields.
5. Ingest, optimize, and compress uploaded user documents (`sharp` & `pdf-lib`) to match extracted portal constraints.
6. Plan an ordered automation sequence (`navigate`, `fill`, `select`, `upload`, `pause`, `click`, `screenshot`).
7. Execute the browser automation live in Chromium, pausing for human intervention on OTP or CAPTCHA.
8. Capture final application confirmation receipts and track status in MongoDB.

---

## 2. Implemented Subsystems & Topology

The system comprises three primary runtime services coordinated over HTTP:

```
[ Frontend: React 19 + Vite ] ──(REST / JWT)──► [ Backend: Express 5 Gateway ]
                                                        │              ▲
                                    (Internal REST :8000)│              │ (Webhook :5000)
                                                        ▼              │
                                                [ AI Service: FastAPI ]
                                                        │
                                                        ▼
                                                [ ChromaDB Vector Store ]
```

### 2.1. Frontend Service (`frontend/`)
- **Technology:** React 19.2.7, Vite 8.1.1, Tailwind CSS 4.3.3, Lucide React, Axios.
- **Port:** 5173 (Development) / 80 (Docker).
- **Architecture:** Client-side SPA using React Router 7.
- **State Management:** React Context (`AuthContext`), React hooks (`useState`, `useEffect`, `useRef`).
- **Core Views:**
  - `AuthForm.jsx`: Firebase Email/Password & OTP authentication.
  - `NewApplication.jsx`: Unified dual-pane view (Conversational Q&A chat on left; live Playwright execution monitor, browser preview screenshot, and pause checkpoint resolver on right).
  - `Dashboard.jsx`: Application tracking table, metric cards, logs modal, resumption modal.
  - `DocumentVault.jsx`: File upload and management interface.
  - `AdminDashboard.jsx`: Platform-wide job and user monitoring.
  - `Settings.jsx`: Profile editing and system preferences.

### 2.2. Backend Service (`backend/`)
- **Technology:** Node.js 20+ (ES Modules), Express 5.2.1, Mongoose 9.7.4.
- **Port:** 5000.
- **Role:** Central API Gateway, security perimeter, system of record, document processing pipeline, and Playwright execution host.
- **Database:** MongoDB (local or Atlas) via Mongoose schemas.
- **Key Modules:**
  - `server.js`: Express bootstrap, DNS IPv4 resolution priority, Helmet, CORS, Rate limiting (1000 req/15min), Pino logging, uncaught rejection handlers.
  - `workflow/`: Crawl trigger and AI workflow generation coordinator.
  - `interview/`: Session state machine with fuzzy field matcher and active-field fallback.
  - `automation/`: Playwright crawler (`scanUrl`), executor (`executePlan`), and resume handler (`resumePlan`).
  - `documents/`: Multer disk storage and `DocumentProcessingEngine` (Sharp image resizing/compression + pdf-lib page slicing).
  - `auth/`: Firebase Admin token verification, Email OTP generation/validation via Nodemailer, JWT signing.
  - `tracking/`: Application history and metric aggregation.
  - `admin/`: System-level job and user inspection.

### 2.3. AI Microservice (`ai-service/`)
- **Technology:** Python 3.11+, FastAPI 0.115+, Uvicorn, Pydantic v2.
- **Port:** 8000.
- **Role:** Pure reasoning engine hosting a 10-agent orchestrator.
- **LLM Engine:**
  - Primary: `Qwen/Qwen2.5-Coder-32B-Instruct` / `Qwen/Qwen2.5-7B-Instruct` via Hugging Face Inference API.
  - Configurable OpenAI-compatible serverless endpoint via `LLM_BASE_URL`.
  - JSON Resilience: `generate_safe_json` pipeline utilizing AST repairing via `json_repair` and schema validation retries.
- **Vector Storage:** ChromaDB (`./chroma_db`) with `sentence-transformers/all-MiniLM-L6-v2` embeddings for portal rules RAG.

---

## 3. Deployment Topology & Container Architecture

- **Docker Compose:** [`docker-compose.yml`](file:///f:/Applier/docker-compose.yml) defines 4 services:
  1. `mongodb`: Mongo 6.0 on port 27017 with persistent volume.
  2. `backend`: Built from `backend/Dockerfile`, exposed on port 5000.
  3. `ai-service`: Built from `ai-service/Dockerfile`, exposed on port 8000.
  4. `frontend`: Built from `frontend/Dockerfile`, exposed on port 80.
- **Local Dev Runner:** Root [`package.json`](file:///f:/Applier/package.json) runs `concurrently` launching `start:frontend`, `start:backend`, and `start:ai`.
- **CI/CD:** GitHub Actions workflow in [`.github/workflows/ci.yml`](file:///f:/Applier/.github/workflows/ci.yml) testing backend, frontend, and ai-service on push/PR to `main`.

---

## 4. Current State Assessment vs Documented Roadmap

| Roadmap Area | Current Status in Codebase | Verification |
| :--- | :--- | :--- |
| **Phases 0–2 (Foundation & Auth)** | **Fully Implemented** | Working Firebase Auth, Email OTP, JWT, User & Profile models. |
| **Phase 3 (AI Chat)** | **Fully Implemented** | Conversational message loop, Conversation & Message models. |
| **Phase 4 (RAG Knowledge Base)** | **Fully Implemented** | ChromaDB vector store + `KnowledgeAgent` integration. |
| **Phase 5 (URL Scanner)** | **Fully Implemented** | Multi-page Playwright crawling, CTA discovery, DOM extraction. |
| **Phase 6 (Workflow Generator)** | **Fully Implemented** | `WorkflowPlanner` with prompt chunking for >50 inputs. |
| **Phase 7 (Interview Engine)** | **Fully Implemented** | Dynamic Q&A, active field fallback, summary review table. |
| **Phase 8 (Document Intelligence)** | **Fully Implemented** | `DocumentProcessingEngine` (Sharp/pdf-lib) + `DocumentIntelligenceAgent`. |
| **Phase 9 (Browser Automation)** | **Fully Implemented** | Resumable Playwright executor, 4-tier select, OTP/CAPTCHA pause. |
| **Phase 10 (Submission Engine)** | **Fully Implemented** | Review summary table generation, confirmation screenshot. |
| **Phase 11 (Tracking & Analytics)**| **Fully Implemented** | Status dashboard, stats endpoint, live progress polling. |
| **Phase 12 (Notifications)** | **Fully Implemented** | In-app notification queue + Nodemailer email transport. |
| **Phase 13 (Admin Dashboard)** | **Fully Implemented** | Admin statistics, user listing, job inspector. |
| **Phase 14 (Security & Resilience)**| **Fully Implemented**| Helmet, rate limiter, correlation IDs, process shutdown guards. |
| **Phase 15 (Testing & QA)** | **In Progress / Partial**| Pytest & Jest run; several integration test areas missing. |
| **Phase 16 (DevOps & Deployment)** | **In Progress / Partial**| Docker Compose present; configuration discrepancies detected. |
| **Phases 17–20 (Learning, Voice, Mobile, Marketplace)** | **Unimplemented / Future** | Models exist (`AILearning`); runtime loops not yet implemented. |
