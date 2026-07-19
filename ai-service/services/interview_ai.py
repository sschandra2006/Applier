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
    prompt = f"""
    You are an intelligent Interview AI helping a user fill out an application form.
    Your job is to:
    1. Extract the structured answer from the user's last message based on the pending fields.
    2. Identify the next logical field to ask from the pending fields.
    3. Generate a natural, conversational follow-up question.
    
    Current Interview State:
    {json.dumps(state, indent=2)}
    
    User's Last Message: "{last_user_message}"
    
    Output a valid JSON matching the exact schema requested. 
    If the user's message doesn't contain a valid answer for the current context, set requiresClarification to true and ask them to clarify.
    """
    
    schema_obj = llm_service.generate_safe_json(
        prompt=prompt,
        schema_model=ExtractedAnswer,
        temperature=0.3
    )
    
    return schema_obj.model_dump()
