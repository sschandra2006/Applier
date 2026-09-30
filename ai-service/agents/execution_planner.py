import json
import logging
import requests
from core.llm_service import llm_service
from core.models import ExecutionPlan, ExecutionStep
from core.config import settings

logger = logging.getLogger("ExecutionPlanner")

# Load system prompt from prompts directory
import os
_PROMPT_PATH = os.path.join(os.path.dirname(__file__), "..", "prompts", "execution", "system.md")
try:
    with open(_PROMPT_PATH, "r", encoding="utf-8") as f:
        SYSTEM_PROMPT = f.read().strip()
except FileNotFoundError:
    SYSTEM_PROMPT = "You are an expert Playwright automation engineer. Generate a Playwright execution plan as JSON."


class ExecutionPlanner:
    """
    THE CRITICAL AGENT — generates a complete, ordered list of Playwright
    automation steps from the workflow schema and user answers.

    Output is sent to the Node.js backend which runs it through the actual
    Playwright executor (automation.service.js::executePlan).
    """

    def process(self, context: dict) -> dict:
        raw_data = context.get("raw_data", {})
        workflow = context.get("workflow", {})
        answers = raw_data.get("answers", {})
        target_url = raw_data.get("workflowUrl", workflow.get("url", ""))
        job_id = raw_data.get("jobId", "")
        state_id = raw_data.get("stateId", "")

        if not target_url:
            logger.error("[ExecutionPlanner] No target URL provided.")
            return {"action": "execution_failed", "steps": [], "confidence": 0.0, "error": "No target URL"}

        if not workflow:
            logger.warning("[ExecutionPlanner] No workflow schema provided — attempting minimal plan.")

        try:
            execution_plan = self._generate_plan(target_url, workflow, answers)

            logger.info(
                f"[ExecutionPlanner] Generated {len(execution_plan.steps)} steps for {target_url}"
            )

            plan_dict = execution_plan.model_dump()

            # Send the plan back to Node.js so it can execute it via Playwright
            self._send_plan_to_node(job_id, state_id, plan_dict)

            return {
                "action": "execution_planned",
                "steps": plan_dict["steps"],
                "totalSteps": plan_dict["totalSteps"],
                "targetUrl": target_url,
                "confidence": plan_dict["confidence"],
                "notes": plan_dict.get("notes"),
            }

        except Exception as e:
            logger.error(f"[ExecutionPlanner] Plan generation failed: {e}", exc_info=True)
            return {
                "action": "execution_planned",
                "steps": self._build_minimal_plan(target_url, answers),
                "totalSteps": 1,
                "targetUrl": target_url,
                "confidence": 0.3,
                "error": str(e),
            }

    # ──────────────────────────────────────────────────────
    # LLM PLAN GENERATION
    # ──────────────────────────────────────────────────────

    def _generate_plan(self, target_url: str, workflow: dict, answers: dict) -> ExecutionPlan:
        """Call the LLM to generate a structured Playwright execution plan."""

        # Flatten fields from the workflow schema to give the LLM concrete selectors
        all_fields = []
        for page in workflow.get("pages", []):
            for step in page.get("steps", []):
                all_fields.append({
                    "id": step.get("id"),
                    "type": step.get("type"),
                    "label": step.get("label"),
                    "selector": step.get("selector"),
                    "required": step.get("required", False),
                    "options": step.get("options", {}),
                    "metadata": step.get("metadata", {}),
                })

        # Redact sensitive values for logging (not for the prompt)
        prompt = f"""
Generate a complete Playwright automation execution plan for the following application form.

Target URL: {target_url}

Workflow Fields (with CSS selectors):
{json.dumps(all_fields, indent=2)}

User Answers (field_id -> value):
{json.dumps(answers, indent=2)}

Navigation from workflow:
{json.dumps(workflow.get("metadata", {}).get("navigation", {}), indent=2)}

Instructions:
1. Start with a navigate step to: {target_url}
2. For each required field with a selector, add a fill/select/upload/click step in form order.
3. Map each step's `field` to the field ID. Use the user's answers to determine the value.
4. After filling all fields on a page, add a click step for the next/submit button.
5. For CAPTCHA fields (type="captcha", id contains "captcha", or selector contains "captcha"):
   - Add a pause step with `type: "pause"`, `pauseReason: "CAPTCHA"`, `field: "<captcha_field_id>"`.
   - Also set `captchaSelector` to the CSS selector of the CAPTCHA IMAGE element (e.g. "img.captchaImg", "#captchaImage", "canvas.captcha").
   - The automation engine will screenshot that element and show it to the user.
   - After the pause step, add a fill step for the captcha input field — the user's answer will be in answers[field_id].
6. For OTP fields (id/name contains "otp", "password" in a phone-verify context):
   - Add a pause step with `type: "pause"`, `pauseReason: "OTP"`, `field: "<otp_field_id>"`.
   - After the pause step, add a fill step for the OTP input — the user's answer will be in answers[field_id].
7. End with a screenshot step to capture the confirmation.
8. Only use selectors from the provided workflow fields. Do NOT invent selectors.
9. For government forms with verification (like SSC exam number lookup), add a click step for the "Validate/Fetch" button before continuing to the next section.
"""

        plan = llm_service.generate_safe_json(
            prompt=prompt,
            schema_model=ExecutionPlan,
            temperature=0.2,
            max_output_tokens=6000,
            system_instruction=SYSTEM_PROMPT,
        )

        # Ensure totalSteps is consistent
        plan.totalSteps = len(plan.steps)
        plan.targetUrl = target_url
        return plan

    # ──────────────────────────────────────────────────────
    # CALLBACK TO NODE.JS
    # ──────────────────────────────────────────────────────

    def _send_plan_to_node(self, job_id: str, state_id: str, plan: dict) -> None:
        """
        POST the generated execution plan to the Node.js webhook so it can
        persist the steps and start Playwright execution immediately.
        """
        if not job_id:
            logger.warning("[ExecutionPlanner] No jobId provided — skipping Node.js callback.")
            return

        webhook_url = f"{settings.NODE_API_URL}/automation/webhook/plan"
        payload = {
            "jobId": job_id,
            "stateId": state_id,
            "plan": plan,
        }

        try:
            response = requests.post(webhook_url, json=payload, timeout=15)
            if response.status_code == 200:
                logger.info(f"[ExecutionPlanner] Successfully sent plan to Node.js for job {job_id}")
            else:
                logger.warning(
                    f"[ExecutionPlanner] Node.js webhook returned {response.status_code}: {response.text[:200]}"
                )
        except requests.exceptions.RequestException as e:
            logger.error(f"[ExecutionPlanner] Failed to send plan to Node.js: {e}")

    # ──────────────────────────────────────────────────────
    # FALLBACK PLAN
    # ──────────────────────────────────────────────────────

    def _build_minimal_plan(self, target_url: str, answers: dict) -> list:
        """
        Build a minimal navigate-only plan as a fallback when LLM generation fails.
        The Playwright engine can at least get to the right page.
        """
        return [
            {
                "type": "navigate",
                "url": target_url,
                "selector": None,
                "field": None,
                "value": None,
                "description": "Navigate to application URL",
                "waitAfterMs": 2000,
                "constraints": {},
                "pauseReason": None,
            }
        ]
