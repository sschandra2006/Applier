from abc import ABC, abstractmethod
from typing import Dict, Any

class DocumentProcessor(ABC):
    @abstractmethod
    async def extract_data(self, file_url: str, expected_type: str, mime_type: str) -> Dict[str, Any]:
        """Extract structured data from a document."""
        pass
