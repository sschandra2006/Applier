class ContextBuilder:
    @staticmethod
    def build_context(payload: dict) -> dict:
        """
        Normalizes the incoming payload from Node.js into a standard context object.
        Ensures agents don't have to assemble context themselves.
        """
        return {
            "conversation": payload.get("conversation", []),
            "workflow": payload.get("workflow", {}),
            "user_profile": payload.get("user_profile", {}),
            "documents": payload.get("documents", []),
            "portal_context": payload.get("portal_context", {}),
            "raw_data": payload.get("raw_data", {}), # e.g. HTML, URLs, etc.
            "state": payload.get("state", {}),
            "lastUserMessage": payload.get("lastUserMessage", "")
        }

context_builder = ContextBuilder()
