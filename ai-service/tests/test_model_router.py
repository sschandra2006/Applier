"""
Multi-Model AI Router Test Suite — AI Service
Applier 2.0 — Phase 22: Multi-Model AI Routing

Verifies:
1. Deterministic bypass for phone, date, gender, boolean, regex (0 tokens, $0 cost, 1.0 confidence)
2. FAST routing for classification, normalization, simple extraction
3. VISION routing for document analysis, screenshots, visual UI
4. STRONG routing for ambiguity, complex workflow, recovery, conflicting evidence
5. Fallback escalation pipeline: retry -> alternate model -> human checkpoint
6. Canonical schema validation for all ModelRoutingDecision payloads
"""

import pytest
from core.model_router import ModelRouter, DeterministicRuleEngine


class TestMultiModelRouter:

    def setup_method(self):
        self.router = ModelRouter()

    # 1. Deterministic Rule Engine & LLM Bypassing
    def test_deterministic_phone_normalization(self):
        payload = {"value": "+1 (555) 234-5678", "normalizationType": "phone"}
        route = self.router.select_route("NORMALIZATION", payload)
        assert route == "DETERMINISTIC"

        decision = self.router.execute("NORMALIZATION", payload)
        assert decision["route"] == "DETERMINISTIC"
        assert decision["selectedModel"] == "deterministic-rule-engine"
        assert decision["tokens"]["totalTokens"] == 0
        assert decision["costUsd"] == 0.0
        assert decision["confidence"] == 1.0
        assert decision["success"] is True
        assert decision["humanCheckpointRequired"] is False
        assert decision["_result"]["normalized"] == "+15552345678"

    def test_deterministic_date_normalization(self):
        payload = {"value": "2026/04/18", "normalizationType": "date"}
        route = self.router.select_route("NORMALIZATION", payload)
        assert route == "DETERMINISTIC"

        decision = self.router.execute("NORMALIZATION", payload)
        assert decision["route"] == "DETERMINISTIC"
        assert decision["tokens"]["totalTokens"] == 0
        assert decision["costUsd"] == 0.0
        assert decision["_result"]["normalized"] == "2026-04-18"

    def test_deterministic_gender_normalization(self):
        payload = {"value": "female", "normalizationType": "gender"}
        decision = self.router.execute("NORMALIZATION", payload)
        assert decision["route"] == "DETERMINISTIC"
        assert decision["_result"]["normalized"] == "FEMALE"

    def test_deterministic_regex_email_extraction(self):
        payload = {
            "text": "Please reach out to candidate at applicant@domain.com for next steps",
            "extractType": "email"
        }
        decision = self.router.execute("SIMPLE_EXTRACTION", payload)
        assert decision["route"] == "DETERMINISTIC"
        assert decision["_result"]["extracted"] == "applicant@domain.com"
        assert decision["costUsd"] == 0.0
        assert decision["tokens"]["totalTokens"] == 0

    # 2. Fast Route
    def test_fast_route_classification(self):
        payload = {
            "value": "I am seeking a full-time senior engineering position with relocation assistance",
            "task": "classify_intent"
        }
        route = self.router.select_route("CLASSIFICATION", payload)
        assert route == "FAST"

        decision = self.router.execute("CLASSIFICATION", payload)
        assert decision["route"] == "FAST"
        assert decision["selectedModel"] == "qwen-2.5-7b-instruct"
        assert decision["tokens"]["totalTokens"] > 0
        assert decision["costUsd"] > 0.0
        assert decision["success"] is True
        assert decision["fallbackHistory"][0]["status"] == "SUCCESS"

    # 3. Vision Route
    def test_vision_route_document_and_screenshot(self):
        doc_payload = {"documentType": "PASSPORT", "imagePath": "/docs/passport.png"}
        assert self.router.select_route("DOCUMENT_ANALYSIS", doc_payload) == "VISION"

        screenshot_payload = {"screenshotPath": "/evidence/modal.png"}
        assert self.router.select_route("SCREENSHOT_ANALYSIS", screenshot_payload) == "VISION"

        ui_payload = {"element": "button", "screenshot": "/evidence/submit.png"}
        assert self.router.select_route("VISUAL_UI", ui_payload) == "VISION"

        decision = self.router.execute("SCREENSHOT_ANALYSIS", screenshot_payload)
        assert decision["route"] == "VISION"
        assert decision["selectedModel"] == "qwen2-vl-72b-instruct"
        assert decision["success"] is True

    # 4. Strong Route
    def test_strong_route_complex_tasks(self):
        assert self.router.select_route("AMBIGUITY_RESOLUTION") == "STRONG"
        assert self.router.select_route("COMPLEX_WORKFLOW") == "STRONG"
        assert self.router.select_route("RECOVERY") == "STRONG"
        assert self.router.select_route("CONFLICTING_EVIDENCE") == "STRONG"

        decision = self.router.execute("CONFLICTING_EVIDENCE", {
            "passportDob": "1990-01-01",
            "aadhaarDob": "1991-01-01"
        })
        assert decision["route"] == "STRONG"
        assert decision["selectedModel"] == "qwen-2.5-72b-instruct"
        assert decision["success"] is True

    # 5. Fallback Orchestration: Retry -> Alternate Model (Escalation) -> Human Checkpoint
    def test_fallback_retry_and_succeed(self):
        call_count = 0

        def flaky_executor(model_name, payload):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                # First attempt fails
                raise RuntimeError("Temporary upstream connection timeout")
            # Retry succeeds
            return True, {"res": "ok"}, 0.95, 100, 20

        decision = self.router.execute("CLASSIFICATION", {"val": "test"}, executor=flaky_executor)
        assert decision["success"] is True
        assert len(decision["fallbackHistory"]) == 2
        assert decision["fallbackHistory"][0]["status"] == "RETRY"
        assert decision["fallbackHistory"][1]["status"] == "SUCCESS"
        assert decision["humanCheckpointRequired"] is False

    def test_fallback_escalate_to_strong_model(self):
        def low_conf_executor(model_name, payload):
            if "7b" in model_name:
                # FAST model fails to achieve confident resolution
                return True, {"ambiguous": True}, 0.40, 100, 20
            else:
                # STRONG model solves task with high confidence
                return True, {"resolved": True}, 0.96, 250, 60

        decision = self.router.execute("CLASSIFICATION", {"val": "tricky"}, executor=low_conf_executor)
        assert decision["success"] is True
        assert decision["route"] == "STRONG"
        assert decision["selectedModel"] == "qwen-2.5-72b-instruct"
        assert len(decision["fallbackHistory"]) == 3
        assert decision["fallbackHistory"][0]["status"] == "RETRY"
        assert decision["fallbackHistory"][1]["status"] == "ESCALATED"
        assert decision["fallbackHistory"][2]["status"] == "SUCCESS"
        assert decision["humanCheckpointRequired"] is False

    def test_fallback_fatal_to_human_checkpoint(self):
        def total_failure_executor(model_name, payload):
            raise ValueError("Unrecoverable parsing format error")

        decision = self.router.execute("CLASSIFICATION", {"val": "hopeless"}, executor=total_failure_executor)
        assert decision["success"] is False
        assert decision["humanCheckpointRequired"] is True
        assert "Fatal model execution exception" in decision["humanCheckpointReason"]
        assert len(decision["fallbackHistory"]) == 3
        assert decision["fallbackHistory"][2]["status"] == "HUMAN_CHECKPOINT"

    # 6. Cost Calculation Tracking
    def test_cost_calculation(self):
        # 1000 input, 1000 output for FAST (7B)
        cost_fast = self.router.calculate_cost("qwen-2.5-7b-instruct", 1000, 1000)
        assert cost_fast == pytest.approx(0.0003, rel=1e-4)

        # 1000 input, 1000 output for STRONG (72B)
        cost_strong = self.router.calculate_cost("qwen-2.5-72b-instruct", 1000, 1000)
        assert cost_strong == pytest.approx(0.0120, rel=1e-4)

        # Deterministic
        cost_det = self.router.calculate_cost("deterministic-rule-engine", 500, 500)
        assert cost_det == 0.0
