import pytest
from unittest.mock import patch, MagicMock
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.llm_service import LLMService

def test_startup_check_success():
    service = LLMService()
    service.active_model_name = 'Qwen/Qwen2.5-7B-Instruct'
    service.startup_check()
    assert service.active_model_name == 'Qwen/Qwen2.5-7B-Instruct'

def test_generate_content_success():
    service = LLMService()
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_choice = MagicMock()
    mock_choice.message.content = "Qwen response success"
    mock_response.choices = [mock_choice]
    mock_client.chat_completion.return_value = mock_response
    service.client = mock_client
    service.active_model_name = 'Qwen/Qwen2.5-7B-Instruct'
    
    res = service.generate_content("Hello Qwen Test")
    assert res.text == "Qwen response success"

def test_generate_content_fallback():
    service = LLMService()
    mock_client = MagicMock()
    
    mock_fallback_choice = MagicMock()
    mock_fallback_choice.message.content = "Qwen 72B fallback success"
    mock_fallback_resp = MagicMock(choices=[mock_fallback_choice])
    
    mock_client.chat_completion.side_effect = [
        Exception("Primary model unavailable"),
        mock_fallback_resp
    ]
    service.client = mock_client
    service.active_model_name = 'Qwen/Qwen2.5-7B-Instruct'
    service.fallback_model_name = 'Qwen/Qwen2.5-72B-Instruct'
    
    res = service.generate_content("Hello Fallback Test")
    assert res.text == "Qwen 72B fallback success"

def test_embed_content():
    service = LLMService()
    vec = service.embed_content("Sample text for embedding")
    assert isinstance(vec, list)
    assert len(vec) == 384
