# Local Development Setup Guide — Applier 3.0

This guide walks you through setting up the complete Applier 3.0 stack on your local workstation for development and testing.

---

## 1. System Prerequisites

Ensure the following tools are installed:
* **Node.js:** `v20.x` or later (LTS recommended)
* **Python:** `3.11` to `3.13`
* **MongoDB:** `7.0` running locally on port `27017`
* **Redis:** Optional (fallback to in-memory queue is enabled by default)
* **Google Chrome:** Version 116+ (requires Manifest V3 Side Panel API support)

---

## 2. Repository Cloning & Directory Layout

```bash
git clone https://github.com/sschandra2006/Applier.git
cd Applier
```

Repository structure:
* `backend/` — Express.js REST API, workflow orchestrator, AES-256 vault, security filters
* `ai-service/` — FastAPI microservice for requirement matching, gap questions, resume tailoring
* `extension/` — Chrome Extension Manifest V3 (Popup, Side Panel, Background worker, Content scripts)
* `shared/` — Common enums, schemas, and contract validators
* `scratch/` — Local browser tests and HTML mock application portals

---

## 3. Backend Setup

1. Open a terminal in `backend/`:
   ```bash
   cd backend
   npm install
   ```

2. Create your local environment file:
   ```bash
   cp .env.example .env
   ```

3. Configure minimum required variables in `backend/.env`:
   ```env
   PORT=5000
   NODE_ENV=development
   MONGO_URI=mongodb://127.0.0.1:27017/applier
   FIREBASE_PROJECT_ID=applier-local
   FIREBASE_CLIENT_EMAIL=admin@applier-local.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
   JWT_SECRET=super_secret_local_jwt_key_at_least_32_characters_long!
   DOCUMENT_ENCRYPTION_KEY=local_32_byte_aes_gcm_master_encryption_key!
   PYTHON_API_URL=http://127.0.0.1:8000/api/v1/ai/execute
   USE_IN_MEMORY_QUEUE=true
   ```

4. Verify the backend starts:
   ```bash
   npm start
   ```
   *Health endpoint:* `http://127.0.0.1:5000/api/v1/health` $\to$ `{"success": true, "message": "Applier API is running"}`.

---

## 4. Python AI Service Setup

1. Open a terminal in `ai-service/`:
   ```bash
   cd ai-service
   ```

2. Create a virtual environment and activate it:
   ```bash
   # Windows:
   python -m venv venv
   .\venv\Scripts\activate

   # macOS / Linux:
   python3 -m venv venv
   source venv/bin/activate
   ```

3. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Create your AI service environment file:
   ```bash
   cp .env.example .env
   ```
   *(By default, the AI service runs in offline mode using local deterministic vector fallbacks and mock LLM tailoring if no HuggingFace token is provided).*

5. Verify the AI service runs:
   ```bash
   python main.py
   ```
   *Endpoint:* `http://127.0.0.1:8000/docs` (Swagger UI).

---

## 5. Chrome Extension Build & Installation

1. Build the bundled content script:
   ```bash
   cd extension
   npm run build
   ```
   *(This uses `esbuild` to compile `src/content/index.js` into `src/content/content.bundle.js`)*.

2. Load into Google Chrome:
   * Open Chrome and navigate to `chrome://extensions/`.
   * Enable **Developer mode** using the toggle in the upper right.
   * Click the **Load unpacked** button.
   * Select the folder `f:/Applier/extension`.
   * The **Applier — Tailored Resume & Job Application Assistant** extension will appear with its blue toolbar icon.

---

## 6. Running the Stack Concurrently

You can start both backend and AI service with one command from the repository root:
```bash
npm start
```
Concurrently will launch:
* `[BACKEND]` on port `5000`
* `[AI-SVC]` on port `8000`

---

## 7. Testing with Mock Application Portals

To test the extension without modifying live job listings:
1. Start a local static file server in the `scratch/` folder:
   ```bash
   npx serve scratch -p 3000
   ```
2. In Chrome, open `http://localhost:3000/mock_greenhouse_job.html`.
3. Click the **Applier** toolbar icon or open the Chrome Side Panel.
4. Click **Apply with Applier** to experience the complete 23-step workflow locally!
