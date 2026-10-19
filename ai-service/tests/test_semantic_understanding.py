"""
Semantic Page Understanding Tests
Applier 2.0 — Phase 5: Semantic Page Understanding

Verifies that:
1. High-confidence fields map accurately to canonical semantic types.
2. Ambiguous fields remain unresolved (confidence < 0.70, isResolved = False).
3. Unknown fields map to UNKNOWN_FIELD and remain unresolved.
4. Large forms (30+ fields) are parsed and classified robustly.
5. Identical page observations hit the cache without re-analysis.
6. Schema validation strictly passes and malformed outputs are rejected/handled.
7. Never emits execution actions or selectors.
"""

import pytest
from agents.semantic_understanding_agent import SemanticUnderstandingAgent
from core.models import SemanticPageModel


@pytest.fixture
def agent():
    return SemanticUnderstandingAgent()


@pytest.fixture
def sample_observation():
    return {
        "schemaVersion": "2.0.0",
        "observationId": "obs_test_high_conf",
        "url": "https://scholarship.gov.in/apply/fresh",
        "title": "Fresh Application - Personal Details",
        "page": {
            "url": "https://scholarship.gov.in/apply/fresh",
            "title": "Fresh Application - Personal Details",
            "visibleTextSummary": "Enter your full name, father's name, email address, mobile number and college details."
        },
        "elements": [
            {
                "elementId": "elem_1",
                "tag": "input",
                "type": "text",
                "role": "textbox",
                "label": "Full Name",
                "name": "applicantFullName",
                "placeholder": "Enter full official name",
                "visible": True
            },
            {
                "elementId": "elem_2",
                "tag": "input",
                "type": "text",
                "role": "textbox",
                "label": "Father's Name",
                "name": "fatherName",
                "placeholder": "Father/Guardian Name",
                "visible": True
            },
            {
                "elementId": "elem_3",
                "tag": "input",
                "type": "email",
                "role": "textbox",
                "label": "Email ID",
                "name": "email",
                "placeholder": "name@example.com",
                "visible": True
            },
            {
                "elementId": "elem_4",
                "tag": "input",
                "type": "tel",
                "role": "textbox",
                "label": "Mobile Number",
                "name": "mobilePhone",
                "placeholder": "9876543210",
                "visible": True
            },
            {
                "elementId": "elem_5",
                "tag": "input",
                "type": "text",
                "role": "textbox",
                "label": "Date of Birth",
                "name": "dob",
                "placeholder": "DD/MM/YYYY",
                "visible": True
            },
            {
                "elementId": "elem_6",
                "tag": "input",
                "type": "text",
                "role": "textbox",
                "label": "College / Institute Name",
                "name": "collegeName",
                "placeholder": "Institute Name",
                "visible": True
            },
            {
                "elementId": "elem_7",
                "tag": "input",
                "type": "number",
                "role": "textbox",
                "label": "Aggregate CGPA",
                "name": "cgpaScore",
                "placeholder": "0.0 - 10.0",
                "visible": True
            },
            {
                "elementId": "elem_8",
                "tag": "input",
                "type": "number",
                "role": "textbox",
                "label": "Annual Family Income",
                "name": "familyIncome",
                "placeholder": "In INR",
                "visible": True
            }
        ]
    }


