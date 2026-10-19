# AI Microservice & Multi-Agent Audit

> **Module:** AI Reasoning Subsystem Verification  
> **Status:** Phase 0 Verified  
> **Source of Truth:** Codebase inspection of `ai-service/`  

---

## 1. AI Infrastructure & Orchestration

The AI layer is implemented as an independent Python FastAPI service located at [`ai-service/`](file:///f:/Applier/ai-service/).

### 1.1. Single Ingress Contract
- **Endpoint:** `POST /api/v1/ai/execute` ([`ai-service/api/routes/execute.py`](file:///f:/Applier/ai-service/api/routes/execute.py))
- **Dispatcher:** `AIOrchestrator.execute()` ([`ai-service/core/orchestrator.py`](file:///f:/Applier/ai-service/core/orchestrator.py))
- **Execution Flow:**
  1. Validates intent against registered agent registry.
  2. Builds standardized context via [`core/context_builder.py`](file:///f:/Applier/ai-service/core/context_builder.py).
  3. Executes selected Agent (`agent.process(context)`).
  4. Scores confidence via [`core/confidence_scorer.py`](file:///f:/Applier/ai-service/core/confidence_scorer.py).
  5. Logs structured decision via [`core/ai_logger.py`](file:///f:/Applier/ai-service/core/ai_logger.py).
  6. Tracks token/cost metrics via [`core/cost_manager.py`](file:///f:/Applier/ai-service/core/cost_manager.py).
  7. Returns unified envelope: `{ success, intent, confidence, data }`.

---

## 2. Model Providers & LLM Service Configuration

Implemented in [`ai-service/core/llm_service.py`](file:///f:/Applier/ai-service/core/llm_service.py):

| Property | Value / Implementation |
| :--- | :--- |
| **Primary Model** | `Qwen/Qwen2.5-Coder-32B-Instruct` (Configured via `HF_MODEL` in `.env`) |
| **Fallback Model** | `Qwen/Qwen2.5-72B-Instruct` (Configured via `HF_FALLBACK_MODEL` in `.env`) |
| **Provider Option 1** | Hugging Face Serverless Inference API via `huggingface_hub.InferenceClient` |
| **Provider Option 2** | OpenAI-compatible serverless endpoint via `LLM_BASE_URL` (Together AI, DeepInfra, OpenRouter, Groq, Ollama) |
| **Embedding Model** | `sentence-transformers/all-MiniLM-L6-v2` (384-dimensional vector fallback) |
| **Retry Strategy** | `tenacity`: Max 3 attempts, exponential backoff (min 2s, max 10s) |
| **Response Caching** | SHA-256 hashed prompt lookup against persistent file `ai-service/cache/llm_cache.json` |

---

## 3. JSON Resilience & Safe Generation Pipeline

The `generate_safe_json()` pipeline in [`ai-service/core/llm_service.py`](file:///f:/Applier/ai-service/core/llm_service.py) guarantees valid structured outputs from Qwen 2.5:

```
[ Raw LLM Output ] ──► [ Strip Markdown Fences (```json) ]
                              │
                              ▼
                      [ json.loads() ]
                              │
                    (Fails) ──┴── (Succeeds)
                        │              │
                        ▼              │
               [ json_repair.loads() ] │
                        │              │
                        └──────┬───────┘
                               ▼
               [ Key Normalization (schema_normalizer.py) ]
                               ▼
               [ Pydantic model_validate() ]
                               │
                    (Fails) ──┴── (Succeeds)
                        │              │
                        ▼              ▼
           [ Inject Error Feedback ]  [ Return Validated Object ]
           [ Retry Loop (Max 3) ]
```

---

## 4. Comprehensive Agent Audit & Deterministic Classification

Every agent in [`ai-service/agents/`](file:///f:/Applier/ai-service/agents/) was audited to determine whether it truly requires an LLM or can be replaced/accelerated by deterministic code:

| Agent Name | File | Actual Functionality | LLM vs Deterministic Classification |
| :--- | :--- | :--- | :--- |
| **`WebsiteIntelligenceAgent`** | `agents/website_intelligence_agent.py` | Parses HTML DOM via BeautifulSoup, generates selectors (`id > name > class`), detects inputs, extracts constraints, identifies portal types. | **100% DETERMINISTIC CANDIDATE.**<br>Does **NOT** use the LLM at all. Entirely powered by BeautifulSoup and regex. Fast, reliable, zero token cost. |
| **`ValidationAgent`** | `agents/validation_agent.py` | Two-stage: Stage 1 runs regex rules (`email`, `phone`, `aadhaar`, `pan`, `pincode`, `age`); Stage 2 uses LLM for complex eligibility rules. | **HYBRID.**<br>Stage 1 is 100% deterministic. Stage 2 requires an LLM for semantic eligibility checks. |
| **`RecoveryAgent`** | `agents/recovery_agent.py` | Evaluates Playwright failure logs. Calls `FailureAnalyzer` which applies regex heuristics before falling back to LLM. | **HYBRID.**<br>Known selector failures are deterministic; novel errors use LLM. |
| **`KnowledgeAgent`** | `agents/knowledge_agent.py` | Embeds query, searches ChromaDB vector store, returns top-3 document chunks. | **DETERMINISTIC RAG RETRIEVAL.**<br>Embedding + vector similarity search. Only requires LLM if synthesizing an answer. |
| **`WorkflowPlanner`** | `agents/workflow_planner.py` | Organizes raw inputs into logical pages and steps with human-readable labels. | **LLM REQUIRED.**<br>Semantic grouping and page categorization requires language understanding. |
| **`ConversationAgent`** | `agents/conversation_agent.py` | Dynamic Q&A interview loop. Drives conversational extraction and question generation. | **LLM REQUIRED.**<br>Natural language understanding of conversational user input. |
| **`ExecutionPlanner`** | `agents/execution_planner.py` | Compiles user answers and workflow selectors into ordered Playwright execution steps. | **LLM REQUIRED.**<br>Plans optimal sequence, pause insertion, and button clicks. |
| **`DocumentIntelligenceAgent`**| `agents/document_intelligence_agent.py`| Inspects document images/PDFs (base64) to extract structured fields and verify authenticity. | **LLM / VISION REQUIRED.**<br>Multimodal vision analysis. |
| **`ExplanationAgent`** | `agents/explanation_agent.py` | Translates technical stack traces into user-friendly messages. | **LLM REQUIRED.**<br>Natural language explanation synthesis. |
| **`RecommendationAgent`** | `agents/recommendation_agent.py` | Analyzes user profile and vault to recommend missing documents. | **LLM REQUIRED.**<br>Cross-domain reasoning. |

---

## 5. Prompt & Schema Directory Map

Prompts are externalized into domain directories under [`ai-service/prompts/`](file:///f:/Applier/ai-service/prompts/):

| Domain | Files Present | Target Schema Model |
| :--- | :--- | :--- |
| `conversation/` | `system.md`, `user.md`, `examples.md`, `schema.json` | `ExtractedAnswer` |
| `document/` | `system.md` | `DocumentExtraction` |
| `error/` | `system.md`, `user.md`, `examples.md`, `schema.json` | `RecoveryInsight` / `UserExplanation` |
| `execution/` | `system.md` | `ExecutionPlan` |
| `recommendation/` | `system.md`, `user.md`, `examples.md`, `schema.json` | `RecommendationList` |
| `scanner/` | `system.md`, `user.md`, `examples.md`, `schema.json` | `WorkflowSchema` |
| `shared/` | `system.md`, `user.md`, `examples.md`, `schema.json` | Shared utility schemas |
| `validation/` | `system.md`, `user.md`, `examples.md`, `schema.json` | `ValidationResult` |
| `workflow/` | `system.md`, `user.md`, `examples.md`, `schema.json` | `WorkflowSchema` |

---

## 6. Critical Bug Identified During Baseline Execution

### ❌ Python `AttributeError` in `interview_ai.py`
- **Location:** [`ai-service/services/interview_ai.py`](file:///f:/Applier/ai-service/services/interview_ai.py), line 88:
  ```python
  res = schema_obj.model_dump()
  if not res.get("question") or not str(res.get("question")).trim():
      res["question"] = "Thank you! All required details have been collected."
  ```
- **Error:**
  ```text
  AttributeError: 'str' object has no attribute 'trim'. Did you mean: 'strip'?
  ```
- **Cause:** JavaScript's `.trim()` method was erroneously used instead of Python's `.strip()`.
- **Impact:** Causes `tests/test_full_site_scan_and_interview.py::test_interview_ai_uses_scanned_site_fields` to fail. In production, if an interview turn returns an empty or whitespace question, the service raises an unhandled 500 error instead of setting the fallback message.
- **Migration Action:** Target for safe 1-character bugfix in Phase 1 without altering architectural functionality.
