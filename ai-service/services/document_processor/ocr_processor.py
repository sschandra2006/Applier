from .base import DocumentProcessor
from typing import Dict, Any

class OCRProcessor(DocumentProcessor):
    async def extract_data(self, file_url: str, expected_type: str, mime_type: str) -> Dict[str, Any]:
        # Fallback stub for Tesseract OCR.
        # In a real implementation, this would download the image and use pytesseract.image_to_string()
        return {
            "documentType": expected_type,
            "extracted_fields": {
                "raw_text": {
                    "value": "[OCR FALLBACK - TEXT EXTRACTION NOT FULLY IMPLEMENTED]",
                    "confidence": 0.5
                }
            }
        }
