import pytest
from unittest.mock import patch, MagicMock
from agents.website_intelligence_agent import WebsiteIntelligenceAgent
from agents.workflow_planner import WorkflowPlanner
from services.interview_ai import process_interview_turn

def test_website_intelligence_agent_multi_page_scan():
    mock_scan_data = {
        "url": "https://example.com/apply",
        "title": "Application Form",
        "pagesScanned": 2,
        "pages": [
            {
                "url": "https://example.com/apply/step1",
                "title": "Personal Details",
                "html": "<html><body><form><label for='name'>Full Name</label><input id='name' name='name' type='text' required /></form></body></html>"
            },
            {
                "url": "https://example.com/apply/step2",
                "title": "Document Upload",
                "html": "<html><body><form><label for='doc'>Identity Card</label><input id='doc' name='doc' type='file' required /></form></body></html>"
            }
        ],
        "html": "combined..."
    }

    agent = WebsiteIntelligenceAgent()
    res = agent.process({"raw_data": mock_scan_data})

    assert res["action"] == "analyzed_dom"
    fields = res["metadata"]["fields"]
    assert len(fields) == 2
    field_names = [f["name"] for f in fields]
    assert "name" in field_names
    assert "doc" in field_names
    assert res["metadata"]["domSummary"]["pagesScanned"] == 2

def test_workflow_planner_multi_page_build_form_data():
    planner = WorkflowPlanner()
    mock_scan_data = {
        "url": "https://example.com/apply",
        "title": "Application Form",
        "pages": [
            {
                "url": "https://example.com/apply/step1",
                "title": "Step 1",
                "html": "<html><body><form><input id='email' type='email' required /></form></body></html>"
            }
        ]
    }
    form_data = planner._build_form_data(mock_scan_data)
    assert form_data["url"] == "https://example.com/apply"
    assert len(form_data["forms"][0]["inputs"]) == 1
    assert form_data["forms"][0]["inputs"][0]["name"] == "email"

@patch("services.interview_ai.llm_service")
def test_interview_ai_uses_scanned_site_fields(mock_llm):
    mock_llm.generate_safe_json.return_value = MagicMock(
        model_dump=lambda: {
            "extracted_data": {},
            "nextField": "category",
            "question": "What is your category for the application form? (Options: General, OBC, SC/ST)",
            "confidence": 0.95,
            "requiresClarification": False
        }
    )

    state = {
        "pendingFields": ["category"],
        "fieldDetails": {
            "category": {
                "label": "Select Category",
                "type": "select",
                "options": [{"value": "General"}, {"value": "OBC"}],
                "page_title": "Personal Details"
            }
        },
        "answers": {}
    }

    result = process_interview_turn(state, "Hello, I want to start.")
    assert result["nextField"] == "category"
    assert "category" in result["question"].lower() or "options" in result["question"].lower()
