from pydantic import BaseModel, Field
from typing import List, Optional
import os
import json
from core.llm_service import llm_service

class AILearningInsight(BaseModel):
    targetUrl: str = Field(description="The target URL where the failure occurred.")
    rootCause: str = Field(description="A concise technical description of why the automation failed (e.g. 'Timeout waiting for #submitBtn').")
    suggestedFix: str = Field(description="A concrete recommendation on how to fix the workflow schema.")
    confidence: float = Field(description="A confidence score between 0.0 and 1.0 regarding the accuracy of this insight.")
    updatedSelector: Optional[str] = Field(description="If a CSS selector failed, provide a robust alternative selector if possible.")

class FailureAnalyzer:
    def analyze_failure(self, logs: List[str], url: str) -> dict:
        prompt = f"""
        You are an expert QA Automation Engineer.
        A Playwright automation job failed while executing on {url}.
        Analyze the following recent logs to determine the root cause of the failure and suggest a fix.
        
        Logs:
        {json.dumps(logs, indent=2)}
        """
        
        try:
            schema_obj = llm_service.generate_safe_json(
                prompt=prompt,
                schema_model=AILearningInsight,
                temperature=0.1
            )
            return schema_obj.model_dump()
        except Exception as e:
            return {
                "targetUrl": url,
                "rootCause": f"Analysis Engine Error: {str(e)}",
                "suggestedFix": "Manual investigation required.",
                "confidence": 0.0,
                "updatedSelector": None
            }
