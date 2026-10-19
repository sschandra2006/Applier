"""
Multi-Model AI Router — Applier 2.0 (Phase 22)
Routes tasks to the least expensive/reasoning-intensive model capable of solving them.

Routes:
  - DETERMINISTIC: Pure code/regex/heuristics for normalization & extraction ($0 cost, 0 tokens, <1ms)
  - FAST: Classification, light normalization, simple extraction (e.g. Qwen 2.5 7B)
  - VISION: Document analysis, screenshots, visual UI (e.g. Qwen2-VL)
  - STRONG: Ambiguity resolution, complex workflow, recovery, conflicting evidence (e.g. Qwen 2.5 72B)

Fallback Pipeline:
  Selected Model -> Retry -> Alternate Model (Escalate) -> Human Checkpoint

Tracks:
  model, tokens, latency, cost, confidence, success
"""

import time
import re
import uuid
import logging
from typing import Dict, Any, Optional, Tuple, Callable, List

# Import canonical validator
import os
import sys
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
SHARED_VALIDATORS_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", "..", "shared", "validators"))
if SHARED_VALIDATORS_DIR not in sys.path:
    sys.path.insert(0, SHARED_VALIDATORS_DIR)

from python_validator import validate_canonical

logger = logging.getLogger("ModelRouter")

# Pricing Table (USD per 1,000 tokens)
MODEL_PRICING = {
    "deterministic-rule-engine": {"input": 0.0, "output": 0.0},
    "qwen-2.5-7b-instruct": {"input": 0.0001, "output": 0.0002},
    "gemini-flash": {"input": 0.0001, "output": 0.0002},
    "qwen2-vl-72b-instruct": {"input": 0.0010, "output": 0.0020},
    "gemini-1.5-flash-vision": {"input": 0.0010, "output": 0.0020},
    "qwen-2.5-72b-instruct": {"input": 0.0040, "output": 0.0080},
    "gemini-1.5-pro": {"input": 0.0040, "output": 0.0080}
}

DEFAULT_MODELS = {
    "DETERMINISTIC": "deterministic-rule-engine",
    "FAST": "qwen-2.5-7b-instruct",
    "VISION": "qwen2-vl-72b-instruct",
    "STRONG": "qwen-2.5-72b-instruct"
}

ALTERNATE_MODELS = {
    "FAST": "qwen-2.5-72b-instruct",
    "VISION": "gemini-1.5-flash-vision",
    "STRONG": "gemini-1.5-pro"
}

TASK_ROUTE_MAPPING = {
    # DETERMINISTIC
    "DETERMINISTIC_EXTRACTION": "DETERMINISTIC",
    # FAST
    "CLASSIFICATION": "FAST",
    "NORMALIZATION": "FAST",
    "SIMPLE_EXTRACTION": "FAST",
    # VISION
    "DOCUMENT_ANALYSIS": "VISION",
    "SCREENSHOT_ANALYSIS": "VISION",
    "VISUAL_UI": "VISION",
    # STRONG
    "AMBIGUITY_RESOLUTION": "STRONG",
    "COMPLEX_WORKFLOW": "STRONG",
    "RECOVERY": "STRONG",
    "CONFLICTING_EVIDENCE": "STRONG"
}


