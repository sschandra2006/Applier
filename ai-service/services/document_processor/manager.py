from .gemini_processor import QwenDocumentProcessor
from .ocr_processor import OCRProcessor
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)

class DocumentProcessorManager:
    def __init__(self):
        self.primary = QwenDocumentProcessor()
        self.fallback = OCRProcessor()
        
    async def process(self, file_url: str, expected_type: str, mime_type: str) -> Dict[str, Any]:
        try:
            result = await self.primary.extract_data(file_url, expected_type, mime_type)
            return {
                "extractedData": result.get("extracted_fields", {}),
                "processedBy": "Qwen2.5LLM"
            }
        except Exception as e:
            logger.warning(f"Qwen Document Processing failed, falling back to OCR: {str(e)}")
            result = await self.fallback.extract_data(file_url, expected_type, mime_type)
            return {
                "extractedData": result.get("extracted_fields", {}),
                "processedBy": "OCRProvider"
            }

manager = DocumentProcessorManager()

