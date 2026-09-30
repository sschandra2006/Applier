import pytest
from services.document_processor.manager import DocumentProcessorManager

def test_document_processor_manager_initialization():
    manager = DocumentProcessorManager()
    assert manager.primary is not None
    assert manager.fallback is not None
