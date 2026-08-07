from core.llm_service import llm_service
import google.generativeai as genai
import typing_extensions as typing
import json

from pydantic import BaseModel, Field
from typing import Any, Dict

class ExtractedAnswer(BaseModel):
    extracted_data: Dict[str, Any]
    nextField: str
    question: str
    confidence: float
    requiresClarification: bool


async def process_interview_turn(state: dict, last_user_message: str) -> dict:
    # Token Guardrail: Compact the state object before sending to LLM
    compact_state = {
        "pendingFields": (state.get("pendingFields") or [])[:10], # Only pass next 10 pending fields
        "completedFields": list((state.get("answers") or {}).keys()), # Only list field names answered
        "currentStep": state.get("currentStep"),
        "availableDocuments": [
            d.get("type") or d.get("name") for d in (state.get("availableDocuments") or [])
        ]
    }

    prompt = f"""
You are an intelligent Interview AI helping a user fill out an application form.
Your job is to:
1. Extract the structured answer from the user's last message based on pending fields.
2. Identify the next logical field from pending fields.
3. Generate a natural follow-up question.

Current Pending Context:
{json.dumps(compact_state, indent=2)}

User's Last Message: "{last_user_message}"

Output valid JSON matching the exact schema requested.
If the message doesn't contain a valid answer for context, set requiresClarification=true.
"""
    
    schema_obj = llm_service.generate_safe_json(
        prompt=prompt,
        schema_model=ExtractedAnswer,
        temperature=0.3,
        max_output_tokens=1000
    )
    
    return schema_obj.model_dump()
