from services.interview_ai import process_interview_turn
import asyncio
import logging

logger = logging.getLogger("ConversationAgent")

class ConversationAgent:
    """
    Drives the conversational interview loop.
    Receives interview state + last user message and returns
    the next AI question and extracted answer data.
    """

    def process(self, context: dict) -> dict:
        # Support two calling conventions:
        # 1. Direct from interview service: { state: {...}, lastUserMessage: "..." }
        # 2. Via orchestrator with workflow context for first-message generation
        state = context.get("state") or self._build_state_from_context(context)
        last_user_message = context.get("lastUserMessage", "Hello, I'd like to start my application.")

        try:
            # process_interview_turn is async — run it in the current event loop
            result = asyncio.get_event_loop().run_until_complete(
                process_interview_turn(state, last_user_message)
            )

            # Normalise output: interview_ai returns ExtractedAnswer fields
            return {
                "action": "ask_question",
                "message": result.get("question", "Could you please clarify your last answer?"),
                "question": result.get("question", ""),
                "extracted_data": result.get("extracted_data", {}),
                "nextField": result.get("nextField", ""),
                "confidence": result.get("confidence", 0.85),
                "requiresClarification": result.get("requiresClarification", False),
            }

        except Exception as e:
            logger.error(f"[ConversationAgent] Failed to process interview turn: {e}", exc_info=True)
            return {
                "action": "ask_question",
                "message": "I'm sorry, I had trouble processing that. Could you repeat your answer?",
                "question": "Could you please repeat your answer?",
                "extracted_data": {},
                "nextField": "",
                "confidence": 0.0,
                "requiresClarification": True,
            }

    def _build_state_from_context(self, context: dict) -> dict:
        """Build a minimal interview state dict from orchestrator context for first-message generation."""
        workflow = context.get("workflow", {})
        pending_fields = []

        # Flatten pages → steps to collect required field IDs
        for page in workflow.get("pages", []):
            for step in page.get("steps", []):
                if step.get("required") and step.get("id"):
                    pending_fields.append(step["id"])

        return {
            "answers": {},
            "pendingFields": pending_fields,
            "completedFields": [],
            "currentStep": pending_fields[0] if pending_fields else None,
            "availableDocuments": context.get("documents", []),
        }
