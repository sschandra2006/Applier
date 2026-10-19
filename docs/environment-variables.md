# Environment Variables Reference — Applier 3.0

This document defines all configuration variables used by the Applier 3.0 platform across the Node.js backend and Python AI microservice.

---

## 1. Backend Service Variables (`backend/.env`)

| Variable Name | Type | Default | Required | Description & Security Policy |
| :--- | :--- | :--- | :---: | :--- |
| `PORT` | Number | `5000` | No | HTTP port for the Express REST server. |
| `NODE_ENV` | String | `development` | No | Execution environment (`development`, `production`, `test`). In `production`, stack traces are hidden. |
| `MONGO_URI` | URL | — | **Yes** | Connection string for MongoDB 7.0+ replica set. Must include database name (e.g. `mongodb://127.0.0.1:27017/applier`). |
| `FIREBASE_PROJECT_ID` | String | — | **Yes** | Google Cloud / Firebase project identifier for authentication verification. |
| `FIREBASE_CLIENT_EMAIL`| Email | — | **Yes** | Firebase service account email. |
| `FIREBASE_PRIVATE_KEY` | String | — | **Yes** | RSA private key for Firebase Admin SDK. Escaped newlines (`\n`) must be preserved if stored on a single line. |
| `FIREBASE_STORAGE_BUCKET`| String | `<project>.appspot.com` | No | Bucket name for profile attachments. |
| `JWT_SECRET` | String | — | **Yes** | High-entropy secret (min. 32 characters) used to sign and verify candidate authentication tokens. **Secret**. |
| `DOCUMENT_ENCRYPTION_KEY`| String | — | **Yes** | Master AES-256-GCM encryption key used to encrypt generated PDF resumes and profile records at rest. **Highly Sensitive**. |
| `PYTHON_API_URL` | URL | `http://127.0.0.1:8000/api/v1/ai/execute` | No | Target internal URL for the Python FastAPI microservice. |
| `REDIS_URL` | URL | `redis://127.0.0.1:6379` | No | Connection URI for Redis cache and BullMQ job queue. |
| `REDIS_HOST` | String | `127.0.0.1` | No | Redis host name. |
| `REDIS_PORT` | Number | `6379` | No | Redis port number. |
| `REDIS_PASSWORD` | String | `""` | No | Optional authentication password for Redis. |
| `USE_IN_MEMORY_QUEUE` | Boolean | `false` | No | When `true` (or when `NODE_ENV=test`), uses in-memory job queues, bypassing Redis. |
| `CLAMAV_HOST` | String | `127.0.0.1` | No | Optional host for ClamAV TCP daemon. |
| `CLAMAV_PORT` | Number | `3310` | No | Optional port for ClamAV TCP daemon. |
| `CORS_ORIGIN` | String | — | No | Comma-separated list of allowed origins. Must include `chrome-extension://<EXTENSION_ID>` in production. |

---

## 2. Python AI Service Variables (`ai-service/.env`)

| Variable Name | Type | Default | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `PROJECT_NAME` | String | `Applier AI Service` | No | Microservice display name reported in OpenAPI/Swagger documentation. |
| `LLM_PROVIDER` | String | `huggingface` | No | Provider strategy (`huggingface`, `openai`, `local`, `mock`). |
| `HF_TOKEN` | String | `""` | No | Hugging Face user access token for calling inference endpoints. **Secret**. |
| `LLM_API_KEY` | String | `""` | No | Generic LLM API key fallback. |
| `LLM_BASE_URL` | URL | `""` | No | Custom base URL if using a private vLLM or Ollama instance. |
| `HF_MODEL` | String | `Qwen/Qwen2.5-7B-Instruct` | No | Primary instruction model for requirement matching and resume tailoring. |
| `HF_FALLBACK_MODEL` | String | `Qwen/Qwen2.5-72B-Instruct` | No | High-capacity model used when ambiguity requires complex inference. |
| `EMBEDDING_MODEL` | String | `sentence-transformers/all-MiniLM-L6-v2` | No | Hugging Face model for vector embeddings. Automatically falls back to deterministic vector generation if offline. |
| `LLM_TIMEOUT` | Number | `60` | No | Timeout in seconds for LLM inference calls before triggering fallback. |
| `LLM_MAX_RETRIES` | Number | `3` | No | Number of exponential backoff retry attempts for failed LLM queries. |
| `ALLOWED_ORIGINS` | String | `http://localhost:5000,http://127.0.0.1:5000` | No | Comma-separated list of permitted caller hosts. |
| `NODE_API_URL` | URL | `http://127.0.0.1:5000/api/v1` | No | Internal URL for Node backend callbacks. |

---

## 3. Chrome Extension Environment

The Chrome Extension communicates with the backend via its background client.
* **API Base URL:** Default is `http://127.0.0.1:5000/api/v1`.
* Configurable in [`extension/src/utils/constants.js`](file:///f:/Applier/extension/src/utils/constants.js#L1-L15) under `API_CONFIG.BASE_URL`.
* For production deployments, this URL must point to your HTTPS API gateway (e.g. `https://api.applier.com/api/v1`).

---

## 4. Secrets Management Best Practices

1. **Never Commit Secrets:** `.env` files are ignored by git in `.gitignore`. Only `.env.example` templates may be committed.
2. **Key Rotation:** 
   * `JWT_SECRET` can be rotated without restarting the database; existing active sessions will be required to re-authenticate.
   * `DOCUMENT_ENCRYPTION_KEY` requires running the Vault re-encryption script if rotated, as existing `.enc` files on disk are keyed to this secret.
3. **KMS / Cloud Secret Manager:** In production (AWS ECS, Google Cloud Run, Kubernetes), supply these variables via AWS Secrets Manager, Google Secret Manager, or Kubernetes Sealed Secrets.
