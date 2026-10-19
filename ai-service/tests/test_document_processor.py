import pytest
from unittest.mock import patch, MagicMock
from services.document_processor.manager import DocumentProcessorManager
from agents.document_intelligence_agent import DocumentIntelligenceAgent
from core.models import DocumentEvidenceModel, DocumentQualityModel, DocumentExtraction


def test_document_processor_manager_initialization():
    manager = DocumentProcessorManager()
    assert manager.primary is not None
    assert manager.fallback is not None


def test_document_evidence_pydantic_model_validation():
    """DocumentEvidenceModel strictly validates evidence with all required attributes."""
    evidence_payload = {
        "schemaVersion": "2.0.0",
        "evidenceId": "evi_py_test_01",
        "documentId": "doc_py_test_01",
        "fieldKey": "identity.dateOfBirth",
        "page": 1,
        "region": {"x": 100, "y": 200, "width": 150, "height": 30},
        "extractionMethod": "OCR",
        "rawValue": "DOB: 14/08/2006",
        "normalizedValue": "14-08-2006",
        "confidence": 0.95,
        "timestamp": "2026-10-03T12:00:00.000Z",
        "quality": {
            "isBlurry": False,
            "isCropped": False,
            "isUnreadable": False,
            "missingPages": False,
            "qualityScore": 0.95
        }
    }

    model = DocumentEvidenceModel.model_validate(evidence_payload)
    assert model.schemaVersion == "2.0.0"
    assert model.fieldKey == "identity.dateOfBirth"
    assert model.normalizedValue == "14-08-2006"
    assert model.confidence == 0.95
    assert model.quality.qualityScore == 0.95


@patch("agents.document_intelligence_agent.llm_service")
def test_document_intelligence_agent_extraction(mock_llm):
    """DocumentIntelligenceAgent extracts fields and classification."""
    mock_llm.generate_safe_json.return_value = DocumentExtraction(
        documentType="Aadhaar",
        extractedFields={
            "fullName": "Aarav Sharma",
            "dateOfBirth": "14-08-2006",
            "aadhaarNumber": "123456789012"
        },
        confidence=0.96,
        isValid=True,
        warnings=[]
    )

    agent = DocumentIntelligenceAgent()
    res = agent.process({
        "raw_data": {
            "documentBase64": "fake_base64_data",
            "documentType": "AADHAAR"
        }
    })

    assert res["action"] == "document_processed"
    assert res["documentType"] == "Aadhaar"
    assert res["confidence"] == 0.96
    assert res["isValid"] is True
    assert res["extracted_data"]["aadhaarNumber"] == "123456789012"


@patch("agents.document_intelligence_agent.llm_service")
def test_uncertain_extraction_retains_warnings_and_low_confidence(mock_llm):
    """Poor quality or uncertain documents retain warnings and must not be marked high confidence."""
    mock_llm.generate_safe_json.return_value = DocumentExtraction(
        documentType="Aadhaar",
        extractedFields={"dateOfBirth": "14-08-2006?"},
        confidence=0.45,
        isValid=False,
        warnings=["Blurry image", "Text partially illegible"]
    )

    agent = DocumentIntelligenceAgent()
    res = agent.process({
        "raw_data": {
            "documentBase64": "fake_base64_data",
            "documentType": "AADHAAR"
        }
    })

    assert res["isValid"] is False
    assert res["confidence"] < 0.70
    assert len(res["warnings"]) >= 1
