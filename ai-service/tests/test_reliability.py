import pytest
from unittest.mock import patch, MagicMock
from core.llm_service import LLMService
from pydantic import BaseModel
import json

class MockSchema(BaseModel):
    name: str
    age: int

@patch('core.llm_service.LLMService.generate_content')
def test_safe_generate_clean_json(mock_generate):
    """Test standard clean JSON parsing."""
    mock_response = MagicMock()
    mock_response.text = '{"name": "Alice", "age": 30}'
    mock_generate.return_value = mock_response

    service = LLMService()
    result = service.generate_safe_json("prompt", MockSchema)
    
    assert result.name == "Alice"
    assert result.age == 30
    assert mock_generate.call_count == 1

@patch('core.llm_service.LLMService.generate_content')
def test_safe_generate_markdown_stripping(mock_generate):
    """Test stripping markdown fences."""
    mock_response = MagicMock()
    mock_response.text = '```json\n{"name": "Bob", "age": 25}\n```'
    mock_generate.return_value = mock_response

    service = LLMService()
    result = service.generate_safe_json("prompt", MockSchema)
    
    assert result.name == "Bob"
    assert result.age == 25

@patch('core.llm_service.LLMService.generate_content')
def test_safe_generate_json_repair(mock_generate):
    """Test repairing truncated or broken JSON (e.g. trailing commas, missing brace)."""
    mock_response = MagicMock()
    # Missing closing brace and quote
    mock_response.text = '{"name": "Charlie", "age": 40' 
    mock_generate.return_value = mock_response

    service = LLMService()
    result = service.generate_safe_json("prompt", MockSchema)
    
    assert result.name == "Charlie"
    assert result.age == 40

@patch('core.llm_service.LLMService.generate_content')
def test_safe_generate_schema_validation_retry(mock_generate):
    """Test auto-regeneration if Pydantic validation fails."""
    # First response is valid JSON but misses required 'age'
    mock_response_1 = MagicMock()
    mock_response_1.text = '{"name": "Dave"}'
    
    # Second response fixes it
    mock_response_2 = MagicMock()
    mock_response_2.text = '{"name": "Dave", "age": 50}'
    
    mock_generate.side_effect = [mock_response_1, mock_response_2]

    service = LLMService()
    result = service.generate_safe_json("prompt", MockSchema)
    
    assert result.name == "Dave"
    assert result.age == 50
    assert mock_generate.call_count == 2 # Proves it retried!

@patch('core.llm_service.LLMService.generate_content')
def test_safe_generate_max_retries_exceeded(mock_generate):
    """Test failure after max retries."""
    mock_response = MagicMock()
    # Continually returns bad JSON that can't be repaired to schema
    mock_response.text = '{"wrong_field": "test"}'
    mock_generate.return_value = mock_response

    service = LLMService()
    with pytest.raises(ValueError, match="Final validation failed after 3 attempts"):
        service.generate_safe_json("prompt", MockSchema, max_retries=3)
    
    assert mock_generate.call_count == 3
