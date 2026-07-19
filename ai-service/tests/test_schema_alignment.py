import pytest
from core.models import WorkflowSchema
from core.schema_normalizer import normalize_dict
from pydantic import ValidationError

def test_global_alias_resolution():
    raw = {
        "workflowName": "Global Alias App",
        "screens": [
            {
                "title": "Page 1",
                "actions": [
                    {
                        "caption": "Click Me"
                    }
                ]
            }
        ]
    }
    
    # Normalization Layer
    normalized = normalize_dict(raw)
    
    # Assert global aliases resolved correctly
    assert normalized.get("name") == "Global Alias App"
    assert "screens" not in normalized
    assert "pages" in normalized
    
    # The step array was aliased from 'actions' to 'steps'
    assert "steps" in normalized["pages"][0]
    
    # Pydantic Validation Layer (Contextual aliases like 'caption' -> 'label')
    schema = WorkflowSchema.model_validate(normalized)
    assert schema.name == "Global Alias App"
    assert schema.pages[0].title == "Page 1"
    assert schema.pages[0].steps[0].label == "Click Me"

def test_contextual_title_resolution():
    raw = {
        "title": "Title mapped to name via Pydantic",
        "pages": [
            {
                "title": "Title mapped to title exactly",
                "steps": []
            }
        ]
    }
    normalized = normalize_dict(raw)
    schema = WorkflowSchema.model_validate(normalized)
    
    assert schema.name == "Title mapped to name via Pydantic"
    assert schema.pages[0].title == "Title mapped to title exactly"

def test_missing_required_field_fails():
    raw = {
        "description": "Missing name!"
    }
    normalized = normalize_dict(raw)
    with pytest.raises(ValidationError):
        WorkflowSchema.model_validate(normalized)