class DeterministicRuleEngine:
    """High-speed deterministic logic engine that completely eliminates LLM calls."""

    @staticmethod
    def can_resolve(task_type: str, payload: Dict[str, Any]) -> bool:
        """Determines if the task can be safely resolved deterministically."""
        if task_type == "DETERMINISTIC_EXTRACTION":
            return True

        if task_type == "NORMALIZATION":
            sub_type = payload.get("normalizationType", "").lower()
            val = str(payload.get("value", ""))
            if sub_type in ("phone", "date", "boolean", "gender", "email", "trim", "uppercase", "lowercase"):
                return True
            # Auto-detect if phone or simple date
            if re.match(r"^[\d\s+\-().]{7,25}$", val.strip()):
                return True
            if re.match(r"^\d{1,4}[/\-.]\d{1,2}[/\-.]\d{1,4}$", val.strip()):
                return True

        if task_type == "CLASSIFICATION":
            options = payload.get("options", [])
            val = str(payload.get("value", "")).strip().lower()
            if options and any(str(opt).strip().lower() == val for opt in options):
                return True

        if task_type == "SIMPLE_EXTRACTION":
            pattern = payload.get("regexPattern")
            if pattern:
                return True
            text = payload.get("text", "")
            extract_type = payload.get("extractType", "").lower()
            if extract_type in ("email", "pan", "aadhaar", "phone", "zipcode"):
                return True

        return False

    @staticmethod
    def resolve(task_type: str, payload: Dict[str, Any]) -> Tuple[bool, Any, float]:
        """Resolves task deterministically with 1.0 confidence."""
        val = payload.get("value", "")
        sub_type = payload.get("normalizationType", "").lower()

        # Phone Normalization -> E.164 format
        if sub_type == "phone" or (task_type == "NORMALIZATION" and re.match(r"^[\d\s+\-().]{7,25}$", str(val).strip())):
            digits = re.sub(r"[^\d+]", "", str(val))
            if digits.startswith("+"):
                formatted = digits
            elif len(digits) == 10:
                country_code = payload.get("defaultCountryCode", "+1")
                formatted = f"{country_code}{digits}"
            else:
                formatted = f"+{digits}"
            return True, {"normalized": formatted, "original": val}, 1.0

        # Date Normalization -> ISO YYYY-MM-DD
        if sub_type == "date" or (task_type == "NORMALIZATION" and re.match(r"^\d{1,4}[/\-.]\d{1,2}[/\-.]\d{1,4}$", str(val).strip())):
            raw = str(val).strip()
            parts = re.split(r"[/\-.]", raw)
            if len(parts) == 3:
                p1, p2, p3 = parts
                if len(p1) == 4:  # YYYY-MM-DD
                    yyyy, mm, dd = p1, p2.zfill(2), p3.zfill(2)
                elif len(p3) == 4:
                    if int(p1) > 12:  # DD-MM-YYYY
                        dd, mm, yyyy = p1.zfill(2), p2.zfill(2), p3
                    else:  # MM-DD-YYYY or ambiguous standard
                        mm, dd, yyyy = p1.zfill(2), p2.zfill(2), p3
                else:
                    yyyy, mm, dd = f"20{p3}", p1.zfill(2), p2.zfill(2)
                iso_date = f"{yyyy}-{mm}-{dd}"
                return True, {"normalized": iso_date, "original": val}, 1.0

        # Boolean Normalization
        if sub_type == "boolean":
            s = str(val).strip().lower()
            if s in ("true", "yes", "1", "y", "t"):
                return True, {"normalized": True, "original": val}, 1.0
            if s in ("false", "no", "0", "n", "f"):
                return True, {"normalized": False, "original": val}, 1.0

        # Gender Normalization
        if sub_type == "gender":
            s = str(val).strip().lower()
            if s in ("m", "male", "man"):
                return True, {"normalized": "MALE", "original": val}, 1.0
            if s in ("f", "female", "woman"):
                return True, {"normalized": "FEMALE", "original": val}, 1.0
            return True, {"normalized": "OTHER", "original": val}, 1.0

        # Email / String trimming
        if sub_type == "email":
            norm = str(val).strip().lower()
            return True, {"normalized": norm, "original": val}, 1.0

        # Exact Option Classification
        if task_type == "CLASSIFICATION":
            options = payload.get("options", [])
            s = str(val).strip().lower()
            for opt in options:
                if str(opt).strip().lower() == s:
                    return True, {"classification": opt}, 1.0

        # Deterministic Regex Extractions
        if task_type in ("SIMPLE_EXTRACTION", "DETERMINISTIC_EXTRACTION"):
            text = payload.get("text", "")
            extract_type = payload.get("extractType", "").lower()

            if extract_type == "email" or not extract_type:
                match = re.search(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", text)
                if match:
                    return True, {"extracted": match.group(0), "type": "email"}, 1.0

            if extract_type == "pan":
                match = re.search(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b", text)
                if match:
                    return True, {"extracted": match.group(0), "type": "pan"}, 1.0

            if extract_type == "aadhaar":
                match = re.search(r"\b\d{4}\s?\d{4}\s?\d{4}\b", text)
                if match:
                    return True, {"extracted": match.group(0), "type": "aadhaar"}, 1.0

        return False, None, 0.0


class ModelRouter:
    """
    Intelligent Multi-Model AI Routing Engine.
    Enforces deterministic short-circuiting, tiered routing, cost tracking,
    and automatic escalation fallback.
    """

    def __init__(self, custom_models: Optional[Dict[str, str]] = None):
        self.models = DEFAULT_MODELS.copy()
        if custom_models:
            self.models.update(custom_models)
        self.alternate_models = ALTERNATE_MODELS.copy()
        self.pricing = MODEL_PRICING.copy()
        self.deterministic_engine = DeterministicRuleEngine()

    def select_route(self, task_type: str, payload: Optional[Dict[str, Any]] = None) -> str:
        """
        Determines the most cost-effective route for a given task.
        Priority:
          1. Check if deterministic code is sufficient -> DETERMINISTIC
          2. Map task type to predefined route tier: FAST, VISION, or STRONG
        """
        payload = payload or {}

        # RULE: Do not use an LLM when deterministic code is sufficient
        if self.deterministic_engine.can_resolve(task_type, payload):
            return "DETERMINISTIC"

        return TASK_ROUTE_MAPPING.get(task_type, "STRONG")

    def calculate_cost(self, model: str, input_tokens: int, output_tokens: int) -> float:
        """Computes cost in USD based on model pricing table."""
        rates = self.pricing.get(model, {"input": 0.0040, "output": 0.0080})
        cost = (input_tokens / 1000.0) * rates["input"] + (output_tokens / 1000.0) * rates["output"]
        return round(cost, 6)

    def execute(
        self,
        task_type: str,
        payload: Dict[str, Any],
        executor: Optional[Callable[[str, Dict[str, Any]], Tuple[bool, Any, float, int, int]]] = None
    ) -> Dict[str, Any]:
        """
        Executes task through the optimal route with fallback orchestration.

        Fallback pipeline:
          primary route -> retry on same model -> escalate to STRONG -> human checkpoint

        Returns a canonical ModelRoutingDecision payload.
        """
        start_time = time.perf_counter()
        decision_id = f"mrd_{uuid.uuid4().hex[:12]}"
        route = self.select_route(task_type, payload)
        fallback_history: List[Dict[str, Any]] = []

        total_input_tokens = 0
        total_output_tokens = 0
        total_cost = 0.0
        confidence = 0.0
        success = False
        human_checkpoint_required = False
        human_checkpoint_reason = None
        result_data = None
        selected_model = self.models.get(route, "deterministic-rule-engine")

        # 1. Deterministic Route Execution ($0, 0 tokens)
        if route == "DETERMINISTIC":
            det_ok, det_res, det_conf = self.deterministic_engine.resolve(task_type, payload)
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            if det_ok:
                decision = {
                    "schemaVersion": "2.0.0",
                    "decisionId": decision_id,
                    "taskType": task_type,
                    "route": "DETERMINISTIC",
                    "selectedModel": "deterministic-rule-engine",
                    "tokens": {"inputTokens": 0, "outputTokens": 0, "totalTokens": 0},
                    "latencyMs": latency_ms,
                    "costUsd": 0.0,
                    "confidence": det_conf,
                    "success": True,
                    "fallbackHistory": [],
                    "humanCheckpointRequired": False,
                    "humanCheckpointReason": None
                }
                # Attach data for consumer
                decision["_result"] = det_res
                self._validate_decision(decision)
                return decision
            else:
                # Deterministic check failed -> escalate to FAST
                route = "FAST"
                selected_model = self.models["FAST"]

        # Default mock executor if not provided
        if executor is None:
            def default_mock_executor(model_name: str, p: Dict[str, Any]):
                # Returns: ok, result, confidence, in_tokens, out_tokens
                in_tok = len(str(p)) // 4 + 20
                out_tok = 25
                return True, {"processed": True, "by": model_name}, 0.92, in_tok, out_tok
            executor = default_mock_executor

        # 2. AI Route Execution with Fallback Chain
        current_model = selected_model
        attempt = 1
        max_attempts = 3

        while attempt <= max_attempts:
            try:
                ok, res, conf, in_tokens, out_tokens = executor(current_model, payload)
                call_cost = self.calculate_cost(current_model, in_tokens, out_tokens)

                total_input_tokens += in_tokens
                total_output_tokens += out_tokens
                total_cost += call_cost

                # Check if result meets quality threshold
                is_confident = conf >= 0.65
                if ok and is_confident:
                    success = True
                    confidence = conf
                    result_data = res
                    selected_model = current_model
                    fallback_history.append({
                        "attempt": attempt,
                        "model": current_model,
                        "error": None,
                        "status": "SUCCESS"
                    })
                    break
                else:
                    err_msg = f"Low confidence ({conf:.2f})" if ok else "Execution failed"
                    if attempt == 1:
                        # Attempt 1 failed -> RETRY on same model
                        fallback_history.append({
                            "attempt": attempt,
                            "model": current_model,
                            "error": err_msg,
                            "status": "RETRY"
                        })
                        attempt += 1
                        continue
                    elif attempt == 2:
                        # Attempt 2 failed -> ESCALATE to alternate model
                        fallback_history.append({
                            "attempt": attempt,
                            "model": current_model,
                            "error": err_msg,
                            "status": "ESCALATED"
                        })
                        current_model = self.alternate_models.get(route, "gemini-1.5-pro")
                        if route == "FAST":
                            route = "STRONG"
                        attempt += 1
                        continue
                    else:
                        # Attempt 3 failed -> Trigger Human Checkpoint
                        fallback_history.append({
                            "attempt": attempt,
                            "model": current_model,
                            "error": err_msg,
                            "status": "HUMAN_CHECKPOINT"
                        })
                        human_checkpoint_required = True
                        human_checkpoint_reason = f"Model execution failed across retries and escalation: {err_msg}"
                        success = False
                        confidence = conf
                        selected_model = current_model
                        break

            except Exception as e:
                err_str = str(e)
                if attempt == 1:
                    fallback_history.append({
                        "attempt": attempt,
                        "model": current_model,
                        "error": err_str,
                        "status": "RETRY"
                    })
                    attempt += 1
                elif attempt == 2:
                    fallback_history.append({
                        "attempt": attempt,
                        "model": current_model,
                        "error": err_str,
                        "status": "ESCALATED"
                    })
                    current_model = self.alternate_models.get(route, "gemini-1.5-pro")
                    if route == "FAST":
                        route = "STRONG"
                    attempt += 1
                else:
                    fallback_history.append({
                        "attempt": attempt,
                        "model": current_model,
                        "error": err_str,
                        "status": "HUMAN_CHECKPOINT"
                    })
                    human_checkpoint_required = True
                    human_checkpoint_reason = f"Fatal model execution exception: {err_str}"
                    success = False
                    selected_model = current_model
                    break

        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)

        decision = {
            "schemaVersion": "2.0.0",
            "decisionId": decision_id,
            "taskType": task_type,
            "route": route,
            "selectedModel": selected_model,
            "tokens": {
                "inputTokens": total_input_tokens,
                "outputTokens": total_output_tokens,
                "totalTokens": total_input_tokens + total_output_tokens
            },
            "latencyMs": latency_ms,
            "costUsd": round(total_cost, 6),
            "confidence": round(confidence, 4),
            "success": success,
            "fallbackHistory": fallback_history,
            "humanCheckpointRequired": human_checkpoint_required,
            "humanCheckpointReason": human_checkpoint_reason
        }

        if result_data:
            decision["_result"] = result_data

        self._validate_decision(decision)
        return decision

    def _validate_decision(self, decision: Dict[str, Any]) -> None:
        """Validates payload against canonical model-routing-decision.json schema."""
        # Clean ephemeral private properties before validating
        clean_payload = {k: v for k, v in decision.items() if not k.startswith("_")}
        is_valid, errors = validate_canonical("model-routing-decision", clean_payload)
        if not is_valid:
            logger.error(f"Canonical validation failed for ModelRoutingDecision: {errors}")
            raise ValueError(f"Invalid ModelRoutingDecision: {errors}")


# Global default router singleton
default_model_router = ModelRouter()
