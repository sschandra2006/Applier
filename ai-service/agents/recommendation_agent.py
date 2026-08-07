import logging
from core.llm_service import llm_service
from core.models import RecommendationList

logger = logging.getLogger("RecommendationAgent")

class RecommendationAgent:
    """
    Analyzes user profile, pending workflows, and application history 
    to suggest recommended actions (e.g. upload missing documents, apply for eligible schemes).
    """

    def process(self, context: dict) -> dict:
        user_profile = context.get("user_profile", {})
        workflow = context.get("workflow", {})
        documents = context.get("documents", [])

        prompt = f"""
Given the following user context, generate smart recommended next actions for the user.

User Profile: {user_profile}
Current Workflow: {workflow.get('name', 'N/A')}
Uploaded Documents: {[d.get('name') or d.get('type') for d in documents]}

Provide actionable recommendations like uploading required missing documents (Passport, Aadhaar, Income Certificate) or verifying eligibility details.
"""

        try:
            res = llm_service.generate_safe_json(
                prompt=prompt,
                schema_model=RecommendationList,
                temperature=0.3
            )
            return {
                "action": "recommendations_ready",
                "recommendations": [r.model_dump() for r in res.recommendations],
                "summary": res.summary,
                "confidence": res.confidence
            }
        except Exception as e:
            logger.error(f"[RecommendationAgent] Recommendation generation failed: {e}")
            return {
                "action": "recommendations_ready",
                "recommendations": [],
                "confidence": 0.0,
                "error": str(e)
            }
