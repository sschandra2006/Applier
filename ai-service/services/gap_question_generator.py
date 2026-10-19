"""
Gap Question Generator & Answer Validator Service
Analyzes requirement-to-profile match reports, prioritizes genuine information gaps,
formulates specific, grounded questions with standard response options,
and validates user confirmations with strict segregation between permanent profile
updates and application-specific answers.
"""

import logging
import uuid
from typing import Any, Dict, List, Optional, Set, Tuple

from core.models import (
    JobMatchReport,
    RequirementEvidenceMapping,
    GapQuestionItem,
    GapQuestionOption,
    GapAnswerValidationResult
)
from services.skill_normalizer import normalize_skill, extract_canonical_skill

logger = logging.getLogger("GapQuestionGenerator")


def _generate_skill_question_options() -> List[GapQuestionOption]:
    return [
        GapQuestionOption(
            id="experienced",
            label="Yes, I have practical experience",
            requiresDetails=True,
            detailPrompt="Briefly describe how you used it (e.g. project name, key tasks, or years)"
        ),
        GapQuestionOption(
            id="familiar",
            label="Only basic familiarity (learning / theoretical)",
            requiresDetails=False,
            detailPrompt=None
        ),
        GapQuestionOption(
            id="none",
            label="No experience with this",
            requiresDetails=False,
            detailPrompt=None
        ),
        GapQuestionOption(
            id="clarify",
            label="Need to clarify or add custom note",
            requiresDetails=True,
            detailPrompt="Explain your background regarding this requirement"
        )
    ]


def _generate_screening_question_options() -> List[GapQuestionOption]:
    return [
        GapQuestionOption(
            id="yes",
            label="Yes",
            requiresDetails=False
        ),
        GapQuestionOption(
            id="no",
            label="No",
            requiresDetails=False
        ),
        GapQuestionOption(
            id="custom",
            label="Other / Specify details",
            requiresDetails=True,
            detailPrompt="Provide your specific response"
        )
    ]


def _generate_experience_question_options() -> List[GapQuestionOption]:
    return [
        GapQuestionOption(
            id="additional_exp",
            label="Yes, I have additional relevant work or consulting experience",
            requiresDetails=True,
            detailPrompt="Specify company/role, duration, and key responsibilities"
        ),
        GapQuestionOption(
            id="complete_as_is",
            label="No, my profile represents my complete employment history",
            requiresDetails=False
        )
    ]


