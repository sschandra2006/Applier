"""
Applicant Knowledge Graph & Interview Integration Tests
Applier 2.0 — Phase 6
"""

import pytest
from unittest.mock import patch, MagicMock
from core.models import ApplicantKnowledgeGraph, KnowledgeNode, FieldConflict, ConflictItemValue
from services.interview_ai import process_interview_turn


class TestApplicantKnowledgeGraph:

    def test_pydantic_knowledge_graph_model_validation(self):
        """Pydantic model validates complete ApplicantKnowledgeGraph."""
        graph_data = {
            "schemaVersion": "2.0.0",
            "applicantId": "app_py_01",
            "userId": "user_py_01",
            "identity": {
                "fullName": {
                    "value": "Aarav Sharma",
                    "source": "PROFILE",
                    "confidence": 0.95,
                    "verificationStatus": "VERIFIED",
                    "updatedAt": "2026-10-03T12:00:00.000Z",
                    "evidence": "Primary user profile",
                    "history": []
                },
                "dateOfBirth": {
                    "value": "14-08-2006",
                    "source": "DOCUMENT",
                    "confidence": 0.98,
                    "verificationStatus": "VERIFIED",
                    "updatedAt": "2026-10-03T12:00:00.000Z"
                }
            },
            "contact": {
                "email": {
                    "value": "aarav@example.com",
                    "source": "PROFILE",
                    "confidence": 1.0,
                    "verificationStatus": "VERIFIED",
                    "updatedAt": "2026-10-03T12:00:00.000Z"
                }
            },
            "address": {},
            "education": {
                "college": {
                    "value": "Indian Institute of Science",
                    "source": "DOCUMENT",
                    "confidence": 0.96,
                    "verificationStatus": "VERIFIED",
                    "updatedAt": "2026-10-03T12:00:00.000Z"
                }
            },
            "family": {},
            "financial": {},
            "preferences": {},
            "documents": {},
            "conflicts": [
                {
                    "conflictId": "conf_dob_01",
                    "path": "identity.dateOfBirth",
                    "existingValue": {
                        "value": "14-08-2006",
                        "source": "DOCUMENT",
                        "confidence": 0.95
                    },
                    "conflictingValue": {
                        "value": "15-08-2006",
                        "source": "DOCUMENT",
                        "confidence": 0.95
                    },
                    "status": "UNRESOLVED",
                    "reason": "FIELD_CONFLICT",
                    "detectedAt": "2026-10-03T12:00:00.000Z"
                }
            ],
            "metadata": {
                "totalFields": 4,
                "verifiedFields": 4,
                "conflictCount": 1
            }
        }

        model = ApplicantKnowledgeGraph.model_validate(graph_data)
        assert model.schemaVersion == "2.0.0"
        assert model.applicantId == "app_py_01"
        assert model.identity["fullName"].value == "Aarav Sharma"
        assert model.identity["fullName"].verificationStatus == "VERIFIED"
        assert len(model.conflicts) == 1
        assert model.conflicts[0].reason == "FIELD_CONFLICT"
        assert model.conflicts[0].existingValue.value == "14-08-2006"
        assert model.conflicts[0].conflictingValue.value == "15-08-2006"

    @patch("services.interview_ai.llm_service")
    def test_interview_skips_verified_fields_in_pending_list(self, mock_llm):
        """When verified fields are omitted from pendingFields, Interview AI never asks for them."""
        mock_llm.generate_safe_json.return_value = MagicMock(
            model_dump=lambda: {
                "extracted_data": {},
                "nextField": "annualIncome",
                "question": "Please provide your Annual Family Income.",
                "confidence": 0.9,
                "requiresClarification": False
            }
        )

        # Notice: fullName, email, dob already verified in graph -> only annualIncome is pending!
        state = {
            "pendingFields": ["annualIncome"],
            "completedFields": ["applicantFullName", "email", "dob"],
            "currentField": "annualIncome",
            "fieldDetails": {
                "annualIncome": {"label": "Annual Family Income", "type": "number"}
            },
            "answers": {
                "applicantFullName": "Aarav Sharma",
                "email": "aarav@example.com",
                "dob": "14-08-2006"
            }
        }

        result = process_interview_turn(state, "Hello, let's start.")
        assert result["nextField"] == "annualIncome"
        # Must not ask for already verified fields
        assert "name" not in result["question"].lower()
        assert "email" not in result["question"].lower()

    @patch("services.interview_ai.llm_service")
    def test_interview_prompt_includes_confirmation_and_conflict_context(self, mock_llm):
        """Interview AI includes confirmation and conflict instructions in generated prompt."""
        captured_prompt = []

        def capture_call(prompt, **kwargs):
            captured_prompt.append(prompt)
            return MagicMock(
                model_dump=lambda: {
                    "extracted_data": {},
                    "nextField": "fatherName",
                    "question": "We found that your Father's Name is Rajesh Sharma. Could you please confirm if this is correct?",
                    "confidence": 0.9,
                    "requiresClarification": False
                }
            )

        mock_llm.generate_safe_json.side_effect = capture_call

        state = {
            "pendingFields": ["fatherName", "dob"],
            "completedFields": ["email"],
            "currentField": "fatherName",
            "fieldDetails": {
                "fatherName": {"label": "Father's Name", "type": "text"},
                "dob": {"label": "Date of Birth", "type": "date"}
            },
            "confirmationFields": {
                "fatherName": {"value": "Rajesh Sharma", "confidence": 0.70}
            },
            "conflictFields": {
                "dob": {
                    "existingValue": "14-08-2006",
                    "conflictingValue": "15-08-2006"
                }
            },
            "answers": {"email": "aarav@example.com"}
        }

        result = process_interview_turn(state, "Hi")

        assert len(captured_prompt) == 1
        prompt_text = captured_prompt[0]
        # Verify prompt received confirmationFields and conflictFields context
        assert "confirmationFields" in prompt_text
        assert "conflictFields" in prompt_text
        assert "Rajesh Sharma" in prompt_text
        assert "14-08-2006" in prompt_text
        assert result["nextField"] == "fatherName"
