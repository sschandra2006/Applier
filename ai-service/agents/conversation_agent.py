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
            result = process_interview_turn(state, last_user_message)


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
        """Build an interview state dict with field details from orchestrator context for message generation."""
        workflow = context.get("workflow", {})
        pending_fields = []
        field_details = {}

        # Flatten pages -> steps to collect field IDs and rich metadata
        for page in workflow.get("pages", []):
            page_title = page.get("title", "")
            for step in page.get("steps", []):
                s_id = step.get("id")
                if s_id and s_id not in pending_fields:
                    pending_fields.append(s_id)
                    field_details[s_id] = {
                        "label": step.get("label", s_id),
                        "type": step.get("type", "text"),
                        "required": step.get("required", True),
                        "options": step.get("options"),
                        "page_title": page_title,
                        "validation": step.get("validation")
                    }

        app_options = workflow.get("metadata", {}).get("applicationOptions") or []

        return {
            "answers": {},
            "pendingFields": pending_fields,
            "fieldDetails": field_details,
            "applicationOptions": app_options,
            "completedFields": [],
            "currentStep": pending_fields[0] if pending_fields else None,
            "availableDocuments": context.get("documents", []),
        }
