import pytest
from services.document_processor.manager import DocumentProcessorManager

@pytest.mark.asyncio
async def test_document_processor_manager_initialization():
    # Basic test to ensure the class can be instantiated
    manager = DocumentProcessorManager()
    assert manager.primary is not None
    assert manager.fallback is not None