class GapQuestionGenerator:
    """Generates prioritized, high-quality missing information questions from match gaps."""

    def generate_questions(
        self,
        match_report: JobMatchReport,
        candidate_profile: Dict[str, Any],
        answered_keys: Optional[Set[str]] = None,
        declined_keys: Optional[Set[str]] = None
    ) -> List[GapQuestionItem]:
        """
        Scans evidence mappings for gaps (NOT_FOUND, PARTIALLY_SUPPORTED, NEEDS_CLARIFICATION)
        and generates prioritized questions. Skips previously answered or declined items.
        """
        answered_keys = answered_keys or set()
        declined_keys = declined_keys or set()

        questions: List[GapQuestionItem] = []
        seen_target_keys: Set[str] = set()

        for mapping in match_report.evidenceMappings:
            # Only generate questions for genuine gaps
            if mapping.status in ["SUPPORTED", "NOT_APPLICABLE"]:
                continue

            target_key = mapping.requirementId
            req_text = mapping.requirementText
            req_type = mapping.requirementType
            importance = mapping.importance

            # Determine canonical target key if this is a technical skill
            known_skill = extract_canonical_skill(req_text)
            clean_key = known_skill if known_skill else target_key

            # Skip if already confirmed or explicitly declined
            if clean_key.lower() in {k.lower() for k in answered_keys}:
                continue
            if clean_key.lower() in {k.lower() for k in declined_keys}:
                continue
            if clean_key.lower() in seen_target_keys:
                continue

            seen_target_keys.add(clean_key.lower())

            # -------------------------------------------------------------
            # Prioritization Category Determination
            # -------------------------------------------------------------
            if req_type == "SCREENING":
                category = "REQUIRED"
                target_entity = "APPLICATION_ANSWER"
                question_text = f"The application asks: \"{req_text}\". How would you like to answer?"
                explanation = "This is a required screening question on the job application form."
                options = _generate_screening_question_options()

            elif req_type == "EXPERIENCE" and mapping.status == "PARTIALLY_SUPPORTED":
                category = "REQUIRED" if importance == "MANDATORY" else "HIGH_VALUE"
                target_entity = "PROFILE_EXPERIENCE"
                question_text = (
                    f"The job requires: \"{req_text}\". Your profile currently documents fewer verified years. "
                    "Do you have additional relevant full-time, freelance, or consulting experience not yet listed?"
                )
                explanation = f"Resolving this experience gap directly strengthens your qualification for {match_report.jobTitle}."
                options = _generate_experience_question_options()

            elif req_type == "TECHNICAL_SKILL" or known_skill is not None:
                skill_name = known_skill or req_text
                if importance == "MANDATORY":
                    category = "REQUIRED"
                    question_text = (
                        f"The job requires experience with {skill_name}, but your profile does not currently list it. "
                        f"Have you used {skill_name} in a project, previous role, or other practical work?"
                    )
                    explanation = f"{skill_name} is listed as a mandatory requirement for {match_report.jobTitle}."
                else:
                    category = "HIGH_VALUE"
                    question_text = (
                        f"The job prefers experience with {skill_name}, but your profile does not mention it. "
                        f"Have you used {skill_name} in a project, course, or practical setting?"
                    )
                    explanation = f"Adding confirmed experience with {skill_name} will help tailor your resume for this role."

                target_entity = "PROFILE_SKILL"
                clean_key = skill_name
                options = _generate_skill_question_options()

            elif req_type == "EDUCATION" and mapping.status == "PARTIALLY_SUPPORTED":
                category = "REQUIRED" if importance == "MANDATORY" else "HIGH_VALUE"
                target_entity = "PROFILE_EXPERIENCE"
                question_text = (
                    f"The posting mentions: \"{req_text}\". "
                    "Do you have an unlisted degree, academic coursework, or equivalent certification in this domain?"
                )
                explanation = "Clarifying your educational background helps ensure requirements compliance."
                options = _generate_experience_question_options()

            else:
                # General or supplemental requirements
                category = "OPTIONAL"
                target_entity = "APPLICATION_ANSWER"
                question_text = (
                    f"The job posting mentions: \"{req_text}\". "
                    "Do you have relevant background or a supporting portfolio link you would like included?"
                )
                explanation = "Optional background information to highlight in your tailored application."
                options = _generate_skill_question_options()

            q_id = f"gap_{uuid.uuid4().hex[:8]}"
            questions.append(GapQuestionItem(
                id=q_id,
                requirementId=mapping.requirementId,
                category=category,
                targetEntity=target_entity,
                targetKey=clean_key,
                questionText=question_text,
                contextExplanation=explanation,
                options=options,
                status="PENDING"
            ))

        # Sort questions strictly by priority: REQUIRED (0) -> HIGH_VALUE (1) -> OPTIONAL (2)
        priority_weights = {"REQUIRED": 0, "HIGH_VALUE": 1, "OPTIONAL": 2}
        questions.sort(key=lambda q: priority_weights.get(q.category, 3))

        return questions

    def validate_answer(
        self,
        question: GapQuestionItem,
        user_response: Dict[str, Any]
    ) -> GapAnswerValidationResult:
        """
        Validates user response against the question parameters.
        Enforces that 'familiar only' does NOT falsely inject a full profile skill,
        and distinguishes profile vs application-specific updates.
        """
        selected_option_id = user_response.get("selectedOptionId")
        details_text = str(user_response.get("details", "")).strip()

        if not selected_option_id:
            return GapAnswerValidationResult(
                isValid=False,
                targetEntity=question.targetEntity,
                feedback="Please select a response option."
            )

        # 1. User has no experience / declined
        if selected_option_id in ["none", "no", "complete_as_is"]:
            return GapAnswerValidationResult(
                isValid=True,
                targetEntity="DECLINED",
                isDeclined=True,
                isFamiliarOnly=False,
                updateData={"targetKey": question.targetKey, "declinedReason": "User confirmed no experience or declined to add"},
                feedback="Recorded. This question will not be asked again."
            )

        # 2. User has only basic familiarity
        if selected_option_id == "familiar":
            # Rule: Do not automatically add a skill merely because the user says they have heard of it
            return GapAnswerValidationResult(
                isValid=True,
                targetEntity="APPLICATION_ANSWER",
                isDeclined=False,
                isFamiliarOnly=True,
                updateData={
                    "targetKey": question.targetKey,
                    "familiarityNote": f"Familiar with basic concepts of {question.targetKey}; not claimed as verified professional proficiency."
                },
                feedback=f"Noted basic familiarity with {question.targetKey}. (Not added to core profile as verified proficiency)."
            )

        # 3. User confirmed practical experience or custom answer
        if selected_option_id in ["experienced", "yes", "additional_exp", "custom", "clarify"]:
            # If details required and empty, request clarification
            requires_details = any(opt.id == selected_option_id and opt.requiresDetails for opt in question.options)
            if requires_details and not details_text:
                return GapAnswerValidationResult(
                    isValid=False,
                    targetEntity=question.targetEntity,
                    feedback="Please provide brief details (such as project context or duration) to confirm this qualification."
                )

            # Determine routing destination
            if question.targetEntity == "PROFILE_SKILL":
                years = user_response.get("yearsOfExperience")
                if years is None:
                    years = 1.0  # Conservative minimum when confirmed
                try:
                    years = float(years)
                except (ValueError, TypeError):
                    years = 1.0

                update_data = {
                    "skill": {
                        "name": question.targetKey,
                        "category": "Technical",
                        "yearsOfExperience": years,
                        "context": details_text,
                        "provenance": {
                            "source": "USER_CONFIRMED",
                            "status": "VERIFIED"
                        }
                    }
                }
                return GapAnswerValidationResult(
                    isValid=True,
                    targetEntity="PROFILE_SKILL",
                    isDeclined=False,
                    isFamiliarOnly=False,
                    updateData=update_data,
                    feedback=f"Successfully verified and added {question.targetKey} to your professional profile."
                )

            elif question.targetEntity == "PROFILE_PROJECT":
                update_data = {
                    "projectTechnology": {
                        "technology": question.targetKey,
                        "context": details_text
                    }
                }
                return GapAnswerValidationResult(
                    isValid=True,
                    targetEntity="PROFILE_PROJECT",
                    isDeclined=False,
                    isFamiliarOnly=False,
                    updateData=update_data,
                    feedback=f"Updated project details with {question.targetKey}."
                )

            elif question.targetEntity == "APPLICATION_ANSWER":
                # Strictly application-specific: does not alter global profile
                val = details_text if details_text else selected_option_id
                update_data = {
                    "field": question.targetKey,
                    "value": val
                }
                return GapAnswerValidationResult(
                    isValid=True,
                    targetEntity="APPLICATION_ANSWER",
                    isDeclined=False,
                    isFamiliarOnly=False,
                    updateData=update_data,
                    feedback="Saved application-specific answer."
                )

            elif question.targetEntity == "PROFILE_EXPERIENCE":
                update_data = {
                    "additionalExperienceNote": details_text
                }
                return GapAnswerValidationResult(
                    isValid=True,
                    targetEntity="PROFILE_EXPERIENCE",
                    isDeclined=False,
                    isFamiliarOnly=False,
                    updateData=update_data,
                    feedback="Saved experience clarification."
                )

        return GapAnswerValidationResult(
            isValid=False,
            targetEntity=question.targetEntity,
            feedback="Unrecognized response option."
        )


gap_question_generator = GapQuestionGenerator()
