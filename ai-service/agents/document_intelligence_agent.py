import base64
import logging
import os
from core.llm_service import llm_service
from core.models import DocumentExtraction
import google.generativeai as genai
from core.config import settings

logger = logging.getLogger("DocumentIntelligenceAgent")

_PROMPT_PATH = os.path.join(os.path.dirname(__file__), "..", "prompts", "document", "system.md")
try:
    with open(_PROMPT_PATH, "r", encoding="utf-8") as f:
        SYSTEM_PROMPT = f.read().strip()
except FileNotFoundError:
    SYSTEM_PROMPT = "You are an expert document analyst. Extract structured data from documents."


class DocumentIntelligenceAgent:
    """
    Extracts structured information from document images using Gemini Vision.
    Supports: Aadhaar, PAN, Passport, Birth Certificate, Marksheets, Income Certificates.
    """

    def process(self, context: dict) -> dict:
        raw_data = context.get("raw_data", {})

        # Support base64 image or a file URL
        document_base64 = raw_data.get("documentBase64", "")
        document_type_hint = raw_data.get("documentType", "")  # Optional hint
        file_url = raw_data.get("fileUrl", "")

        if not document_base64 and not file_url:
            logger.warning("[DocumentIntelligenceAgent] No document data provided.")
            return {
                "action": "document_processed",
                "extracted_data": {},
                "confidence": 0.0,
                "error": "No document provided",
            }

        try:
            if document_base64:
                result = self._analyze_with_vision(document_base64, document_type_hint)
            else:
                # Download and convert to base64
                import requests
                resp = requests.get(file_url, timeout=15)
                resp.raise_for_status()
                document_base64 = base64.b64encode(resp.content).decode("utf-8")
                result = self._analyze_with_vision(document_base64, document_type_hint)

            logger.info(
                f"[DocumentIntelligenceAgent] Extracted {result.documentType} with confidence {result.confidence}"
            )

            return {
                "action": "document_processed",
                "documentType": result.documentType,
                "extracted_data": result.extractedFields,
                "isValid": result.isValid,
                "warnings": result.warnings,
                "confidence": result.confidence,
            }

        except Exception as e:
            logger.error(f"[DocumentIntelligenceAgent] Extraction failed: {e}", exc_info=True)
            return {
                "action": "document_processed",
                "extracted_data": {},
                "confidence": 0.0,
                "error": str(e),
            }

    def _analyze_with_vision(self, document_base64: str, type_hint: str) -> DocumentExtraction:
        """Use Gemini Vision to extract structured data from a document image."""
        prompt = f"""
Analyze this document image and extract all visible information.
{f'Document type hint: {type_hint}' if type_hint else ''}

Extract:
1. The document type (Aadhaar, PAN, Passport, Birth Certificate, Marksheet, Income Certificate, etc.)
2. All key fields visible in the document
3. Whether the document appears valid and fully legible
4. Any quality warnings (blurry, cropped, expired, etc.)

Return valid JSON matching the DocumentExtraction schema.
"""

        try:
            # Use Gemini Vision (multimodal) model
            model = genai.GenerativeModel("gemini-1.5-flash")
            response = model.generate_content([
                prompt,
                {
                    "inline_data": {
                        "mime_type": "image/jpeg",
                        "data": document_base64,
                    }
                }
            ])

            raw_text = response.text.strip()
            # Strip markdown fences if present
            if raw_text.startswith("```json"):
                raw_text = raw_text[7:]
            elif raw_text.startswith("```"):
                raw_text = raw_text[3:]
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3]

            import json, json_repair
            try:
                parsed = json.loads(raw_text.strip())
            except json.JSONDecodeError:
                parsed = json_repair.loads(raw_text.strip())

            return DocumentExtraction.model_validate(parsed)

        except Exception as e:
            logger.warning(f"[DocumentIntelligenceAgent] Vision analysis failed, using text fallback: {e}")
            # Fallback: text-only analysis with just the prompt (no image)
            result = llm_service.generate_safe_json(
                prompt=f"Based on the description, extract document information. Document type hint: {type_hint}",
                schema_model=DocumentExtraction,
                temperature=0.1,
                system_instruction=SYSTEM_PROMPT,
            )
            return result
