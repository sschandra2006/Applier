"""
Canonical Shared Contract Tests for Python AI Service
Applier 2.0 — Phase 1

Verifies that:
1. Python service loads and validates against all 16 canonical JSON schemas.
2. Valid fixtures and payloads pass canonical validation.
3. Invalid payloads are rejected consistently with detailed errors.
4. Schema version mismatches are detected and rejected.
5. Pydantic models (ExecutionPlan, WorkflowSchema) adapt cleanly to canonical contracts.
"""

import os
import sys
import json
import pytest

# Add shared/validators to sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
SHARED_VALIDATORS_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", "..", "shared", "validators"))
FIXTURES_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", "..", "shared", "fixtures"))

if SHARED_VALIDATORS_DIR not in sys.path:
    sys.path.insert(0, SHARED_VALIDATORS_DIR)

from python_validator import (
    validate_canonical,
    validate_canonical_or_raise,
    validate_pydantic_model,
    CanonicalValidationError,
    _SCHEMAS
)
from core.models import ExecutionPlan, ExecutionStep, WorkflowSchema


class TestCanonicalContractsPython:
    
    def test_schema_catalog_contains_all_schemas(self):
        """All canonical schemas must be loaded."""
        expected_schemas = [
            "applicant-profile",
            "applicant-field",
            "document",
            "document-evidence",
            "website-field",
            "browser-observation",
            "browser-action",
            "verification-result",
            "workflow",
            "execution-plan",
            "execution-step",
            "execution-checkpoint",
            "automation-job",
            "interview-state",
            "application",
            "human-checkpoint",
            "semantic-page-model",
            "applicant-knowledge-graph",
            "semantic-field-mapping",
            "runtime-locator",
            "action-verification",
            "submission-confirmation",
            "action-policy",
            "application-review"
        ]
        for name in expected_schemas:
            assert name in _SCHEMAS, f"Schema '{name}' was not loaded into canonical catalog"
            assert _SCHEMAS[name].get("$schema") == "https://json-schema.org/draft/2020-12/schema"

    def test_valid_submission_confirmation_fixture(self):
        """Valid submission confirmation fixture must pass canonical validation."""
        path = os.path.join(FIXTURES_DIR, "valid", "submission-confirmation.valid.json")
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        is_valid, errors = validate_canonical("submission-confirmation", data)
        assert is_valid is True, f"Valid submission-confirmation fixture failed validation: {errors}"
        assert len(errors) == 0

    def test_valid_action_policy_fixture(self):
        """Valid action policy fixture must pass canonical validation."""
        path = os.path.join(FIXTURES_DIR, "valid", "action-policy.valid.json")
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        is_valid, errors = validate_canonical("action-policy", data)
        assert is_valid is True, f"Valid action-policy fixture failed validation: {errors}"
        assert len(errors) == 0

    def test_valid_application_review_fixture(self):
        """Valid application review fixture must pass canonical validation."""
        path = os.path.join(FIXTURES_DIR, "valid", "application-review.valid.json")
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        is_valid, errors = validate_canonical("application-review", data)
        assert is_valid is True, f"Valid application-review fixture failed validation: {errors}"
        assert len(errors) == 0

    def test_valid_action_verification_fixture(self):
        """Valid action verification fixture must pass canonical validation."""
        path = os.path.join(FIXTURES_DIR, "valid", "action-verification.valid.json")
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        is_valid, errors = validate_canonical("action-verification", data)
        assert is_valid is True, f"Valid action-verification fixture failed validation: {errors}"
        assert len(errors) == 0

    def test_valid_runtime_locator_fixture(self):
        """Valid runtime locator fixture must pass canonical validation."""
        path = os.path.join(FIXTURES_DIR, "valid", "runtime-locator.valid.json")
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        is_valid, errors = validate_canonical("runtime-locator", data)
        assert is_valid is True, f"Valid runtime-locator fixture failed validation: {errors}"
        assert len(errors) == 0

    def test_valid_semantic_field_mapping_fixture(self):
        """Valid semantic field mapping fixture must pass canonical validation."""
        path = os.path.join(FIXTURES_DIR, "valid", "semantic-field-mapping.valid.json")
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        is_valid, errors = validate_canonical("semantic-field-mapping", data)
        assert is_valid is True, f"Valid semantic-field-mapping fixture failed validation: {errors}"
        assert len(errors) == 0

    def test_valid_applicant_knowledge_graph_fixture(self):
        """Valid applicant knowledge graph fixture must pass canonical validation."""
        path = os.path.join(FIXTURES_DIR, "valid", "applicant-knowledge-graph.valid.json")
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        is_valid, errors = validate_canonical("applicant-knowledge-graph", data)
        assert is_valid is True, f"Valid applicant-knowledge-graph fixture failed validation: {errors}"
        assert len(errors) == 0

    def test_valid_document_evidence_fixture(self):
        """Valid document evidence fixture must pass canonical validation."""
        path = os.path.join(FIXTURES_DIR, "valid", "document-evidence.valid.json")
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        is_valid, errors = validate_canonical("document-evidence", data)
        assert is_valid is True, f"Valid document-evidence fixture failed validation: {errors}"
        assert len(errors) == 0

    def test_valid_semantic_page_model_fixture(self):
        """Valid semantic page model fixture must pass canonical validation."""
        path = os.path.join(FIXTURES_DIR, "valid", "semantic-page-model.valid.json")
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        is_valid, errors = validate_canonical("semantic-page-model", data)
        assert is_valid is True, f"Valid semantic-page-model fixture failed validation: {errors}"
        assert len(errors) == 0

    def test_valid_workflow_fixture(self):
        """Valid workflow fixture must pass canonical validation."""
        path = os.path.join(FIXTURES_DIR, "valid", "workflow.valid.json")
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        is_valid, errors = validate_canonical("workflow", data)
        assert is_valid is True, f"Valid workflow fixture failed validation: {errors}"
        assert len(errors) == 0

    def test_valid_execution_plan_fixture(self):
        """Valid execution plan fixture must pass canonical validation."""
        path = os.path.join(FIXTURES_DIR, "valid", "execution-plan.valid.json")
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        is_valid, errors = validate_canonical("execution-plan", data)
        assert is_valid is True, f"Valid execution plan fixture failed validation: {errors}"
        assert len(errors) == 0

    def test_valid_interview_state_fixture(self):
        """Valid interview state fixture must pass canonical validation."""
        path = os.path.join(FIXTURES_DIR, "valid", "interview-state.valid.json")
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        is_valid, errors = validate_canonical("interview-state", data)
        assert is_valid is True, f"Valid interview state fixture failed validation: {errors}"
        assert len(errors) == 0

    def test_valid_automation_job_fixture(self):
        """Valid automation job fixture must pass canonical validation."""
        path = os.path.join(FIXTURES_DIR, "valid", "automation-job.valid.json")
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        is_valid, errors = validate_canonical("automation-job", data)
        assert is_valid is True, f"Valid automation job fixture failed validation: {errors}"
        assert len(errors) == 0

    def test_valid_applicant_profile_payload(self):
        """Valid applicant profile must pass canonical validation."""
        payload = {
            "schemaVersion": "2.0.0",
            "applicantId": "app_user_1",
            "fullName": "John Doe",
            "email": "john@example.com",
            "phone": "+919876543210",
            "gender": "MALE",
            "fields": [
                {
                    "schemaVersion": "2.0.0",
                    "fieldId": "f_1",
                    "value": "John Doe",
                    "source": "USER_DIRECT"
                }
            ]
        }
        is_valid, errors = validate_canonical("applicant-profile", payload)
        assert is_valid is True, f"Applicant profile failed validation: {errors}"

    def test_valid_document_payload(self):
        """Valid document payload must pass canonical validation."""
        payload = {
            "schemaVersion": "2.0.0",
            "documentId": "doc_101",
            "userId": "user_1",
            "type": "AADHAAR",
            "fileName": "aadhaar.pdf",
            "fileUrl": "https://storage.applier.ai/docs/aadhaar.pdf",
            "validationStatus": "VALID"
        }
        is_valid, errors = validate_canonical("document", payload)
        assert is_valid is True, f"Document failed validation: {errors}"

    def test_valid_application_payload(self):
        """Valid application record must pass canonical validation."""
        payload = {
            "schemaVersion": "2.0.0",
            "applicationId": "app_rec_1",
            "userId": "user_1",
            "workflowId": "wf_1",
            "interviewStateId": "state_1",
            "status": "SUBMITTED"
        }
        is_valid, errors = validate_canonical("application", payload)
        assert is_valid is True, f"Application failed validation: {errors}"

    def test_valid_human_checkpoint_payload(self):
        """Valid human checkpoint payload must pass canonical validation."""
        payload = {
            "schemaVersion": "2.0.0",
            "checkpointId": "chk_1",
            "fieldName": "otpCode",
            "pauseReason": "OTP",
            "stepIndex": 2,
            "resumeFromIndex": 3,
            "resolved": False
        }
        is_valid, errors = validate_canonical("human-checkpoint", payload)
        assert is_valid is True, f"Human checkpoint failed validation: {errors}"

    def test_invalid_workflow_rejected(self):
        """Invalid workflow fixture must be rejected."""
        path = os.path.join(FIXTURES_DIR, "invalid", "workflow.invalid.json")
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        is_valid, errors = validate_canonical("workflow", data)
        assert is_valid is False
        assert len(errors) > 0
        assert any("pages" in err for err in errors)

    def test_invalid_execution_plan_rejected(self):
        """Execution plan with invalid step action type must be rejected."""
        path = os.path.join(FIXTURES_DIR, "invalid", "execution-plan.invalid.json")
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        is_valid, errors = validate_canonical("execution-plan", data)
        assert is_valid is False
        assert len(errors) > 0

    def test_non_dict_payload_rejected(self):
        """Non-dictionary payload must be rejected gracefully."""
        is_valid, errors = validate_canonical("workflow", "not_a_dict")
        assert is_valid is False
        assert "Payload must be a dictionary" in errors[0]

    def test_unknown_schema_rejected(self):
        """Unknown schema name must report error."""
        is_valid, errors = validate_canonical("unregistered-schema", {})
        assert is_valid is False
        assert "Unknown canonical schema" in errors[0]

    def test_validate_canonical_or_raise_raises_on_invalid(self):
        """validate_canonical_or_raise must raise CanonicalValidationError."""
        with pytest.raises(CanonicalValidationError) as exc_info:
            validate_canonical_or_raise("workflow", {"schemaVersion": "2.0.0", "name": "bad"})
        assert "Canonical validation failed for workflow" in str(exc_info.value)

    def test_version_mismatch_rejected(self):
        """Version mismatch fixture must be rejected strictly."""
        path = os.path.join(FIXTURES_DIR, "invalid", "version-mismatch.invalid.json")
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        is_valid, errors = validate_canonical("applicant-profile", data)
        assert is_valid is False
        assert any("schemaVersion" in err or "2.0.0" in err for err in errors)

    def test_missing_schema_version_rejected(self):
        """Payload missing schemaVersion must be rejected."""
        unversioned = {
            "targetUrl": "https://example.com",
            "steps": [
                {"type": "navigate", "url": "https://example.com"}
            ]
        }
        is_valid, errors = validate_canonical("execution-plan", unversioned)
        assert is_valid is False
        assert any("schemaVersion" in err for err in errors)

    def test_pydantic_execution_plan_adaptation(self):
        """Pydantic ExecutionPlan model instance adapts cleanly to canonical contract."""
        pydantic_plan = ExecutionPlan(
            targetUrl="https://scholarships.gov.in/apply",
            totalSteps=2,
            steps=[
                ExecutionStep(
                    type="navigate",
                    url="https://scholarships.gov.in/apply",
                    description="Navigate"
                ),
                ExecutionStep(
                    type="fill",
                    selector="#txtName",
                    field="name",
                    value="Jane",
                    description="Fill name"
                )
            ],
            confidence=0.9
        )
        is_valid, errors = validate_pydantic_model(pydantic_plan, "execution-plan")
        assert is_valid is True, f"Pydantic ExecutionPlan failed canonical validation: {errors}"
