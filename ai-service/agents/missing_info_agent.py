"""
Missing Information Agent
Handles the generation of prioritized gap questions and validates user responses
for the Job-Specific Missing-Information Engine.
"""

import logging
from typing import Any, Dict, List, Optional, Set

from core.models import JobMatchReport, GapQuestionItem
from services.gap_question_generator import gap_question_generator

logger = logging.getLogger("MissingInfoAgent")


class MissingInfoAgent:
    """Agent that bridges between JobMatchReports and interactive user clarification."""

    def process(self, context: dict) -> dict:
        raw_data = context.get("raw_data", {})
        sub_intent = raw_data.get("subIntent", "generate_questions")

        if sub_intent == "validate_answer":
            return self._handle_validate_answer(raw_data)
        else:
            return self._handle_generate_questions(raw_data)

    def _handle_generate_questions(self, raw_data: dict) -> dict:
        match_report_dict = raw_data.get("matchReport", {})
        candidate_profile = raw_data.get("profile", {})
        answered_keys = set(raw_data.get("answeredKeys", []))
        declined_keys = set(raw_data.get("declinedKeys", []))

        if not match_report_dict:
            return {
                "action": "gap_questions_generated",
                "success": False,
                "error": "Missing match report for gap question generation.",
                "data": None
            }

        try:
            match_report = JobMatchReport(**match_report_dict)
            questions = gap_question_generator.generate_questions(
                match_report=match_report,
                candidate_profile=candidate_profile,
                answered_keys=answered_keys,
                declined_keys=declined_keys
            )

            return {
                "action": "gap_questions_generated",
                "success": True,
                "data": {
                    "totalQuestions": len(questions),
                    "questions": [q.model_dump() for q in questions]
                },
                "confidence": 0.95
            }
        except Exception as e:
            logger.error(f"Failed to generate gap questions: {e}", exc_info=True)
            return {
                "action": "gap_questions_generated",
                "success": False,
                "error": str(e),
                "data": None
            }

    def _handle_validate_answer(self, raw_data: dict) -> dict:
        question_dict = raw_data.get("question", {})
        user_response = raw_data.get("userResponse", {})

        if not question_dict or not user_response:
            return {
                "action": "gap_answer_validated",
                "success": False,
                "error": "Missing question or user response data.",
                "data": None
            }

        try:
            question = GapQuestionItem(**question_dict)
            validation_result = gap_question_generator.validate_answer(question, user_response)

            return {
                "action": "gap_answer_validated",
                "success": True,
                "data": validation_result.model_dump(),
                "confidence": 1.0 if validation_result.isValid else 0.5
            }
        except Exception as e:
            logger.error(f"Failed to validate gap answer: {e}", exc_info=True)
            return {
                "action": "gap_answer_validated",
                "success": False,
                "error": str(e),
                "data": None
            }


missing_info_agent = MissingInfoAgent()
