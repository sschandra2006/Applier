import google.generativeai as genai
from google.generativeai.types import generation_types
from google.api_core.exceptions import ResourceExhausted, ServiceUnavailable, NotFound, InvalidArgument
from core.config import settings
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential
import time
import logging
import hashlib
import json
import os
import json_repair
from pydantic import BaseModel, ValidationError
from core.schema_normalizer import normalize_dict

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("LLMService")

class LLMService:
    def __init__(self):
        self.active_model_name = settings.GEMINI_MODEL
        self.fallback_model_name = settings.GEMINI_FALLBACK_MODEL
        self.cache_file = os.path.join(os.path.dirname(__file__), "..", "cache", "llm_cache.json")
        self.cache = self._load_cache()
        
        if not settings.GEMINI_API_KEY:
            logger.error("GEMINI_API_KEY is missing from environment variables.")
        else:
            genai.configure(api_key=settings.GEMINI_API_KEY)
            
    def _load_cache(self):
        try:
            os.makedirs(os.path.dirname(self.cache_file), exist_ok=True)
            if os.path.exists(self.cache_file):
                with open(self.cache_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load LLM cache: {e}")
        return {}

    def _save_cache(self):
        try:
            with open(self.cache_file, 'w', encoding='utf-8') as f:
                json.dump(self.cache, f)
        except Exception as e:
            logger.error(f"Failed to save LLM cache: {e}")
            
    def startup_check(self):
        """Validates API key and dynamically selects a compatible model if the default is retired."""
        if not settings.GEMINI_API_KEY:
            raise ValueError("Startup Failed: GEMINI_API_KEY is not configured in .env")
            
        logger.info("Running AI Service startup validation...")
        try:
            available_models = [m.name for m in genai.list_models() if 'generateContent' in m.supported_generation_methods]
        except Exception as e:
            logger.error(f"Startup Validation Failed. Could not reach Google AI API: {e}")
            raise RuntimeError(f"Failed to authenticate or connect to Gemini API: {e}")
            
        logger.info(f"Successfully connected to Google AI. Found {len(available_models)} models.")
        
        # Check if active model exists (strip 'models/' if needed)
        active_short = self.active_model_name.replace('models/', '')
        found = any(active_short in m for m in available_models)
        
        if not found:
            logger.warning(f"Configured model '{self.active_model_name}' is not available or retired!")
            # Find closest flash alternative
            flash_models = [m for m in available_models if 'flash' in m]
            if flash_models:
                self.active_model_name = flash_models[0].replace('models/', '')
                logger.warning(f"Auto-Discovery: Switched active model to '{self.active_model_name}'")
            else:
                raise ValueError("Startup Failed: Could not auto-discover a compatible Flash model.")
        else:
            logger.info(f"Verified model '{self.active_model_name}' is available.")
            
    def _should_retry(exception):
        """Only retry transient failures: 429 (ResourceExhausted), 503 (ServiceUnavailable)"""
        return isinstance(exception, (ResourceExhausted, ServiceUnavailable))

    @retry(
        retry=retry_if_exception_type((ResourceExhausted, ServiceUnavailable)),
        stop=stop_after_attempt(settings.GEMINI_MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True
    )
    def _execute_with_retry(self, model_name, prompt, generation_config, system_instruction=None):
        start_time = time.time()
        try:
            # Instantiate dynamically so we can swap models easily
            if system_instruction:
                model = genai.GenerativeModel(model_name, system_instruction=system_instruction)
            else:
                model = genai.GenerativeModel(model_name)
                
            response = model.generate_content(prompt, generation_config=generation_config)
            
            exec_time = time.time() - start_time
            # Logging token usage & telemetry
            in_tokens = response.usage_metadata.prompt_token_count if hasattr(response, 'usage_metadata') else 0
            out_tokens = response.usage_metadata.candidates_token_count if hasattr(response, 'usage_metadata') else 0
            
            # Gemini 1.5 Flash Pricing (approximate)
            in_cost = (in_tokens / 1000000) * 0.075
            out_cost = (out_tokens / 1000000) * 0.30
            total_cost = in_cost + out_cost
            
            logger.info(f"[AI_COST_METRIC] Cache: MISS | Model: {model_name} | Time: {exec_time:.2f}s | In: {in_tokens} | Out: {out_tokens} | Cost: ${total_cost:.6f}")
            
            return response
            
        except NotFound as e:
            # The model is literally missing (404)
            logger.error(f"Model {model_name} threw 404 Not Found. It may have been retired mid-execution.")
            raise e
        except Exception as e:
            logger.error(f"Gemini generation error on {model_name}: {str(e)}")
            raise e

    def generate_content(self, prompt, generation_config=None, system_instruction=None):
        """
        Executes a Gemini generation with auto-fallback, retries, and persistent hashing cache.
        """
        # Hash the inputs for caching
        hash_input = str(prompt) + str(generation_config) + str(system_instruction)
        prompt_hash = hashlib.sha256(hash_input.encode('utf-8')).hexdigest()
        
        if prompt_hash in self.cache:
            logger.info(f"[AI_COST_METRIC] Cache: HIT | Hash: {prompt_hash[:8]}... | Cost: $0.000000")
            # Create a mock response object to mimic Gemini's structure
            class CachedResponse:
                def __init__(self, text):
                    self.text = text
            return CachedResponse(self.cache[prompt_hash])

        try:
            response = self._execute_with_retry(self.active_model_name, prompt, generation_config, system_instruction)
            # Save to cache
            self.cache[prompt_hash] = response.text
            self._save_cache()
            return response
        except NotFound:
            # Cascading fallback
            logger.warning(f"Initiating auto-fallback to {self.fallback_model_name} due to 404 on primary model.")
            try:
                response = self._execute_with_retry(self.fallback_model_name, prompt, generation_config, system_instruction)
                self.cache[prompt_hash] = response.text
                self._save_cache()
                return response
            except Exception as fallback_err:
                logger.critical(f"Fallback model also failed: {str(fallback_err)}")
                raise RuntimeError(f"All AI models failed. Primary 404, Fallback error: {str(fallback_err)}")

    def generate_safe_json(self, prompt: str, schema_model: type[BaseModel], max_retries=3, temperature=0.4, max_output_tokens=4000, system_instruction=None) -> BaseModel:
        """
        Hardened pipeline for generating, repairing, and validating JSON from the LLM.
        Auto-recovers from JSON syntax errors, truncation, and schema validation failures.
        """
        current_prompt = prompt
        
        # We will track retries inside this loop
        for attempt in range(max_retries):
            logger.info(f"[SafeGenerate] Attempt {attempt + 1}/{max_retries}")
            
            # 1. Generate content
            # We construct a GenerationConfig dict for the current attempt
            gen_config = {
                "response_mime_type": "application/json",
                "temperature": temperature,
                "max_output_tokens": max_output_tokens
            }
            
            response = self.generate_content(
                current_prompt,
                generation_config=gen_config,
                system_instruction=system_instruction
            )
            
            # 2. Extract Raw Text
            raw_text = response.text.strip()
            
            # 3. Strip Markdown
            if raw_text.startswith("```json"):
                raw_text = raw_text[7:]
            elif raw_text.startswith("```"):
                raw_text = raw_text[3:]
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3]
            raw_text = raw_text.strip()
            
            # 4. JSON Parsing & Repair
            parsed_json = None
            try:
                parsed_json = json.loads(raw_text)
            except json.JSONDecodeError as json_err:
                logger.warning(f"[SafeGenerate] JSON Parse Failed. Attempting automated repair. Error: {str(json_err)}")
                try:
                    # Attempt robust repair (handles trailing commas, unterminated strings, etc.)
                    parsed_json = json_repair.loads(raw_text)
                    logger.info("[SafeGenerate] Automated JSON repair successful!")
                except Exception as repair_err:
                    logger.error(f"[SafeGenerate] JSON Repair Failed: {str(repair_err)}")
                    # Not repairable, proceed to regeneration
                    pass
            
            # 4.5 Normalization Layer (Fix schema drift and aliases)
            if parsed_json is not None:
                parsed_json = normalize_dict(parsed_json)
            
            # 5. Schema Validation
            if parsed_json is not None:
                try:
                    # Pydantic validation
                    validated_obj = schema_model.model_validate(parsed_json)
                    logger.info("[SafeGenerate] Schema validation passed.")
                    return validated_obj
                except ValidationError as val_err:
                    logger.warning(f"[SafeGenerate] Schema Validation Failed:\n{str(val_err)}")
                    # If this is the last attempt, raise it
                    if attempt == max_retries - 1:
                        raise ValueError(f"Final validation failed after {max_retries} attempts: {str(val_err)}")
                    
                    # 6. Automatic Regeneration Setup
                    # We inject a corrective prompt to force the model to fix its mistake.
                    current_prompt = prompt + f"\n\nCRITICAL SYSTEM FEEDBACK: Your previous response was invalid JSON or failed schema validation.\nError details:\n{str(val_err)}\n\nPlease completely regenerate the response. Return ONLY valid JSON matching the schema, with no markdown formatting."
                    continue
            else:
                if attempt == max_retries - 1:
                    raise ValueError(f"Failed to generate valid JSON after {max_retries} attempts.")
                
                # Setup corrective prompt for broken JSON
                current_prompt = prompt + f"\n\nCRITICAL SYSTEM FEEDBACK: Your previous response was completely broken JSON.\nPlease generate valid JSON with no trailing commas and ensure all strings are terminated."
                continue
                
        raise ValueError("SafeGenerate loop exited unexpectedly.")

    def stream_chat(self, history, new_message, system_instruction=None):
        """
        Stream chat implementation using the resilient model.
        """
        model = genai.GenerativeModel(self.active_model_name, system_instruction=system_instruction)
        try:
            chat = model.start_chat(history=history)
            response = chat.send_message(new_message, stream=True)
            for chunk in response:
                if chunk.text:
                    yield chunk.text
        except NotFound:
            logger.warning(f"Initiating stream chat fallback to {self.fallback_model_name}.")
            fallback_model = genai.GenerativeModel(self.fallback_model_name, system_instruction=system_instruction)
            try:
                chat = fallback_model.start_chat(history=history)
                response = chat.send_message(new_message, stream=True)
                for chunk in response:
                    if chunk.text:
                        yield chunk.text
            except Exception as e:
                yield f"[Error: Fallback model failed: {str(e)}]"
        except Exception as e:
            yield f"[Error communicating with Gemini: {str(e)}]"
            
    @retry(
        retry=retry_if_exception_type((ResourceExhausted, ServiceUnavailable)),
        stop=stop_after_attempt(settings.GEMINI_MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True
    )
    def embed_content(self, text: str, task_type: str = "retrieval_document") -> list[float]:
        result = genai.embed_content(
            model="models/text-embedding-004",
            content=text,
            task_type=task_type,
        )
        return result['embedding']

llm_service = LLMService()
