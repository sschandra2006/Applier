"""
Missing Information Engine Tests (ai-service).
Verifies:
1. Missing mandatory qualifications prioritized as REQUIRED questions.
2. Missing preferred qualifications prioritized as HIGH_VALUE questions.
3. Supplemental qualifications prioritized as OPTIONAL questions.
4. Response validation: practical experience -> PROFILE_SKILL.
5. Response validation: basic familiarity -> notes only (never full profile skill).
6. Response validation: declined/no experience -> marked DECLINED.
7. Deduplication & prevention of re-asking answered or declined questions.
8. Application screening questions segregated from permanent profile.
9. Orchestrator integration.
"""

import pytest
from core.models import (
    JobMatchReport,
    JobMatchBreakdown,
    RequirementEvidenceMapping,
    GapQuestionItem
)
from services.gap_question_generator import gap_question_generator
from agents.missing_info_agent import missing_info_agent
from core.orchestrator import orchestrator


@pytest.fixture
def sample_match_report():
    breakdown = JobMatchBreakdown(
        mandatoryCoverage=50.0,
        preferredCoverage=0.0,
        totalRequirements=4,
        supportedCount=1,
        partiallySupportedCount=1,
        needsClarificationCount=0,
        notFoundCount=2
    )
    evidence_mappings = [
        # 1. Supported skill (should NOT trigger question)
        RequirementEvidenceMapping(
            requirementId="req_python",
            requirementText="Python",
            requirementType="TECHNICAL_SKILL",
            importance="MANDATORY",
            status="SUPPORTED",
            matchingEvidence=["Verified skill: Python"],
            sourceItems=["skills[0]"],
            explanation="Exact match"
        ),
        # 2. Missing Mandatory Skill -> REQUIRED
        RequirementEvidenceMapping(
            requirementId="req_docker",
            requirementText="Docker containerization",
            requirementType="TECHNICAL_SKILL",
            importance="MANDATORY",
            status="NOT_FOUND",
            explanation="No evidence in profile"
        ),
        # 3. Missing Preferred Skill -> HIGH_VALUE
        RequirementEvidenceMapping(
            requirementId="req_pytorch",
            requirementText="PyTorch",
            requirementType="TECHNICAL_SKILL",
            importance="PREFERRED",
            status="NOT_FOUND",
            explanation="No evidence in profile"
        ),
        # 4. Mandatory Screening Question -> REQUIRED (APPLICATION_ANSWER)
        RequirementEvidenceMapping(
            requirementId="req_sponsorship",
            requirementText="Will you now or in the future require visa sponsorship?",
            requirementType="SCREENING",
            importance="MANDATORY",
            status="NEEDS_CLARIFICATION",
            explanation="Screening question"
        ),
        # 5. Optional supplemental link -> OPTIONAL
        RequirementEvidenceMapping(
            requirementId="req_portfolio",
            requirementText="Design portfolio or personal website",
            requirementType="OTHER",
            importance="PREFERRED",
            status="NOT_FOUND",
            explanation="No link found"
        )
    ]
    return JobMatchReport(
        jobTitle="Senior ML Platform Engineer",
        companyName="AI Research Labs",
        requirementCoverageEstimate=37.5,
        breakdown=breakdown,
        evidenceMappings=evidence_mappings
    )


