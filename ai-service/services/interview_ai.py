import google.generativeai as genai
from core.config import settings
import typing_extensions as typing
import json

genai.configure(api_key=settings.GEMINI_API_KEY)

class ExtractedAnswer(typing.TypedDict):
    extracted_data: dict[str, typing.Any] # The key-value pairs extracted from the user's message
    nextField: str # The ID/name of the next field to ask for
    question: str # The conversational question to ask the user
    confidence: float # Confidence score of extraction (0.0 to 1.0)
    requiresClarification: bool # True if the user's answer was confusing or invalid

model = genai.GenerativeModel('gemini-2.5-flash')

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
    
    response = model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            response_schema=ExtractedAnswer,
            temperature=0.3
        ),
    )
    
    return json.loads(response.text)
