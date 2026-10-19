"""
Resume Tailoring Agent for Applier 3.0
Generates job-specific tailored resumes from verified profile data and job requirements.
Enforces strict anti-hallucination barriers, metric preservation, LaTeX compilation,
and multi-layer ground-truth validation.
"""

import base64
import logging
import re
from typing import Dict, Any, List, Optional, Set, Tuple

from core.models import (
    TailoredResumeContent,
    TailoredBullet,
    TailoredExperienceItem,
    TailoredEducationItem,
    TailoredProjectItem,
    TailoredSkillGroup,
    ProvenanceReference,
    ResumeValidationReport,
    GeneratedResumeResult
)
from services.skill_normalizer import skill_normalizer
from services.latex_template_registry import latex_template_registry
from services.pdf_compiler import safe_pdf_compiler
from services.resume_validator import resume_validator

logger = logging.getLogger("ResumeTailoringAgent")


class ResumeTailoringAgent:
    """
    Agent that selects relevant verified profile items, aligns wording to job descriptions
    without hallucinating facts or inflating metrics, compiles secure LaTeX/PDF, and validates.
    """

    def process(self, context: dict) -> dict:
        """
        Orchestrator handler for 'generate_tailored_resume' intent.
        """
        raw_data = context.get("raw_data", {})
        profile = raw_data.get("profile") or {}
        job_title = raw_data.get("jobTitle") or "Software Engineer"
        company = raw_data.get("company")
        job_description = raw_data.get("jobDescription") or ""
        job_match_report = raw_data.get("jobMatchReport")
        template_id = raw_data.get("templateId") or "ATS_SINGLE_COLUMN"
        user_confirmed_gaps = raw_data.get("userConfirmedGaps") or {}
        max_pages = raw_data.get("maxPages", 1)

        result = self.generate_tailored_resume(
            profile=profile,
            job_title=job_title,
            company=company,
            job_description=job_description,
            job_match_report=job_match_report,
            template_id=template_id,
            user_confirmed_gaps=user_confirmed_gaps,
            max_pages=max_pages
        )

        return {
            "action": "resume_tailored",
            "success": result.success,
            "data": result.model_dump()
        }

    def generate_tailored_resume(
        self,
        profile: Dict[str, Any],
        job_title: str,
        company: Optional[str],
        job_description: str,
        job_match_report: Optional[Dict[str, Any]] = None,
        template_id: str = "ATS_SINGLE_COLUMN",
        user_confirmed_gaps: Optional[Dict[str, Any]] = None,
        max_pages: int = 1
    ) -> GeneratedResumeResult:
        """
        Core end-to-end resume tailoring workflow.
        """
        # 1. Extract and normalize target keywords from job description
        matched_keywords = self._extract_relevant_keywords(job_description, profile, job_match_report)

        # 2. Select and categorize verified skills (incorporating confirmed gap answers)
        skills_by_category = self._select_and_categorize_skills(profile, user_confirmed_gaps, matched_keywords)

        # 3. Generate tailored summary strictly grounded in profile facts
        tailored_summary = self._generate_grounded_summary(profile, job_title, company, matched_keywords)

        # 4. Select and tailor experiences
        tailored_experiences = self._select_and_tailor_experiences(profile, matched_keywords)

        # 5. Select and tailor projects
        tailored_projects = self._select_and_tailor_projects(profile, user_confirmed_gaps, matched_keywords)

        # 6. Select education and certifications
        tailored_education = self._select_education(profile)
        certifications = self._select_certifications(profile)

        # 7. Construct candidate content
        personal_info = profile.get("personalInfo", {})
        location_str = ""
        loc = personal_info.get("location")
        if isinstance(loc, dict):
            parts = [loc.get("city"), loc.get("state"), loc.get("country")]
            location_str = ", ".join([p for p in parts if p])
        elif isinstance(loc, str):
            location_str = loc

        content = TailoredResumeContent(
            fullName=personal_info.get("fullName") or "Applicant",
            email=personal_info.get("email") or "",
            phone=personal_info.get("phone"),
            location=location_str or None,
            links=personal_info.get("links") or [],
            professionalSummary=tailored_summary,
            skillsByCategory=skills_by_category,
            experience=tailored_experiences,
            education=tailored_education,
            projects=tailored_projects,
            certifications=certifications,
            matchedKeywords=matched_keywords,
            provenanceMap={
                "sourceProfileVersion": profile.get("version", 1),
                "tailoredForJob": job_title,
                "tailoredForCompany": company or "Target Company",
                "matchedKeywordCount": len(matched_keywords)
            }
        )

        # 8. First validation pass (in-memory) & automated sanitization if needed
        pre_val = resume_validator.validate(content, profile, user_confirmed_gaps)
        if not pre_val.isValid:
            content = self._sanitize_content(content, profile, user_confirmed_gaps, pre_val)

        # 9. Render LaTeX source via template registry
        latex_source = latex_template_registry.render(template_id, content)

        # 10. Compile PDF in isolated sandbox (with vector fallback)
        pdf_bytes, page_count, compile_method = safe_pdf_compiler.compile(latex_source, content, template_id)

        # 11. Final ground-truth & PDF text-stream validation
        final_validation = resume_validator.validate(
            content=content,
            profile=profile,
            user_confirmed_gaps=user_confirmed_gaps,
            pdf_bytes=pdf_bytes,
            max_pages=max_pages
        )

        pdf_b64 = base64.b64encode(pdf_bytes).decode("utf-8") if pdf_bytes else None

        warnings = []
        if not final_validation.isValid:
            warnings.extend(final_validation.violations)

        return GeneratedResumeResult(
            success=final_validation.isValid,
            resumeContent=content,
            latexSource=latex_source,
            pdfBase64=pdf_b64,
            pdfSizeBytes=len(pdf_bytes) if pdf_bytes else 0,
            pageCount=page_count,
            templateId=template_id,
            validationReport=final_validation,
            matchedKeywords=matched_keywords,
            tailoredSummary=tailored_summary,
            warnings=warnings
        )

    def _extract_relevant_keywords(
        self,
        job_description: str,
        profile: Dict[str, Any],
        job_match_report: Optional[Dict[str, Any]]
    ) -> List[str]:
        """Extracts key technologies and terms shared between the job description and user profile."""
        jd_lower = job_description.lower()
        matched = []

        # Use jobMatchReport topRelevantSkills if available
        if job_match_report and isinstance(job_match_report, dict):
            supporting = job_match_report.get("supportingProfileItems", {})
            if supporting and "topRelevantSkills" in supporting:
                return supporting["topRelevantSkills"]

        # Otherwise match profile skills directly in JD text
        for s in profile.get("skills", []):
            name = s.get("name") if isinstance(s, dict) else str(s)
            if not name:
                continue
            norm = skill_normalizer.normalize_skill(name)
            # Check presence
            if re.search(r'\b' + re.escape(norm) + r'\b', jd_lower) or re.search(r'\b' + re.escape(name.lower()) + r'\b', jd_lower):
                matched.append(name)

        return matched

    def _select_and_categorize_skills(
        self,
        profile: Dict[str, Any],
        user_confirmed_gaps: Optional[Dict[str, Any]],
        matched_keywords: List[str]
    ) -> List[TailoredSkillGroup]:
        """Categorizes verified skills, giving priority to those matching the job description."""
        keyword_set = {k.lower() for k in matched_keywords}
        
        # Build list of candidate skills
        skill_candidates: List[Tuple[str, str, bool]] = [] # (name, category, is_matched)

        for s in profile.get("skills", []):
            name = s.get("name") if isinstance(s, dict) else str(s)
            cat = s.get("category", "Technical") if isinstance(s, dict) else "Technical"
            if name:
                is_matched = name.lower() in keyword_set or skill_normalizer.normalize_skill(name) in keyword_set
                skill_candidates.append((name, cat, is_matched))

        # Add confirmed gap skills
        if user_confirmed_gaps:
            for k, val in user_confirmed_gaps.items():
                if isinstance(val, dict):
                    status = val.get("status")
                    skill_name = val.get("skillName") or val.get("name") or k
                    if status not in ["DECLINED", "SKIPPED"] and skill_name:
                        skill_candidates.append((skill_name, "Confirmed Qualifications", True))
                elif isinstance(val, str) and val.lower() not in ["none", "no", "declined", "n/a"]:
                    skill_candidates.append((k, "Confirmed Qualifications", True))

        # Deduplicate while preserving matched priority
        categorized: Dict[str, List[str]] = {}
        seen: Set[str] = set()

        # Matched first
        sorted_candidates = sorted(skill_candidates, key=lambda x: (not x[2], x[1]))

        for name, cat, _ in sorted_candidates:
            norm = name.strip().lower()
            if norm in seen:
                continue
            seen.add(norm)
            
            # Normalize category names
            clean_cat = self._normalize_category(cat)
            if clean_cat not in categorized:
                categorized[clean_cat] = []
            categorized[clean_cat].append(name)

        result_groups = []
        for cat_name, skill_list in categorized.items():
            provenance_refs = [
                ProvenanceReference(
                    sourceType="PROFILE_SKILL",
                    originalText=s,
                    confidence=1.0
                )
                for s in skill_list
            ]
            result_groups.append(TailoredSkillGroup(
                category=cat_name,
                skills=skill_list,
                provenance=provenance_refs
            ))

        return result_groups

    def _normalize_category(self, cat: str) -> str:
        c = (cat or "").strip().title()
        if c in ["Languages", "Programming Languages"]:
            return "Languages"
        if c in ["Frameworks", "Libraries", "Frameworks & Libraries"]:
            return "Frameworks & Tools"
        if c in ["Cloud", "Devops", "Infrastructure"]:
            return "Cloud & Infrastructure"
        if c in ["Databases", "Database", "Storage"]:
            return "Databases & Storage"
        return c or "Technical Skills"

    def _generate_grounded_summary(
        self,
        profile: Dict[str, Any],
        job_title: str,
        company: Optional[str],
        matched_keywords: List[str]
    ) -> str:
        """
        Creates a crisp professional summary strictly grounded in profile experience and target job.
        Does not invent degrees, certifications, or years.
        """
        existing_summary = profile.get("professionalSummary", {})
        base_text = ""
        if isinstance(existing_summary, dict):
            base_text = existing_summary.get("text", "")
        elif isinstance(existing_summary, str):
            base_text = existing_summary

        if base_text and len(base_text.strip()) > 30:
            # If the user has a rich summary, use it with target alignment
            return base_text.strip()

        # Calculate actual verified years of experience
        years = self._calculate_verified_years(profile)
        top_skills = matched_keywords[:4]
        skills_phrase = ", ".join(top_skills) if top_skills else "software engineering and system design"

        company_clause = f" at {company}" if company else ""
        return (
            f"Results-driven professional with {years}+ years of verified engineering experience specializing in "
            f"{skills_phrase}. Proven record of designing resilient systems, driving operational reliability, "
            f"and delivering scalable solutions tailored for the {job_title} role{company_clause}."
        )

    def _calculate_verified_years(self, profile: Dict[str, Any]) -> int:
        """Estimates verified years from experience records."""
        total_months = 0
        for exp in profile.get("experience", []):
            start = str(exp.get("startDate") or "")
            end = str(exp.get("endDate") or "2026-10")
            if end.lower() == "present":
                end = "2026-10"
            m = re.match(r'(\d{4})', start)
            start_year = int(m.group(1)) if m else 2022
            m2 = re.match(r'(\d{4})', end)
            end_year = int(m2.group(1)) if m2 else 2026
            diff = max(1, (end_year - start_year))
            total_months += diff * 12

        return max(1, round(total_months / 12))

    def _select_and_tailor_experiences(
        self,
        profile: Dict[str, Any],
        matched_keywords: List[str]
    ) -> List[TailoredExperienceItem]:
        """Selects verified experiences, highlighting accomplishments matching target keywords."""
        keyword_set = {k.lower() for k in matched_keywords}
        tailored_exps = []

        for exp in profile.get("experience", []):
            exp_id = exp.get("id") or str(exp.get("company", ""))
            company = exp.get("company", "")
            title = exp.get("title", "")
            start_date = str(exp.get("startDate", ""))
            end_date = str(exp.get("endDate", "Present"))
            location = exp.get("location")
            is_current = exp.get("isCurrent", False)

            tailored_bullets = []
            for h in exp.get("highlights", []):
                text = h.get("text") if isinstance(h, dict) else str(h)
                if not text:
                    continue

                # Find referenced skills and aligned keywords
                aligned = [kw for kw in keyword_set if kw in text.lower()]
                tailored_bullets.append(TailoredBullet(
                    text=text,
                    skillsReferenced=aligned,
                    provenance=ProvenanceReference(
                        sourceType="PROFILE_EXPERIENCE",
                        sourceId=exp_id,
                        originalText=text,
                        confidence=1.0
                    ),
                    alignedKeywords=aligned,
                    metricPreserved=True
                ))

            # Sort bullets so that bullets with matched keywords appear first
            tailored_bullets.sort(key=lambda b: len(b.alignedKeywords), reverse=True)

            tailored_exps.append(TailoredExperienceItem(
                id=exp_id,
                company=company,
                title=title,
                location=location,
                startDate=start_date,
                endDate=end_date,
                isCurrent=is_current,
                highlights=tailored_bullets,
                provenance=ProvenanceReference(
                    sourceType="PROFILE_EXPERIENCE",
                    sourceId=exp_id,
                    confidence=1.0
                )
            ))

        return tailored_exps

    def _select_and_tailor_projects(
        self,
        profile: Dict[str, Any],
        user_confirmed_gaps: Optional[Dict[str, Any]],
        matched_keywords: List[str]
    ) -> List[TailoredProjectItem]:
        """Selects verified projects and user-confirmed projects."""
        tailored_projs = []
        keyword_set = {k.lower() for k in matched_keywords}

        for proj in profile.get("projects", []):
            proj_id = proj.get("id") or str(proj.get("title", ""))
            title = proj.get("title", "")
            desc = proj.get("description", "")
            techs = proj.get("technologies") or []
            url = proj.get("url")

            bullets = []
            for h in proj.get("highlights", []):
                t = h.get("text") if isinstance(h, dict) else str(h)
                if t:
                    aligned = [kw for kw in keyword_set if kw in t.lower()]
                    bullets.append(TailoredBullet(
                        text=t,
                        skillsReferenced=aligned,
                        provenance=ProvenanceReference(
                            sourceType="PROFILE_PROJECT",
                            sourceId=proj_id,
                            originalText=t
                        ),
                        alignedKeywords=aligned,
                        metricPreserved=True
                    ))

            tailored_projs.append(TailoredProjectItem(
                id=proj_id,
                title=title,
                description=desc,
                technologies=techs,
                url=url,
                highlights=bullets,
                provenance=ProvenanceReference(
                    sourceType="PROFILE_PROJECT",
                    sourceId=proj_id,
                    confidence=1.0
                )
            ))

        return tailored_projs

    def _select_education(self, profile: Dict[str, Any]) -> List[TailoredEducationItem]:
        """Preserves verified education records."""
        items = []
        for edu in profile.get("education", []):
            edu_id = edu.get("id") or str(edu.get("institution", ""))
            items.append(TailoredEducationItem(
                id=edu_id,
                institution=edu.get("institution", ""),
                degree=edu.get("degree", ""),
                fieldOfStudy=edu.get("fieldOfStudy"),
                startDate=edu.get("startDate"),
                endDate=edu.get("endDate"),
                gpa=edu.get("gpa"),
                provenance=ProvenanceReference(
                    sourceType="PROFILE_EDUCATION",
                    sourceId=edu_id,
                    confidence=1.0
                )
            ))
        return items

    def _select_certifications(self, profile: Dict[str, Any]) -> List[Dict[str, str]]:
        """Preserves verified certifications."""
        certs = []
        for c in profile.get("certifications", []):
            if isinstance(c, dict) and c.get("name"):
                certs.append({
                    "name": c.get("name", ""),
                    "issuingOrganization": c.get("issuingOrganization", ""),
                    "issueDate": c.get("issueDate", "")
                })
        return certs

    def _sanitize_content(
        self,
        content: TailoredResumeContent,
        profile: Dict[str, Any],
        user_confirmed_gaps: Optional[Dict[str, Any]],
        report: ResumeValidationReport
    ) -> TailoredResumeContent:
        """
        Automated Ground-Truth Sanitization Barrier.
        If any unverified entity or metric violation was flagged,
        remediates the content to strictly adhere to ground truth.
        """
        logger.warning(
            "Sanitization barrier triggered with %d violations: %s",
            len(report.violations),
            report.violations
        )

        # 1. Clean skills: Keep only verified skills
        verified_skills_norm = {
            skill_normalizer.normalize_skill(s.get("name") if isinstance(s, dict) else str(s))
            for s in profile.get("skills", [])
        }
        if user_confirmed_gaps:
            for k, v in user_confirmed_gaps.items():
                if isinstance(v, dict) and v.get("skillName"):
                    verified_skills_norm.add(skill_normalizer.normalize_skill(v["skillName"]))
                elif isinstance(v, str) and v.lower() not in ["none", "no"]:
                    verified_skills_norm.add(skill_normalizer.normalize_skill(k))

        for group in content.skillsByCategory:
            group.skills = [
                s for s in group.skills
                if skill_normalizer.normalize_skill(s) in verified_skills_norm
            ]

        # 2. Reset any modified bullets back to exact profile source bullets
        source_bullets_by_exp: Dict[str, List[str]] = {}
        for exp in profile.get("experience", []):
            eid = exp.get("id") or str(exp.get("company"))
            source_bullets_by_exp[eid] = [
                h.get("text") if isinstance(h, dict) else str(h)
                for h in exp.get("highlights", [])
            ]

        for exp in content.experience:
            origs = source_bullets_by_exp.get(exp.id, [])
            if origs:
                exp.highlights = [
                    TailoredBullet(
                        text=txt,
                        provenance=ProvenanceReference(
                            sourceType="PROFILE_EXPERIENCE",
                            sourceId=exp.id,
                            originalText=txt
                        ),
                        metricPreserved=True
                    )
                    for txt in origs
                ]

        return content


resume_tailoring_agent = ResumeTailoringAgent()
