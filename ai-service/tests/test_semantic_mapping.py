"""
Semantic Field Mapping Unit Tests — Python AI Service
Applier 2.0 — Phase 8: Semantic Field Mapping Engine

Verifies:
1. Exact match (label + autocomplete -> applicant.fullName -> Rahul Kumar)
2. Synonym (cand_name -> applicant.fullName -> Rahul Kumar)
3. Different wording (Parent's / Guardian's Full Name -> family.fatherName -> Suresh Kumar)
4. Missing data (bank account -> financial.bankAccountNumber -> MISSING)
5. Conflicting data (DOB conflict -> CONFLICT -> isFillable: False)
6. Wrong semantic type (File input with email label -> REQUIRES_USER -> isFillable: False)
7. Low confidence (Vague label -> LOW_CONFIDENCE -> isFillable: False)
8. Ambiguous signals (Ambiguous label -> AMBIGUOUS -> isFillable: False)
9. Golden Rule: Never automatically fill AMBIGUOUS, CONFLICT, or LOW_CONFIDENCE
10. Canonical contract compliance (validates with validate_canonical)
"""

import os
import sys
import json
import pytest

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
SHARED_VALIDATORS_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", "..", "shared", "validators"))
FIXTURES_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", "..", "shared", "fixtures"))

if SHARED_VALIDATORS_DIR not in sys.path:
    sys.path.insert(0, SHARED_VALIDATORS_DIR)

from python_validator import validate_canonical
from agents.semantic_mapping_agent import SemanticFieldMappingAgent


@pytest.fixture
def fixtures_data():
    path = os.path.join(FIXTURES_DIR, "valid", "field-mapping-scenarios.fixture.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def agent():
    return SemanticFieldMappingAgent(confidence_threshold=0.80)


class TestSemanticFieldMappingPython:

    def test_exact_match(self, agent, fixtures_data):
        """Exact match on full name signals must map to Rahul Kumar with status MATCHED and isFillable True."""
        kg = fixtures_data["knowledgeGraph"]
        scenario = fixtures_data["scenarios"]["exactMatch"]
        website_field = scenario["websiteField"]

        mapping = agent.map_field(website_field, kg)
        assert mapping.status == "MATCHED"
        assert mapping.applicantField == "applicant.fullName"
        assert mapping.candidateValue == "Rahul Kumar"
        assert mapping.confidence >= 0.85
        assert mapping.isFillable is True
        assert mapping.evidence == "Aadhaar.pdf"

    def test_synonym_match(self, agent, fixtures_data):
        """Synonym (cand_name) must map to applicant.fullName without depending on exact field name."""
        kg = fixtures_data["knowledgeGraph"]
        scenario = fixtures_data["scenarios"]["synonym"]
        website_field = scenario["websiteField"]

        mapping = agent.map_field(website_field, kg)
        assert mapping.status == "MATCHED"
        assert mapping.applicantField == "applicant.fullName"
        assert mapping.candidateValue == "Rahul Kumar"
        assert mapping.isFillable is True

    def test_different_wording_with_context(self, agent, fixtures_data):
        """Different wording (Parent/Guardian) with semantic context maps to family.fatherName."""
        kg = fixtures_data["knowledgeGraph"]
        scenario = fixtures_data["scenarios"]["differentWording"]
        website_field = scenario["websiteField"]

        mapping = agent.map_field(website_field, kg)
        assert mapping.status == "MATCHED"
        assert mapping.applicantField == "family.fatherName"
        assert mapping.candidateValue == "Suresh Kumar"
        assert mapping.isFillable is True
        assert "Marksheet.pdf" in mapping.evidence

    def test_missing_data(self, agent, fixtures_data):
        """Field identified semantically but missing in Knowledge Graph must have status MISSING and isFillable False."""
        kg = fixtures_data["knowledgeGraph"]
        scenario = fixtures_data["scenarios"]["missingData"]
        website_field = scenario["websiteField"]

        mapping = agent.map_field(website_field, kg)
        assert mapping.status == "MISSING"
        assert mapping.applicantField == "financial.bankAccountNumber"
        assert mapping.candidateValue is None
        assert mapping.isFillable is False

    def test_conflicting_data(self, agent, fixtures_data):
        """Field with active FIELD_CONFLICT must have status CONFLICT and isFillable False."""
        kg = fixtures_data["knowledgeGraph"]
        scenario = fixtures_data["scenarios"]["conflictingData"]
        website_field = scenario["websiteField"]

        mapping = agent.map_field(website_field, kg)
        assert mapping.status == "CONFLICT"
        assert mapping.applicantField == "applicant.dateOfBirth"
        assert mapping.isFillable is False
        assert mapping.conflictDetails is not None
        assert mapping.conflictDetails.reason == "FIELD_CONFLICT"

    def test_wrong_semantic_type(self, agent, fixtures_data):
        """File upload element with email label must be penalized/rejected, not filled."""
        kg = fixtures_data["knowledgeGraph"]
        scenario = fixtures_data["scenarios"]["wrongSemanticType"]
        website_field = scenario["websiteField"]

        mapping = agent.map_field(website_field, kg)
        assert mapping.status in ["REQUIRES_USER", "AMBIGUOUS"]
        assert mapping.isFillable is False

    def test_low_confidence(self, agent, fixtures_data):
        """Vague field with low confidence must have status REQUIRES_USER and isFillable False."""
        kg = fixtures_data["knowledgeGraph"]
        scenario = fixtures_data["scenarios"]["lowConfidence"]
        website_field = scenario["websiteField"]

        mapping = agent.map_field(website_field, kg)
        assert mapping.status == "REQUIRES_USER"
        assert mapping.isFillable is False
        assert mapping.confidence < 0.80

    def test_ambiguous_signals(self, agent, fixtures_data):
        """Field with competing signals across multiple targets must be flagged AMBIGUOUS and isFillable False."""
        kg = fixtures_data["knowledgeGraph"]
        ambiguous_field = {
            "fieldId": "f_ambig_parent_guard",
            "name": "guardian_parent_name",
            "label": "Parent or Guardian Name",
            "type": "text",
            "selector": "#guardian_parent_name"
        }
        mapping = agent.map_field(ambiguous_field, kg)
        assert mapping.isFillable is False
        assert mapping.status == "AMBIGUOUS"
        assert len(mapping.alternativeMatches) >= 2

    def test_page_batch_mapping_canonical_validation(self, agent, fixtures_data):
        """Full page mapping set must strictly validate against canonical semantic-field-mapping schema."""
        kg = fixtures_data["knowledgeGraph"]
        fields = [
            fixtures_data["scenarios"]["exactMatch"]["websiteField"],
            fixtures_data["scenarios"]["synonym"]["websiteField"],
            fixtures_data["scenarios"]["differentWording"]["websiteField"],
            fixtures_data["scenarios"]["missingData"]["websiteField"],
            fixtures_data["scenarios"]["conflictingData"]["websiteField"]
        ]

        result_set = agent.map_page_fields(
            fields,
            knowledge_graph=kg,
            page_url="https://scholarships.gov.in/app",
            page_type="APPLICATION_FORM"
        )
        data = result_set.model_dump()
        assert data["schemaVersion"] == "2.0.0"
        assert len(data["mappings"]) == 5
        assert data["stats"]["totalFields"] == 5
        assert data["stats"]["matched"] == 3
        assert data["stats"]["missing"] == 1
        assert data["stats"]["conflict"] == 1
        assert data["stats"]["fillableCount"] == 3

        is_valid, errors = validate_canonical("semantic-field-mapping", data)
        assert is_valid is True, f"Generated mapping set failed canonical validation: {errors}"
