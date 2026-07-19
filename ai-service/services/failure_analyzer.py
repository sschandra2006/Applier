from pydantic import BaseModel, Field
from typing import List, Optional
import os
import json
import google.generativeai as genai
from core.config import settings

class AILearningInsight(BaseModel):
    targetUrl: str = Field(description="The target URL where the failure occurred.")
    rootCause: str = Field(description="A concise technical description of why the automation failed (e.g. 'Timeout waiting for #submitBtn').")
    suggestedFix: str = Field(description="A concrete recommendation on how to fix the workflow schema.")
    confidence: float = Field(description="A confidence score between 0.0 and 1.0 regarding the accuracy of this insight.")
    updatedSelector: Optional[str] = Field(description="If a CSS selector failed, provide a robust alternative selector if possible.")

class FailureAnalyzer:
    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY
        
    def analyze_failure(self, logs: List[str], url: str) -> dict:
        if not self.api_key:
            # Fallback for local testing if no key is provided
            return {
                "targetUrl": url,
                "rootCause": "Simulated Timeout Error",
                "suggestedFix": "Update selector to be more robust.",
                "confidence": 0.8,
                "updatedSelector": "#fallback-selector"
            }
            
        genai.configure(api_key=self.api_key)
        model = genai.GenerativeModel('gemini-2.5-flash')
        prompt = f"""
        You are an expert QA Automation Engineer.
        A Playwright automation job failed while executing on {url}.
        Analyze the following recent logs to determine the root cause of the failure and suggest a fix.
        
        Logs:
        {json.dumps(logs, indent=2)}
        """
        
        try:
            response = model.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(
                    response_mime_type="application/json",
                    temperature=0.1
                )
            )
            return json.loads(response.text)
        except Exception as e:
            return {
                "targetUrl": url,
                "rootCause": f"Analysis Engine Error: {str(e)}",
                "suggestedFix": "Manual investigation required.",
                "confidence": 0.0,
                "updatedSelector": None
            }
