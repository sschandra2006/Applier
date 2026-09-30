import time
import logging
import hashlib
import json
import os
import requests
import json_repair
from pydantic import BaseModel, ValidationError
from core.schema_normalizer import normalize_dict
from core.config import settings
from tenacity import retry, stop_after_attempt, wait_exponential

try:
    from huggingface_hub import InferenceClient
    HF_HUB_AVAILABLE = True
except ImportError:
    HF_HUB_AVAILABLE = False

try:
    from sentence_transformers import SentenceTransformer
    SENTENCE_TRANSFORMERS_AVAILABLE = True
except ImportError:
    SENTENCE_TRANSFORMERS_AVAILABLE = False

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("LLMService")


class CachedResponse:
    def __init__(self, text: str):
        self.text = text


class LLMService:
    def __init__(self):
        self.active_model_name = settings.HF_MODEL
        self.fallback_model_name = settings.HF_FALLBACK_MODEL
        self.cache_file = os.path.join(os.path.dirname(__file__), "..", "cache", "llm_cache.json")
        self.cache = self._load_cache()
        self.embedder = None

        if HF_HUB_AVAILABLE:
            token = settings.HF_TOKEN if settings.HF_TOKEN else None
            self.client = InferenceClient(api_key=token)
        else:
            self.client = None
            logger.warning("huggingface_hub package not available; using direct HTTP requests fallback.")

    def _load_cache(self):
        try:
            os.makedirs(os.path.dirname(self.cache_file), exist_ok=True)
            if os.path.exists(self.cache_file):
                with open(self.cache_file, "r", encoding="utf-8") as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load LLM cache: {e}")
        return {}

    def _save_cache(self):
        try:
            with open(self.cache_file, "w", encoding="utf-8") as f:
                json.dump(self.cache, f)
        except Exception as e:
            logger.error(f"Failed to save LLM cache: {e}")

    def startup_check(self):
        """Validates AI service configuration for Qwen 2.5 on Hugging Face."""
        logger.info(f"Running AI Service startup validation for model: '{self.active_model_name}'...")
        if not settings.HF_TOKEN:
            logger.warning(
                "HF_TOKEN is not configured in .env. Hugging Face Inference API will run in unauthenticated/rate-limited mode."
            )
        logger.info("Startup validation completed successfully.")

    @retry(
        stop=stop_after_attempt(settings.LLM_MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True,
    )
    def _execute_with_retry(self, model_name, prompt, system_instruction=None, max_tokens=4000, temperature=0.3):
        start_time = time.time()
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": str(prompt)})

        # Custom Pay-As-You-Go Serverless Base URL (Together AI, DeepInfra, OpenRouter, Groq, local Ollama)
        if settings.LLM_BASE_URL:
            url = settings.LLM_BASE_URL
            if not url.endswith("/chat/completions"):
                url = url.rstrip("/") + "/chat/completions"
            headers = {"Content-Type": "application/json"}
            api_key = settings.LLM_API_KEY or settings.HF_TOKEN
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            payload = {
                "model": model_name,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
            }
            resp = requests.post(url, headers=headers, json=payload, timeout=settings.LLM_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
            text_out = data["choices"][0]["message"]["content"]
            exec_time = time.time() - start_time
            logger.info(f"[AI_METRIC] Cache: MISS | PayAsYouGo Provider | Model: {model_name} | Time: {exec_time:.2f}s")
            return CachedResponse(text_out)

        if self.client:
            try:
                response = self.client.chat_completion(
                    messages=messages,
                    model=model_name,
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
                text_out = response.choices[0].message.content
                exec_time = time.time() - start_time
                logger.info(f"[AI_METRIC] Cache: MISS | Model: {model_name} | Time: {exec_time:.2f}s")
                return CachedResponse(text_out)
            except Exception as e:
                logger.error(f"Hugging Face InferenceClient error on {model_name}: {e}")
                raise e
        else:
            # Direct HTTP fallback to HF Inference API router
            url = f"https://api-inference.huggingface.co/models/{model_name}/v1/chat/completions"
            headers = {"Content-Type": "application/json"}
            if settings.HF_TOKEN:
                headers["Authorization"] = f"Bearer {settings.HF_TOKEN}"
            payload = {
                "model": model_name,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
            }
            resp = requests.post(url, headers=headers, json=payload, timeout=settings.LLM_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
            text_out = data["choices"][0]["message"]["content"]
            exec_time = time.time() - start_time
            logger.info(f"[AI_METRIC] Cache: MISS | Model: {model_name} | Time: {exec_time:.2f}s")
            return CachedResponse(text_out)


    def generate_content(self, prompt, generation_config=None, system_instruction=None, use_cache: bool = True):
        """
        Executes generation using Qwen 2.5 with auto-fallback, retries, and caching.
        """
        if use_cache:
            hash_input = str(prompt) + str(generation_config) + str(system_instruction)
            prompt_hash = hashlib.sha256(hash_input.encode("utf-8")).hexdigest()

            if prompt_hash in self.cache:
                logger.info(f"[AI_METRIC] Cache: HIT | Hash: {prompt_hash[:8]}...")
                return CachedResponse(self.cache[prompt_hash])
        else:
            prompt_hash = None

        temp = generation_config.get("temperature", 0.3) if isinstance(generation_config, dict) else 0.3
        max_toks = generation_config.get("max_output_tokens", 4000) if isinstance(generation_config, dict) else 4000

        try:
            response = self._execute_with_retry(
                self.active_model_name,
                prompt,
                system_instruction=system_instruction,
                max_tokens=max_toks,
                temperature=temp,
            )
            if use_cache and prompt_hash:
                self.cache[prompt_hash] = response.text
                self._save_cache()
            return response
        except Exception as e:
            logger.warning(f"Primary model {self.active_model_name} failed: {e}. Initiating fallback to {self.fallback_model_name}")
            try:
                response = self._execute_with_retry(
                    self.fallback_model_name,
                    prompt,
                    system_instruction=system_instruction,
                    max_tokens=max_toks,
                    temperature=temp,
                )
                if use_cache and prompt_hash:
                    self.cache[prompt_hash] = response.text
                    self._save_cache()
                return response
            except Exception as fallback_err:
                logger.critical(f"Fallback model also failed: {fallback_err}")
                logger.warning("Returning graceful fallback AI response.")
                fallback_json = json.dumps({
                    "question": "Could you please provide your details to proceed with your application?",
                    "message": "Could you please provide your details to proceed with your application?",
                    "extracted_data": {},
                    "nextField": "",
                    "confidence": 0.85,
                    "requiresClarification": True
                })
                return CachedResponse(fallback_json)


    def _create_fallback_schema_instance(self, schema_model: type[BaseModel]) -> BaseModel:
        model_name = getattr(schema_model, "__name__", "")
        logger.warning(f"[LLMService] Creating graceful fallback instance for schema model: {model_name}")
        if model_name == "WorkflowSchema":
            from core.models import WorkflowSchema
            return WorkflowSchema(name="Application Workflow", pages=[])
        elif model_name == "ExtractedAnswer":
            from services.interview_ai import ExtractedAnswer
            return ExtractedAnswer(
                question="Could you please provide your details to proceed with your application?",
                nextField="",
                confidence=0.85,
                requiresClarification=True
            )
        try:
            return schema_model.model_construct()
        except Exception:
            return schema_model()

    def generate_safe_json(
        self,
        prompt: str,
        schema_model: type[BaseModel],
        max_retries=3,
        temperature=0.3,
        max_output_tokens=4000,
        system_instruction=None,
        use_cache: bool = True
    ) -> BaseModel:
        """
        Hardened pipeline for generating, repairing, and validating JSON from Qwen 2.5.
        """
        current_prompt = prompt

        for attempt in range(max_retries):
            logger.info(f"[SafeGenerate] Attempt {attempt + 1}/{max_retries}")

            gen_config = {"temperature": temperature, "max_output_tokens": max_output_tokens}

            response = self.generate_content(
                current_prompt, generation_config=gen_config, system_instruction=system_instruction, use_cache=use_cache
            )

            raw_text = response.text.strip()

            if raw_text.startswith("```json"):
                raw_text = raw_text[7:]
            elif raw_text.startswith("```"):
                raw_text = raw_text[3:]
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3]
            raw_text = raw_text.strip()

            parsed_json = None
            try:
                parsed_json = json.loads(raw_text)
            except json.JSONDecodeError as json_err:
                logger.warning(f"[SafeGenerate] JSON Parse Failed. Attempting repair. Error: {json_err}")
                try:
                    parsed_json = json_repair.loads(raw_text)
                    logger.info("[SafeGenerate] Automated JSON repair successful!")
                except Exception as repair_err:
                    logger.error(f"[SafeGenerate] JSON Repair Failed: {repair_err}")

            if parsed_json is not None:
                parsed_json = normalize_dict(parsed_json)
                try:
                    validated_obj = schema_model.model_validate(parsed_json)
                    logger.info("[SafeGenerate] Schema validation passed.")
                    return validated_obj
                except ValidationError as val_err:
                    logger.warning(f"[SafeGenerate] Schema Validation Failed:\n{val_err}")
                    if attempt == max_retries - 1:
                        raise ValueError(f"Final validation failed after {max_retries} attempts: {val_err}")
                    current_prompt = (
                        prompt
                        + f"\n\nCRITICAL FEEDBACK: Previous response failed schema validation.\nError: {val_err}\nReturn ONLY valid JSON matching schema."
                    )
                    continue
            else:
                if attempt == max_retries - 1:
                    raise ValueError(f"Failed to generate valid JSON after {max_retries} attempts.")
                current_prompt = (
                    prompt + "\n\nCRITICAL FEEDBACK: Previous response was broken JSON. Generate strictly valid JSON."
                )
                continue

        raise ValueError("SafeGenerate loop exited unexpectedly.")

    def stream_chat(self, history, new_message, system_instruction=None):
        """
        Streaming chat implementation for Qwen 2.5.
        """
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})

        for msg in history:
            role = "assistant" if msg.get("role") in ["model", "assistant"] else "user"
            parts = msg.get("parts", [msg.get("content", "")])
            content = parts[0] if isinstance(parts, list) and parts else str(parts)
            messages.append({"role": role, "content": content})

        messages.append({"role": "user", "content": new_message})

        if self.client:
            try:
                stream = self.client.chat_completion(
                    messages=messages,
                    model=self.active_model_name,
                    max_tokens=2000,
                    temperature=0.7,
                    stream=True,
                )
                for chunk in stream:
                    if chunk.choices and chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
            except Exception as e:
                yield f"[Error communicating with Qwen 2.5: {e}]"
        else:
            response = self.generate_content(new_message, system_instruction=system_instruction)
            yield response.text

    def embed_content(self, text: str, task_type: str = "retrieval_document") -> list[float]:
        """
        Generates text embeddings using sentence-transformers or HF Inference API.
        """
        if SENTENCE_TRANSFORMERS_AVAILABLE:
            if self.embedder is None:
                self.embedder = SentenceTransformer(settings.EMBEDDING_MODEL)
            embedding = self.embedder.encode(text).tolist()
            return embedding
        elif self.client:
            try:
                embedding = self.client.feature_extraction(text, model=settings.EMBEDDING_MODEL)
                if isinstance(embedding, list):
                    return embedding[0] if isinstance(embedding[0], list) else embedding
            except Exception as e:
                logger.error(f"HF Feature extraction failed: {e}")

        # Deterministic 384-dimensional fallback vector if no embedder present
        h = hashlib.sha256(text.encode("utf-8")).digest()
        vec = [(float(b) / 255.0) for b in h]
        while len(vec) < 384:
            vec.extend(vec[: 384 - len(vec)])
        return vec[:384]


llm_service = LLMService()
