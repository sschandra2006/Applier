"""
Resume Extraction Agent
Parses raw resume text into an authoritative structured ProfessionalProfile
using Qwen 2.5 with strict anti-hallucination guardrails and Pydantic validation.
"""

import base64
import logging
import uuid
import re
from typing import Dict, Any, Optional

from core.llm_service import llm_service
from core.models import ExtractedResumeProfile
from services.document_text_extractor import extract_text_from_document

logger = logging.getLogger("ResumeExtractionAgent")

SYSTEM_PROMPT = """You are an elite, deterministic Resume Intelligence Agent.
Your mission is to extract structured career, education, and skill information from raw resume text with 100% factual accuracy.

NON-NEGOTIABLE ANTI-HALLUCINATION RULES:
1. NEVER invent, infer, or hallucinate qualifications, companies, job titles, employment dates, degrees, certifications, projects, or skills.
2. If any field (e.g. phone number, GPA, start date, end date, or location) is not explicitly present in the text, you MUST leave it as null.
3. For work experience and projects, preserve the applicant's exact accomplishment descriptions and metrics (percentages, dollar amounts, scale metrics). Do not alter numbers.
4. Categorize skills appropriately (e.g. Programming Languages, Frameworks, Cloud & Infrastructure, Developer Tools, Methodologies).
5. Only extract information that is explicitly stated in the document.
"""

class ResumeExtractionAgent:
    """Agent that extracts structured resume data and validates it against canonical Pydantic schemas."""

    def process(self, context: dict) -> dict:
        raw_data = context.get("raw_data", {})
        
        # Check inputs: can receive raw text or base64 file buffer
        raw_text = raw_data.get("text", "")
        file_base64 = raw_data.get("fileBase64", "")
        file_name = raw_data.get("fileName", "resume.pdf")
        mime_type = raw_data.get("mimeType", None)

        metadata = {
            "pages": 1,
            "wordCount": 0,
            "ocrUsed": False
        }

        # If binary buffer provided, run DocumentTextExtractor first
        if file_base64 and not raw_text:
            try:
                file_bytes = base64.b64decode(file_base64)
                extraction_meta = extract_text_from_document(file_bytes, file_name, mime_type)
                raw_text = extraction_meta["text"]
                metadata["pages"] = extraction_meta["pages"]
                metadata["wordCount"] = extraction_meta["wordCount"]
                metadata["ocrUsed"] = extraction_meta["ocrUsed"]
            except Exception as e:
                logger.error(f"Failed to extract text from document buffer: {e}", exc_info=True)
                return {
                    "action": "resume_extracted",
                    "success": False,
                    "error": f"Text extraction failed: {str(e)}",
                    "data": None
                }

        if not raw_text or len(raw_text.strip()) < 20:
            return {
                "action": "resume_extracted",
                "success": False,
                "error": "The document contains insufficient or unreadable text. If this is an image or scanned file, please verify clarity.",
                "data": None
            }

        # Run AI structured extraction
        try:
            structured_profile = self._extract_with_llm(raw_text, file_name)
            
            # Post-processing: assign stable IDs if missing
            self._ensure_stable_ids(structured_profile)

            profile_dict = structured_profile.model_dump()
            profile_dict["metadata"] = metadata

            return {
                "action": "resume_extracted",
                "success": True,
                "data": profile_dict,
                "confidence": structured_profile.confidence
            }
        except Exception as e:
            logger.error(f"Structured AI resume extraction failed: {e}", exc_info=True)
            return {
                "action": "resume_extracted",
                "success": False,
                "error": f"AI Parsing failed: {str(e)}",
                "data": None
            }

    def _extract_with_llm(self, resume_text: str, file_name: str) -> ExtractedResumeProfile:
        prompt = f"""Extract the candidate's complete professional career profile from the following resume text.
File Name: {file_name}

RESUME TEXT:
----------------------------------------
{resume_text}
----------------------------------------

Instructions:
1. Extract the applicant's full name, email, phone, location, and professional links (LinkedIn, GitHub, Portfolio).
2. Extract all employment history (company, job title, location, start date, end date, isCurrent, and bullet point achievements).
3. Extract education history (institution, degree, field of study, graduation dates, GPA, honors).
4. Extract all technical and domain skills, grouped into logical categories.
5. Extract key projects with description, technologies used, and URLs if present.
6. Extract certifications and achievements.
7. CRITICAL: If any detail is unknown or absent in the text, leave it as null. Do NOT invent missing dates or qualifications.

Return ONLY a valid JSON object matching the ExtractedResumeProfile schema.
"""

        return llm_service.generate_safe_json(
            prompt=prompt,
            schema_model=ExtractedResumeProfile,
            temperature=0.1,
            max_output_tokens=3500,
            system_instruction=SYSTEM_PROMPT,
            use_cache=True
        )

    def _ensure_stable_ids(self, profile: ExtractedResumeProfile):
        """Ensures all experience, education, and project entries have unique stable IDs."""
        for idx, exp in enumerate(profile.experience):
            if not exp.id:
                exp.id = f"exp_{idx + 1}_{uuid.uuid4().hex[:6]}"
        for idx, edu in enumerate(profile.education):
            if not edu.id:
                edu.id = f"edu_{idx + 1}_{uuid.uuid4().hex[:6]}"
        for idx, proj in enumerate(profile.projects):
            if not proj.id:
                proj.id = f"proj_{idx + 1}_{uuid.uuid4().hex[:6]}"
        for idx, cert in enumerate(profile.certifications):
            if not cert.id:
                cert.id = f"cert_{idx + 1}_{uuid.uuid4().hex[:6]}"
        for idx, ach in enumerate(profile.achievements):
            if not ach.id:
                ach.id = f"ach_{idx + 1}_{uuid.uuid4().hex[:6]}"
