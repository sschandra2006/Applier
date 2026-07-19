import google.generativeai as genai
from core.config import settings
from .base import DocumentProcessor
from typing import Dict, Any
import httpx
import json

genai.configure(api_key=settings.GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-2.5-flash')

class GeminiVisionProcessor(DocumentProcessor):
    async def extract_data(self, file_url: str, expected_type: str, mime_type: str) -> Dict[str, Any]:
        # 1. Download file
        async with httpx.AsyncClient() as client:
            response = await client.get(file_url)
            file_data = response.content
            
        # 2. Prepare payload
        image_part = {
            "mime_type": mime_type,
            "data": file_data
        }
        
        prompt = f"""
        Extract the structured data from this document. 
        Expected Document Type: {expected_type}
        
        Output JSON in this format:
        {{
            "documentType": "string",
            "extracted_fields": {{
                "fieldName": {{
                    "value": "extracted string/number",
                    "confidence": float (0.0 to 1.0)
                }}
            }}
        }}
        """
        
        response = model.generate_content(
            [image_part, prompt],
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.1
            ),
        )
        
        result = json.loads(response.text)
        return result
