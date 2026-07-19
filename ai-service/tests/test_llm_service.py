import pytest
from unittest.mock import patch, MagicMock
from google.api_core.exceptions import ResourceExhausted, NotFound
import google.generativeai as genai
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.llm_service import LLMService

@patch('google.generativeai.list_models')
def test_startup_check_success(mock_list_models):
    mock_model = MagicMock()
    mock_model.name = 'models/gemini-1.5-flash'
    mock_model.supported_generation_methods = ['generateContent']
    mock_list_models.return_value = [mock_model]
    
    service = LLMService()
    service.active_model_name = 'gemini-1.5-flash'
    service.startup_check()
    assert service.active_model_name == 'gemini-1.5-flash'

@patch('google.generativeai.list_models')
def test_startup_check_auto_discovery(mock_list_models):
    # Configured model is missing, auto-discover fallback
    mock_model = MagicMock()
    mock_model.name = 'models/gemini-new-flash'
    mock_model.supported_generation_methods = ['generateContent']
    mock_list_models.return_value = [mock_model]
    
    service = LLMService()
    service.active_model_name = 'gemini-2.5-flash' # Assume deprecated
    service.startup_check()
    assert service.active_model_name == 'gemini-new-flash'

@patch('google.generativeai.GenerativeModel')
def test_generate_content_success(mock_model_cls):
    mock_model_instance = MagicMock()
    mock_response = MagicMock(text="success")
    mock_response.usage_metadata.prompt_token_count = 10
    mock_response.usage_metadata.candidates_token_count = 10
    mock_model_instance.generate_content.return_value = mock_response
    mock_model_cls.return_value = mock_model_instance
    
    service = LLMService()
    service.active_model_name = 'gemini-1.5-flash'
    res = service.generate_content("Hello_Success")
    assert res.text == "success"

@patch('google.generativeai.GenerativeModel')
def test_generate_content_fallback_on_404(mock_model_cls):
    mock_primary = MagicMock()
    # First call throws NotFound (404)
    mock_primary.generate_content.side_effect = NotFound("Model not found")
    
    mock_fallback = MagicMock()
    mock_response = MagicMock(text="fallback success")
    mock_response.usage_metadata.prompt_token_count = 10
    mock_response.usage_metadata.candidates_token_count = 10
    mock_fallback.generate_content.return_value = mock_response
    
    mock_model_cls.side_effect = [mock_primary, mock_fallback]
    
    service = LLMService()
    service.active_model_name = 'gemini-deprecated'
    service.fallback_model_name = 'gemini-2.5-pro'
    
    res = service.generate_content("Hello_Fallback")
    assert res.text == "fallback success"

@patch('google.generativeai.GenerativeModel')
def test_generate_content_retries_on_429(mock_model_cls):
    from tenacity import RetryError
    
    mock_model_instance = MagicMock()
    # Throws 429 repeatedly
    mock_model_instance.generate_content.side_effect = ResourceExhausted("Rate Limit")
    mock_model_cls.return_value = mock_model_instance
    
    service = LLMService()
    # We expect it to eventually fail after max retries
    with pytest.raises(ResourceExhausted):
        service.generate_content("Hello_Retry")
        
    # Verify it retried multiple times
    assert mock_model_instance.generate_content.call_count > 1
