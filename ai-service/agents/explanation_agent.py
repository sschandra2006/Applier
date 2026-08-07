import logging
from core.llm_service import llm_service
from core.models import UserExplanation

logger = logging.getLogger("ExplanationAgent")

class ExplanationAgent:
    """
    Translates raw technical automation errors or status codes into 
    user-friendly plain English explanations with action steps.
    """

    def process(self, context: dict) -> dict:
        raw_data = context.get("raw_data", {})
        error_message = raw_data.get("message", "")
        logs = raw_data.get("logs", [])
        
        if not error_message and not logs:
            return {
                "action": "explained_human",
                "title": "Application Update",
                "message": "The application process encountered a pause or notice.",
                "actionRequired": "Please check the application status.",
                "confidence": 0.8
            }

        prompt = f"""
Translate the following technical application/automation error into a clear, polite, human-friendly explanation for the user.

Technical Error: {error_message}
Logs: {logs}

Explain:
1. What went wrong in simple terms (no stack traces, no DOM selectors unless necessary).
2. What action (if any) the user needs to take to fix it or proceed.
"""

        try:
            explanation = llm_service.generate_safe_json(
                prompt=prompt,
                schema_model=UserExplanation,
                temperature=0.2
            )
            return {
                "action": "explained_human",
                "title": explanation.title,
                "message": explanation.message,
                "actionRequired": explanation.actionRequired,
                "confidence": explanation.confidence
            }
        except Exception as e:
            logger.error(f"[ExplanationAgent] Failed to generate explanation: {e}")
            return {
                "action": "explained_human",
                "title": "Application Issue",
                "message": f"An issue occurred during application processing: {error_message or 'System error'}",
                "actionRequired": "Please verify your details and try again.",
                "confidence": 0.5
            }
