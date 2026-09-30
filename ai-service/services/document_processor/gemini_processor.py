from core.llm_service import llm_service
from .base import DocumentProcessor
from typing import Dict, Any
import httpx
import json
from pydantic import BaseModel
from typing import Dict, Any

class ExtractedField(BaseModel):
    value: str
    confidence: float

class DocumentExtraction(BaseModel):
    documentType: str
    extracted_fields: Dict[str, ExtractedField]

class QwenDocumentProcessor(DocumentProcessor):
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
        
        schema_obj = llm_service.generate_safe_json(
            prompt=prompt,
            schema_model=DocumentExtraction,
            temperature=0.1
        )
        return schema_obj.model_dump()
