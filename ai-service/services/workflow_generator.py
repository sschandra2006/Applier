import google.generativeai as genai
from core.config import settings
import json
import typing_extensions as typing

genai.configure(api_key=settings.GEMINI_API_KEY)

class FormField(typing.TypedDict):
    name: str
    type: str
    required: bool
    description: str

class ApplicationStep(typing.TypedDict):
    title: str
    fields: list[FormField]

class WorkflowSchema(typing.TypedDict):
    name: str
    steps: list[ApplicationStep]
    
model = genai.GenerativeModel('gemini-2.5-flash')

async def generate_workflow(form_data: dict) -> dict:
    prompt = f"""
    You are an AI tasked with analyzing raw HTML form structures and generating a structured application workflow.
    Based on the following extracted form data from a website, deduce the required fields, optional fields, and logical steps.
    
    Form Data:
    {json.dumps(form_data, indent=2)}
    
    Output a valid JSON matching the exact schema requested.
    """
    
    response = model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            response_schema=WorkflowSchema,
            temperature=0.1
        ),
    )
    
    return json.loads(response.text)
