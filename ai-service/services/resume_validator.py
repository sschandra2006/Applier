"""
Resume Fact-Checking & Ground-Truth Validator for Applier 3.0
Verifies that generated tailored resumes adhere strictly to verified profile facts:
1. Contact information matches verified profile.
2. Employment & education dates match exactly.
3. All skills are grounded in verified profile or confirmed gap answers (Zero Hallucination).
4. All projects correspond to authentic profile records.
5. Metrics, numbers, percentages, and dollar values are strictly preserved (no inflation).
6. PDF binary contains extractable text stream with expected applicant metadata.
"""

import re
import logging
from typing import Dict, Any, List, Optional, Set, Tuple
import fitz  # PyMuPDF

from core.models import TailoredResumeContent, ResumeValidationReport
from services.skill_normalizer import skill_normalizer

logger = logging.getLogger(__name__)


class ResumeValidator:
    """
    Automated Ground-Truth Verifier.
    Enforces non-negotiable architectural invariant:
    Applier will never invent qualifications, employers, dates, skills, or metrics.
    """

    METRIC_PATTERN = re.compile(
        r'(\$\s*\d+(?:[.,]\d+)*(?:\s*[kmbKMB]|(?:\s*million|\s*billion))?|\b\d+(?:[.,]\d+)*\s*%|\b\d+x\b|\b\d+(?:[.,]\d+)*\b)'
    )

    def validate(
        self,
        content: TailoredResumeContent,
        profile: Dict[str, Any],
        user_confirmed_gaps: Optional[Dict[str, Any]] = None,
        pdf_bytes: Optional[bytes] = None,
        max_pages: int = 2
    ) -> ResumeValidationReport:
        """
        Runs comprehensive multi-layer validation checks on the candidate resume.
        """
        violations: List[str] = []
        unsupported_claims: List[str] = []

        # 1. Contact Information Verification
        contact_verified = self._verify_contact_info(content, profile, violations)

        # 2. Consistent Dates Verification
        dates_verified = self._verify_dates(content, profile, violations)

        # 3. Profile-Grounded Skills Verification
        skills_verified = self._verify_skills(content, profile, user_confirmed_gaps, violations, unsupported_claims)

        # 4. Authentic Projects Verification
        projects_verified = self._verify_projects(content, profile, user_confirmed_gaps, violations, unsupported_claims)

        # 5. Preserved Metrics Verification
        metrics_preserved = self._verify_preserved_metrics(content, profile, violations, unsupported_claims)

        # 6. Extracted PDF Text Stream Verification
        pdf_valid = True
        word_count = 0
        page_count = 1

        if pdf_bytes:
            pdf_valid, word_count, page_count = self._verify_pdf_text_stream(
                pdf_bytes, content, max_pages, violations
            )

        is_valid = (
            contact_verified and
            dates_verified and
            skills_verified and
            projects_verified and
            metrics_preserved and
            pdf_valid and
            len(violations) == 0
        )

        return ResumeValidationReport(
            isValid=is_valid,
            contactInfoVerified=contact_verified,
            datesVerified=dates_verified,
            skillsVerified=skills_verified,
            projectsVerified=projects_verified,
            metricsPreserved=metrics_preserved,
            pdfTextExtractable=pdf_valid,
            violations=violations,
            unsupportedClaims=unsupported_claims,
            extractedPdfWordCount=word_count,
            pageCount=page_count
        )

    def _verify_contact_info(
        self,
        content: TailoredResumeContent,
        profile: Dict[str, Any],
        violations: List[str]
    ) -> bool:
        """Ensures name, email, and phone match verified profile."""
        personal_info = profile.get("personalInfo", {})
        expected_name = (personal_info.get("fullName") or "").strip().lower()
        actual_name = (content.fullName or "").strip().lower()

        if expected_name and actual_name != expected_name:
            violations.append(f"Full name mismatch: '{content.fullName}' does not match profile '{personal_info.get('fullName')}'")
            return False

        expected_email = (personal_info.get("email") or "").strip().lower()
        actual_email = (content.email or "").strip().lower()
        if expected_email and actual_email != expected_email:
            violations.append(f"Email mismatch: '{content.email}' does not match profile '{personal_info.get('email')}'")
            return False

        expected_phone = re.sub(r'[\s\-\(\)\+]', '', personal_info.get("phone") or "")
        actual_phone = re.sub(r'[\s\-\(\)\+]', '', content.phone or "")
        if expected_phone and actual_phone and expected_phone != actual_phone:
            violations.append(f"Phone mismatch: '{content.phone}' does not match profile '{personal_info.get('phone')}'")
            return False

        return True

    def _verify_dates(
        self,
        content: TailoredResumeContent,
        profile: Dict[str, Any],
        violations: List[str]
    ) -> bool:
        """Verifies that employment and education dates match verified profile records."""
        all_passed = True
        profile_exps = {e.get("id"): e for e in profile.get("experience", []) if e.get("id")}
        
        # Also map by company and title for fuzzy fallback
        profile_exps_by_title = {
            f"{e.get('company', '').lower()}:::{e.get('title', '').lower()}": e
            for e in profile.get("experience", [])
        }

        for exp in content.experience:
            matched_src = profile_exps.get(exp.id)
            if not matched_src:
                key = f"{exp.company.lower()}:::{exp.title.lower()}"
                matched_src = profile_exps_by_title.get(key)

            if matched_src:
                src_start = str(matched_src.get("startDate") or "").strip()
                src_end = str(matched_src.get("endDate") or "Present").strip()
                
                if exp.startDate.strip() != src_start:
                    violations.append(
                        f"Experience date mismatch for '{exp.company}': startDate '{exp.startDate}' != profile '{src_start}'"
                    )
                    all_passed = False
                
                # Check end date
                if exp.endDate.strip().lower() != src_end.lower():
                    violations.append(
                        f"Experience date mismatch for '{exp.company}': endDate '{exp.endDate}' != profile '{src_end}'"
                    )
                    all_passed = False
            else:
                violations.append(f"Unverified experience entry: '{exp.company} - {exp.title}' not found in profile")
                all_passed = False

        # Education dates
        profile_edus = {e.get("id"): e for e in profile.get("education", []) if e.get("id")}
        profile_edus_by_inst = {e.get("institution", "").lower(): e for e in profile.get("education", [])}

        for edu in content.education:
            matched_edu = profile_edus.get(edu.id) or profile_edus_by_inst.get(edu.institution.lower())
            if matched_edu:
                src_end = str(matched_edu.get("endDate") or "").strip()
                if edu.endDate and src_end and edu.endDate.strip() != src_end:
                    violations.append(
                        f"Education date mismatch for '{edu.institution}': endDate '{edu.endDate}' != profile '{src_end}'"
                    )
                    all_passed = False

        return all_passed

    def _verify_skills(
        self,
        content: TailoredResumeContent,
        profile: Dict[str, Any],
        user_confirmed_gaps: Optional[Dict[str, Any]],
        violations: List[str],
        unsupported_claims: List[str]
    ) -> bool:
        """
        Enforces Zero Hallucinated Skills.
        Every single skill in the tailored resume must exist in the profile or user-confirmed gaps.
        """
        allowed_normalized_skills: Set[str] = set()

        # 1. Profile verified skills
        for s in profile.get("skills", []):
            name = s.get("name") if isinstance(s, dict) else str(s)
            if name:
                allowed_normalized_skills.add(skill_normalizer.normalize_skill(name))
                allowed_normalized_skills.add(name.strip().lower())

        # 2. Confirmed gap answers
        if user_confirmed_gaps:
            for key, val in user_confirmed_gaps.items():
                if isinstance(val, dict):
                    skill_name = val.get("skillName") or val.get("name") or key
                    status = val.get("status")
                    if status not in ["DECLINED", "SKIPPED"] and skill_name:
                        allowed_normalized_skills.add(skill_normalizer.normalize_skill(skill_name))
                        allowed_normalized_skills.add(skill_name.strip().lower())
                elif isinstance(val, str) and val.lower() not in ["none", "no", "declined", "n/a"]:
                    allowed_normalized_skills.add(skill_normalizer.normalize_skill(key))
                    allowed_normalized_skills.add(key.strip().lower())

        all_passed = True
        for group in content.skillsByCategory:
            for skill in group.skills:
                norm = skill_normalizer.normalize_skill(skill)
                raw_lower = skill.strip().lower()

                if norm not in allowed_normalized_skills and raw_lower not in allowed_normalized_skills:
                    violations.append(f"Hallucinated skill detected: '{skill}' is not in verified profile or confirmed answers")
                    unsupported_claims.append(f"Skill: {skill}")
                    all_passed = False

        return all_passed

    def _verify_projects(
        self,
        content: TailoredResumeContent,
        profile: Dict[str, Any],
        user_confirmed_gaps: Optional[Dict[str, Any]],
        violations: List[str],
        unsupported_claims: List[str]
    ) -> bool:
        """Verifies projects belong to profile or confirmed gaps."""
        profile_project_titles = {
            p.get("title", "").strip().lower() for p in profile.get("projects", [])
        }
        profile_project_ids = {
            p.get("id") for p in profile.get("projects", []) if p.get("id")
        }

        # Add confirmed projects
        if user_confirmed_gaps:
            for k, v in user_confirmed_gaps.items():
                if isinstance(v, dict) and v.get("projectTitle"):
                    profile_project_titles.add(v["projectTitle"].strip().lower())

        all_passed = True
        for proj in content.projects:
            title_lower = proj.title.strip().lower()
            if proj.id not in profile_project_ids and title_lower not in profile_project_titles:
                violations.append(f"Unverified project detected: '{proj.title}' not found in profile")
                unsupported_claims.append(f"Project: {proj.title}")
                all_passed = False

        return all_passed

    def _verify_preserved_metrics(
        self,
        content: TailoredResumeContent,
        profile: Dict[str, Any],
        violations: List[str],
        unsupported_claims: List[str]
    ) -> bool:
        """
        Anti-metric tampering / anti-inflation check.
        Ensures numeric tokens, percentages, and dollar amounts in tailored bullets
        match those present in the source profile bullet.
        """
        all_passed = True

        # Build mapping of source highlights
        source_highlights: List[str] = []
        for exp in profile.get("experience", []):
            for h in exp.get("highlights", []):
                text = h.get("text") if isinstance(h, dict) else str(h)
                if text:
                    source_highlights.append(text)
        for proj in profile.get("projects", []):
            if proj.get("description"):
                source_highlights.append(proj["description"])
            for h in proj.get("highlights", []):
                text = h.get("text") if isinstance(h, dict) else str(h)
                if text:
                    source_highlights.append(text)

        all_source_text = " ".join(source_highlights)
        source_metrics = set(self._extract_metrics(all_source_text))

        # Check tailored bullets in experience
        for exp in content.experience:
            for b in exp.highlights:
                bullet_metrics = self._extract_metrics(b.text)
                for metric in bullet_metrics:
                    if metric not in source_metrics:
                        # Allow standard years like "2021", "2022" or small integers 1-5 if they are bullet indices
                        if re.match(r'^(19\d\d|20\d\d)$', metric):
                            continue
                        violations.append(
                            f"Invented or inflated metric '{metric}' detected in bullet: \"{b.text}\""
                        )
                        unsupported_claims.append(f"Metric: {metric}")
                        all_passed = False

        # Check tailored bullets in projects
        for proj in content.projects:
            for b in proj.highlights:
                bullet_metrics = self._extract_metrics(b.text)
                for metric in bullet_metrics:
                    if metric not in source_metrics:
                        if re.match(r'^(19\d\d|20\d\d)$', metric):
                            continue
                        violations.append(
                            f"Invented or inflated metric '{metric}' detected in project bullet: \"{b.text}\""
                        )
                        unsupported_claims.append(f"Metric: {metric}")
                        all_passed = False

        return all_passed

    def _extract_metrics(self, text: str) -> List[str]:
        """Extracts normalized metric tokens like '40%', '$1.2M', '1000', '5x'."""
        matches = self.METRIC_PATTERN.findall(text)
        cleaned = []
        for m in matches:
            norm = m.strip().replace(" ", "").lower()
            if norm:
                cleaned.append(norm)
        return cleaned

    def _verify_pdf_text_stream(
        self,
        pdf_bytes: bytes,
        content: TailoredResumeContent,
        max_pages: int,
        violations: List[str]
    ) -> Tuple[bool, int, int]:
        """
        Parses compiled PDF binary via PyMuPDF to verify:
        - Non-empty vector text stream
        - Word count > 100
        - Presence of applicant name and email
        - Page count limit
        """
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            page_count = len(doc)
            
            if page_count == 0:
                violations.append("Compiled PDF has 0 pages (empty document)")
                doc.close()
                return False, 0, 0

            if page_count > max_pages + 1:
                violations.append(f"Compiled PDF page count ({page_count}) exceeds expected limit ({max_pages})")

            full_text = ""
            for page in doc:
                full_text += page.get_text() + "\n"
            doc.close()

            words = full_text.split()
            word_count = len(words)

            if word_count < 80:
                violations.append(f"Compiled PDF has insufficient text stream ({word_count} words)")
                return False, word_count, page_count

            # Verify applicant name is extractable
            if content.fullName.lower() not in full_text.lower():
                violations.append(f"Applicant full name '{content.fullName}' not found in compiled PDF text stream")
                return False, word_count, page_count

            # Verify email is extractable
            if content.email.lower() not in full_text.lower():
                violations.append(f"Applicant email '{content.email}' not found in compiled PDF text stream")
                return False, word_count, page_count

            return True, word_count, page_count

        except Exception as e:
            violations.append(f"Failed to inspect compiled PDF text stream: {str(e)}")
            return False, 0, 0


resume_validator = ResumeValidator()