class TestSemanticPageUnderstanding:

    def test_high_confidence_mapping(self, agent, sample_observation):
        """High-confidence fields must map cleanly with isResolved=True."""
        result = agent.process({"observation": sample_observation})

        assert result["schemaVersion"] == "2.0.0"
        assert result["pageType"] == "APPLICATION_FORM"
        assert result["pageTypeConfidence"] >= 0.85
        assert len(result["fields"]) == 8

        field_map = {f["elementId"]: f for f in result["fields"]}

        # Name mapping
        assert field_map["elem_1"]["semanticType"] == "applicant.fullName"
        assert field_map["elem_1"]["confidence"] >= 0.90
        assert field_map["elem_1"]["isResolved"] is True

        # Father's name
        assert field_map["elem_2"]["semanticType"] == "applicant.fatherName"
        assert field_map["elem_2"]["confidence"] >= 0.90
        assert field_map["elem_2"]["isResolved"] is True

        # Email & Phone
        assert field_map["elem_3"]["semanticType"] == "applicant.email"
        assert field_map["elem_4"]["semanticType"] == "applicant.phone"

        # Education & Financial
        assert field_map["elem_6"]["semanticType"] == "education.college"
        assert field_map["elem_7"]["semanticType"] == "education.cgpa"
        assert field_map["elem_8"]["semanticType"] == "financial.income"

    def test_ambiguous_field_remains_unresolved(self, agent):
        """Ambiguous fields like 'code' or 'ref' must have low confidence and remain unresolved."""
        observation = {
            "schemaVersion": "2.0.0",
            "observationId": "obs_ambiguous",
            "url": "https://scholarship.gov.in/form",
            "elements": [
                {
                    "elementId": "elem_amb_1",
                    "tag": "input",
                    "type": "text",
                    "label": "Code",
                    "name": "ref",
                    "placeholder": "Code",
                    "visible": True
                },
                {
                    "elementId": "elem_amb_2",
                    "tag": "input",
                    "type": "text",
                    "label": "Temp Value",
                    "name": "temp",
                    "placeholder": "",
                    "visible": True
                }
            ]
        }

        result = agent.process({"observation": observation})
        field_map = {f["elementId"]: f for f in result["fields"]}

        for el_id in ["elem_amb_1", "elem_amb_2"]:
            field = field_map[el_id]
            # Ambiguous fields must not be forced to true resolution
            assert field["isResolved"] is False
            assert field["confidence"] < 0.70

    def test_unknown_field(self, agent):
        """Non-profile widgets and buttons must map to UNKNOWN_FIELD."""
        observation = {
            "schemaVersion": "2.0.0",
            "observationId": "obs_unknown",
            "url": "https://scholarship.gov.in/form",
            "elements": [
                {
                    "elementId": "elem_btn",
                    "tag": "button",
                    "type": "submit",
                    "role": "button",
                    "label": "Save Progress",
                    "text": "Save Progress",
                    "visible": True
                },
                {
                    "elementId": "elem_random",
                    "tag": "input",
                    "type": "text",
                    "label": "Tracking Key",
                    "name": "xyz987",
                    "visible": True
                }
            ]
        }

        result = agent.process({"observation": observation})
        field_map = {f["elementId"]: f for f in result["fields"]}

        assert field_map["elem_btn"]["semanticType"] == "UNKNOWN_FIELD"
        assert field_map["elem_btn"]["isResolved"] is False

        assert field_map["elem_random"]["semanticType"] == "UNKNOWN_FIELD"
        assert field_map["elem_random"]["isResolved"] is False

    def test_large_form_scalability(self, agent):
        """Large form with 35 fields must be parsed without error."""
        elements = []
        for i in range(1, 36):
            elements.append({
                "elementId": f"elem_{i}",
                "tag": "input",
                "type": "text",
                "label": f"Student Field {i}",
                "name": f"field_{i}",
                "visible": True
            })

        large_obs = {
            "schemaVersion": "2.0.0",
            "observationId": "obs_large",
            "url": "https://portal.gov.in/complex-form",
            "title": "Comprehensive 35-field Form",
            "elements": elements
        }

        result = agent.process({"observation": large_obs})
        assert len(result["fields"]) == 35
        assert result["metadata"]["fieldCount"] == 35

    def test_caching_identical_observation(self, agent, sample_observation):
        """Repeated observation of identical state must hit cache with cached=True."""
        res1 = agent.process({"observation": sample_observation})
        assert res1["metadata"]["cached"] is False

        res2 = agent.process({"observation": sample_observation})
        assert res2["metadata"]["cached"] is True
        assert res2["pageType"] == res1["pageType"]
        assert len(res2["fields"]) == len(res1["fields"])

    def test_schema_validation_and_no_execution_selectors(self, agent, sample_observation):
        """The output must strictly conform to schema and MUST NOT contain execution selectors."""
        result = agent.process({"observation": sample_observation})

        # Strict Pydantic model validation
        validated = SemanticPageModel.model_validate(result)
        assert validated.schemaVersion == "2.0.0"
        assert validated.pageType in [
            "LANDING", "LOGIN", "REGISTRATION", "APPLICATION_FORM",
            "DOCUMENT_UPLOAD", "REVIEW", "PAYMENT", "OTP", "CAPTCHA", "SUCCESS", "ERROR", "UNKNOWN"
        ]

        # Verify: MUST NOT determine execution selectors
        for f in result["fields"]:
            assert "selector" not in f, "Field must not contain browser execution selectors"
            assert "xpath" not in f, "Field must not contain xpath selectors"
            assert "action" not in f, "Field must not generate execution actions"