class TestGapQuestionGenerator:
    def test_question_prioritization_and_categorization(self, sample_match_report):
        questions = gap_question_generator.generate_questions(
            match_report=sample_match_report,
            candidate_profile={}
        )

        # 4 gaps total (Python was supported, so no question generated for it)
        assert len(questions) == 4

        # Verify priority ordering: REQUIRED questions appear before HIGH_VALUE, then OPTIONAL
        categories = [q.category for q in questions]
        assert categories[0] == "REQUIRED"
        assert categories[1] == "REQUIRED"
        assert categories[2] == "HIGH_VALUE"
        assert categories[3] == "OPTIONAL"

        # Verify content of REQUIRED technical skill question (Docker)
        docker_q = next(q for q in questions if "Docker" in q.targetKey)
        assert docker_q.category == "REQUIRED"
        assert docker_q.targetEntity == "PROFILE_SKILL"
        assert "Docker" in docker_q.questionText

        # Verify content of HIGH_VALUE question (PyTorch)
        pytorch_q = next(q for q in questions if "PyTorch" in q.targetKey)
        assert pytorch_q.category == "HIGH_VALUE"
        assert pytorch_q.targetEntity == "PROFILE_SKILL"
        assert "prefers experience with PyTorch" in pytorch_q.questionText

        # Verify screening question targetEntity is APPLICATION_ANSWER
        sponsor_q = next(q for q in questions if q.requirementId == "req_sponsorship")
        assert sponsor_q.category == "REQUIRED"
        assert sponsor_q.targetEntity == "APPLICATION_ANSWER"

    def test_do_not_reask_answered_or_declined_questions(self, sample_match_report):
        # User already answered Docker and declined PyTorch
        answered = {"Docker"}
        declined = {"PyTorch"}

        questions = gap_question_generator.generate_questions(
            match_report=sample_match_report,
            candidate_profile={},
            answered_keys=answered,
            declined_keys=declined
        )

        keys = [q.targetKey for q in questions]
        assert "Docker" not in keys
        assert "PyTorch" not in keys
        assert len(questions) == 2  # Only sponsorship and portfolio remain

    def test_validate_answer_practical_experience(self):
        question = GapQuestionItem(
            id="q1",
            requirementId="req_1",
            category="HIGH_VALUE",
            targetEntity="PROFILE_SKILL",
            targetKey="PyTorch",
            questionText="Have you used PyTorch?",
            contextExplanation="Preferred by employer",
            options=[]
        )
        res = gap_question_generator.validate_answer(
            question=question,
            user_response={
                "selectedOptionId": "experienced",
                "yearsOfExperience": 2.5,
                "details": "Trained transformer models for NLP sentiment analysis."
            }
        )
        assert res.isValid is True
        assert res.targetEntity == "PROFILE_SKILL"
        assert res.isDeclined is False
        assert res.isFamiliarOnly is False
        skill = res.updateData["skill"]
        assert skill["name"] == "PyTorch"
        assert skill["yearsOfExperience"] == 2.5
        assert skill["provenance"]["source"] == "USER_CONFIRMED"

    def test_validate_answer_familiar_only_does_not_add_full_skill(self):
        question = GapQuestionItem(
            id="q2",
            requirementId="req_2",
            category="HIGH_VALUE",
            targetEntity="PROFILE_SKILL",
            targetKey="Kubernetes",
            questionText="Have you used Kubernetes?",
            contextExplanation="Nice to have",
            options=[]
        )
        res = gap_question_generator.validate_answer(
            question=question,
            user_response={"selectedOptionId": "familiar"}
        )
        assert res.isValid is True
        assert res.isFamiliarOnly is True
        # Explicit rule: Do not automatically add a skill merely because the user says they have heard of it
        assert "skill" not in res.updateData
        assert res.targetEntity == "APPLICATION_ANSWER"
        assert "Familiar with basic concepts" in res.updateData["familiarityNote"]

    def test_validate_answer_declined(self):
        question = GapQuestionItem(
            id="q3",
            requirementId="req_3",
            category="REQUIRED",
            targetEntity="PROFILE_SKILL",
            targetKey="Rust",
            questionText="Do you have Rust experience?",
            contextExplanation="Mandatory for role",
            options=[]
        )
        res = gap_question_generator.validate_answer(
            question=question,
            user_response={"selectedOptionId": "none"}
        )
        assert res.isValid is True
        assert res.isDeclined is True
        assert res.targetEntity == "DECLINED"


class TestOrchestratorGapQuestionIntegration:
    def test_orchestrator_generate_gap_questions_intent(self, sample_match_report):
        payload = {
            "intent": "generate_gap_questions",
            "raw_data": {
                "matchReport": sample_match_report.model_dump(),
                "profile": {},
                "answeredKeys": [],
                "declinedKeys": []
            }
        }
        res = orchestrator.execute(payload)
        assert res["success"] is True
        assert res["intent"] == "generate_gap_questions"
        data = res["data"]["data"]
        assert data["totalQuestions"] == 4
        assert len(data["questions"]) == 4
