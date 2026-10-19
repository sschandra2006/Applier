"""
Profile Matching Engine
Executes a 5-layer requirement matching analysis comparing job requirements
against verified user profile evidence with explicit uncertainty boundaries.

Layers:
1. Exact Skill Matching
2. Normalized Skill & Alias Resolution
3. Structured Education & Cumulative Experience (with Date Conflict Detection)
4. Semantic Embedding Matching on Accomplishments & Projects
5. Evidence-Based Interpretation for Ambiguous Requirements
"""

import logging
import math
from typing import Any, Dict, List, Optional, Tuple, Set

from core.llm_service import llm_service
from core.models import (
    JobRequirementItem,
    RequirementEvidenceMapping,
    JobMatchBreakdown,
    SupportingProfileItems,
    JobMatchReport
)
from services.skill_normalizer import (
    normalize_skill,
    is_skill_match,
    extract_known_skills_from_text
)
from services.experience_calculator import (
    calculate_cumulative_experience,
    compare_degree_requirements,
    parse_degree_level
)
from agents.jd_analyzer import jd_analyzer

logger = logging.getLogger("ProfileMatchingEngine")


import re

def _cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    """Computes cosine similarity between two float vectors."""
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return max(-1.0, min(1.0, dot / (norm_a * norm_b)))


SEMANTIC_DOMAIN_SYNONYMS = {
    "distributed": {"distributed", "microservices", "event-driven", "cluster", "clusters", "pubsub", "kafka", "rabbitmq"},
    "microservices": {"microservices", "microservice", "services", "soa", "distributed"},
    "scaling": {"scaling", "scale", "scaled", "high-throughput", "throughput", "latency", "load", "optimization", "performance"},
    "designing": {"designing", "design", "architected", "architecture", "built", "engineered", "implemented"},
    "architectures": {"architecture", "architectures", "architected", "infrastructure", "systems", "design"},
    "database": {"database", "databases", "sql", "nosql", "postgres", "postgresql", "mysql", "mongodb", "redis"},
    "cloud": {"cloud", "aws", "gcp", "azure", "kubernetes", "k8s", "docker"}
}


def _token_semantic_similarity(req_text: str, profile_text: str) -> float:
    """
    Computes hybrid token-level semantic overlap, domain synonyms, and root matching
    between requirement text and candidate accomplishment statements.
    Provides offline resilience and deterministic grounding.
    """
    stopwords = {
        "and", "or", "the", "a", "an", "in", "on", "at", "to", "for", "of", "with",
        "by", "as", "is", "are", "be", "proven", "experience", "strong", "ability",
        "demonstrated", "looking", "candidate", "must", "have", "preferred", "role"
    }
    raw_req_tokens = re.findall(r"\b[a-zA-Z0-9+#.]+\b", req_text.lower())
    req_tokens = [t for t in raw_req_tokens if t not in stopwords and len(t) > 2]

    raw_prof_tokens = re.findall(r"\b[a-zA-Z0-9+#.]+\b", profile_text.lower())
    prof_tokens = set([t for t in raw_prof_tokens if t not in stopwords and len(t) > 2])

    if not req_tokens or not prof_tokens:
        return 0.0

    matches = 0
    for r in req_tokens:
        if r in prof_tokens:
            matches += 1
            continue
        # Synonym matching
        if r in SEMANTIC_DOMAIN_SYNONYMS and any(syn in prof_tokens for syn in SEMANTIC_DOMAIN_SYNONYMS[r]):
            matches += 1
            continue
        # Root / stem prefix matching (e.g. 'architect' in 'architected' and 'architectures')
        if len(r) >= 5 and any(r[:5] in p or p[:5] in r for p in prof_tokens if len(p) >= 5):
            matches += 1

    coverage = matches / len(req_tokens)
    return min(1.0, coverage)


class ProfileMatchingEngine:
    """Core matching engine implementing the 5-layer requirement comparison."""

    def process(self, context: dict) -> dict:
        raw_data = context.get("raw_data", {})
        candidate_profile = raw_data.get("profile", {})
        job_title = raw_data.get("jobTitle", "Target Role")
        company_name = raw_data.get("companyName", None)

        # Check if pre-extracted requirements are provided, else extract using JDAnalyzer
        requirements_data = raw_data.get("requirements", [])
        if not requirements_data:
            jd_analysis = jd_analyzer.process(context)
            if not jd_analysis.get("success"):
                return {
                    "action": "job_matching_completed",
                    "success": False,
                    "error": jd_analysis.get("error", "Failed to extract job requirements."),
                    "data": None
                }
            requirements_data = jd_analysis["data"].get("requirements", [])
            job_title = jd_analysis["data"].get("jobTitle", job_title)
            company_name = jd_analysis["data"].get("companyName", company_name)

        # Parse requirement models
        requirements: List[JobRequirementItem] = []
        for r in requirements_data:
            if isinstance(r, JobRequirementItem):
                requirements.append(r)
            elif isinstance(r, dict):
                requirements.append(JobRequirementItem(**r))

        # Perform matching
        report = self.match_requirements(
            requirements=requirements,
            candidate_profile=candidate_profile,
            job_title=job_title,
            company_name=company_name
        )

        report_dump = report.model_dump()
        return {
            "action": "job_matching_completed",
            "success": True,
            "data": report_dump,
            "confidence": 0.95,
            **report_dump
        }

    def match_requirements(
        self,
        requirements: List[JobRequirementItem],
        candidate_profile: Dict[str, Any],
        job_title: str,
        company_name: Optional[str] = None
    ) -> JobMatchReport:
        """
        Executes the layered matching strategy and produces the final JobMatchReport.
        """
        evidence_mappings: List[RequirementEvidenceMapping] = []
        warnings: List[str] = []

        # Extract profile sections
        profile_skills: List[str] = []
        for s in candidate_profile.get("skills", []):
            if isinstance(s, dict):
                profile_skills.append(s.get("name", ""))
            elif isinstance(s, str):
                profile_skills.append(s)

        profile_experience = candidate_profile.get("experience", [])
        profile_education = candidate_profile.get("education", [])
        profile_projects = candidate_profile.get("projects", [])
        profile_certs = candidate_profile.get("certifications", [])

        # Check for date conflicts in experience
        exp_summary = calculate_cumulative_experience(profile_experience)
        if exp_summary["conflicts"]:
            for c in exp_summary["conflicts"]:
                warnings.append(f"Profile Date Anomaly: {c}")

        # Supporting items trackers
        matched_skill_names: Set[str] = set()
        matched_exp_ids: Set[str] = set()
        matched_proj_ids: Set[str] = set()
        matched_cert_names: Set[str] = set()

        # Cache embeddings for candidate items to avoid redundant calls
        profile_texts_to_embed: List[Tuple[str, str, str]] = []  # (source_ref, text, id)
        for idx, exp in enumerate(profile_experience):
            exp_id = exp.get("id", f"exp_{idx + 1}")
            role = exp.get("jobTitle", "")
            comp = exp.get("company", "")
            achievements = " ".join(exp.get("achievements", []))
            full_exp_text = f"{role} at {comp}. {achievements}"
            profile_texts_to_embed.append((f"experience[{idx}]", full_exp_text, exp_id))

        for idx, proj in enumerate(profile_projects):
            proj_id = proj.get("id", f"proj_{idx + 1}")
            name = proj.get("name", "")
            desc = proj.get("description", "")
            techs = ", ".join(proj.get("technologies", []))
            full_proj_text = f"Project {name}: {desc}. Technologies: {techs}"
            profile_texts_to_embed.append((f"projects[{idx}]", full_proj_text, proj_id))

        embedded_profile_items: List[Tuple[str, str, str, List[float]]] = []
        for source_ref, text, item_id in profile_texts_to_embed:
            if text.strip():
                vec = llm_service.embed_content(text)
                embedded_profile_items.append((source_ref, text, item_id, vec))

        # Evaluate each requirement
        for req in requirements:
            mapping = self._evaluate_single_requirement(
                req=req,
                profile_skills=profile_skills,
                profile_experience=profile_experience,
                profile_education=profile_education,
                profile_projects=profile_projects,
                profile_certs=profile_certs,
                exp_summary=exp_summary,
                embedded_profile_items=embedded_profile_items,
                matched_skill_names=matched_skill_names,
                matched_exp_ids=matched_exp_ids,
                matched_proj_ids=matched_proj_ids,
                matched_cert_names=matched_cert_names
            )
            evidence_mappings.append(mapping)

        # Compute Breakdown & Requirement Coverage Estimate
        breakdown, coverage_estimate = self._compute_coverage(evidence_mappings)

        supporting_items = SupportingProfileItems(
            topRelevantSkills=sorted(list(matched_skill_names)),
            topRelevantExperienceIds=sorted(list(matched_exp_ids)),
            topRelevantProjectIds=sorted(list(matched_proj_ids)),
            topRelevantCertifications=sorted(list(matched_cert_names))
        )

        return JobMatchReport(
            jobTitle=job_title,
            companyName=company_name,
            requirementCoverageEstimate=coverage_estimate,
            breakdown=breakdown,
            evidenceMappings=evidence_mappings,
            supportingProfileItems=supporting_items,
            warnings=warnings
        )

    def _evaluate_single_requirement(
        self,
        req: JobRequirementItem,
        profile_skills: List[str],
        profile_experience: List[Dict[str, Any]],
        profile_education: List[Dict[str, Any]],
        profile_projects: List[Dict[str, Any]],
        profile_certs: List[Dict[str, Any]],
        exp_summary: Dict[str, Any],
        embedded_profile_items: List[Tuple[str, str, str, List[float]]],
        matched_skill_names: Set[str],
        matched_exp_ids: Set[str],
        matched_proj_ids: Set[str],
        matched_cert_names: Set[str]
    ) -> RequirementEvidenceMapping:
        """Evaluates a single requirement through the 5-layer pipeline."""

        # -------------------------------------------------------------
        # LAYER 5 CHECK: Explicit Ambiguity / Uncertainty Pre-condition
        # -------------------------------------------------------------
        if req.importance == "UNCERTAIN" and req.ambiguityReason:
            return RequirementEvidenceMapping(
                requirementId=req.id,
                requirementText=req.description,
                requirementType=req.type,
                importance="UNCERTAIN",
                status="NEEDS_CLARIFICATION",
                uncertainty="HIGH",
                needsClarification=True,
                matchingEvidence=[],
                sourceItems=[],
                explanation=f"Requirement classification is ambiguous: {req.ambiguityReason}. Candidate verification recommended."
            )

        # -------------------------------------------------------------
        # LAYER 3: Structured Education Comparison
        # -------------------------------------------------------------
        if req.type == "EDUCATION" or req.degreeLevel is not None:
            target_degree = req.degreeLevel or parse_degree_level(req.description)
            is_satisfied, candidate_highest, explanation = compare_degree_requirements(
                profile_education, target_degree
            )
            if is_satisfied:
                evidence = [
                    f"{edu.get('degree', '')} from {edu.get('institution', '')}"
                    for edu in profile_education if edu.get("degree")
                ]
                return RequirementEvidenceMapping(
                    requirementId=req.id,
                    requirementText=req.description,
                    requirementType=req.type,
                    importance=req.importance,
                    status="SUPPORTED",
                    uncertainty="LOW",
                    needsClarification=False,
                    matchingEvidence=evidence or [f"Holds {candidate_highest} degree"],
                    sourceItems=[f"education[{i}]" for i in range(len(profile_education))],
                    explanation=explanation
                )
            else:
                return RequirementEvidenceMapping(
                    requirementId=req.id,
                    requirementText=req.description,
                    requirementType=req.type,
                    importance=req.importance,
                    status="PARTIALLY_SUPPORTED" if candidate_highest != "NONE" else "NOT_FOUND",
                    uncertainty="LOW",
                    needsClarification=False,
                    matchingEvidence=[f"Candidate highest degree is {candidate_highest}"],
                    sourceItems=[f"education[{i}]" for i in range(len(profile_education))],
                    explanation=explanation
                )

        # -------------------------------------------------------------
        # LAYER 3: Structured Experience Duration Comparison
        # -------------------------------------------------------------
        if req.type == "EXPERIENCE" and req.minYears is not None:
            total_cand_years = exp_summary["totalYears"]
            if total_cand_years >= req.minYears:
                for idx, exp in enumerate(profile_experience):
                    exp_id = exp.get("id", f"exp_{idx + 1}")
                    matched_exp_ids.add(exp_id)

                return RequirementEvidenceMapping(
                    requirementId=req.id,
                    requirementText=req.description,
                    requirementType=req.type,
                    importance=req.importance,
                    status="SUPPORTED",
                    uncertainty="LOW",
                    needsClarification=False,
                    matchingEvidence=[f"Total verified experience: {total_cand_years} years (required: {req.minYears} years)"],
                    sourceItems=[f"experience[{i}]" for i in range(len(profile_experience))],
                    explanation=f"Candidate cumulative experience of {total_cand_years} years satisfies the minimum requirement of {req.minYears} years."
                )
            elif total_cand_years > 0:
                return RequirementEvidenceMapping(
                    requirementId=req.id,
                    requirementText=req.description,
                    requirementType=req.type,
                    importance=req.importance,
                    status="PARTIALLY_SUPPORTED",
                    uncertainty="LOW",
                    needsClarification=False,
                    matchingEvidence=[f"Total verified experience: {total_cand_years} years"],
                    sourceItems=[f"experience[{i}]" for i in range(len(profile_experience))],
                    explanation=f"Candidate has {total_cand_years} years verified experience, which is below the stated minimum of {req.minYears} years."
                )
            else:
                return RequirementEvidenceMapping(
                    requirementId=req.id,
                    requirementText=req.description,
                    requirementType=req.type,
                    importance=req.importance,
                    status="NOT_FOUND",
                    uncertainty="MEDIUM",
                    needsClarification=True,
                    matchingEvidence=[],
                    sourceItems=[],
                    explanation="No verified work experience entries found in candidate profile. (Absence of evidence does not indicate lack of qualification)."
                )

        # -------------------------------------------------------------
        # LAYER 1 & 2: Exact Match & Normalized Skill / Alias Resolution
        # -------------------------------------------------------------
        target_skill_key = req.normalizedKey or req.description
        for idx, p_skill in enumerate(profile_skills):
            is_match, conf, match_type = is_skill_match(p_skill, target_skill_key)
            if is_match:
                matched_skill_names.add(normalize_skill(p_skill) or p_skill)
                return RequirementEvidenceMapping(
                    requirementId=req.id,
                    requirementText=req.description,
                    requirementType=req.type,
                    importance=req.importance,
                    status="SUPPORTED",
                    uncertainty="LOW",
                    needsClarification=False,
                    matchingEvidence=[f"Verified skill: '{p_skill}'"],
                    sourceItems=[f"skills[{idx}]"],
                    explanation=f"Matched candidate skill '{p_skill}' via {match_type}."
                )

        # Check certifications for CERTIFICATION requirements
        if req.type == "CERTIFICATION" or "certifi" in req.description.lower():
            for idx, cert in enumerate(profile_certs):
                cert_name = cert.get("name", "") if isinstance(cert, dict) else str(cert)
                if target_skill_key.lower() in cert_name.lower() or cert_name.lower() in target_skill_key.lower():
                    matched_cert_names.add(cert_name)
                    return RequirementEvidenceMapping(
                        requirementId=req.id,
                        requirementText=req.description,
                        requirementType=req.type,
                        importance=req.importance,
                        status="SUPPORTED",
                        uncertainty="LOW",
                        needsClarification=False,
                        matchingEvidence=[f"Verified certification: {cert_name}"],
                        sourceItems=[f"certifications[{idx}]"],
                        explanation=f"Found matching certification '{cert_name}'."
                    )

        # Check project technologies for skill matches
        for idx, proj in enumerate(profile_projects):
            techs = proj.get("technologies", [])
            proj_id = proj.get("id", f"proj_{idx + 1}")
            for t in techs:
                is_match, _, match_type = is_skill_match(t, target_skill_key)
                if is_match:
                    matched_proj_ids.add(proj_id)
                    matched_skill_names.add(normalize_skill(t) or t)
                    return RequirementEvidenceMapping(
                        requirementId=req.id,
                        requirementText=req.description,
                        requirementType=req.type,
                        importance=req.importance,
                        status="SUPPORTED",
                        uncertainty="LOW",
                        needsClarification=False,
                        matchingEvidence=[f"Used '{t}' in project: '{proj.get('name')}'"],
                        sourceItems=[f"projects[{idx}]"],
                        explanation=f"Demonstrated proficiency in project '{proj.get('name')}' via {match_type}."
                    )

        # -------------------------------------------------------------
        # LAYER 4: Semantic Cosine Similarity on Experience & Projects
        # -------------------------------------------------------------
        req_vector = llm_service.embed_content(req.description)
        best_sim = 0.0
        best_item: Optional[Tuple[str, str, str]] = None

        for source_ref, text, item_id, item_vec in embedded_profile_items:
            cos_sim = _cosine_similarity(req_vector, item_vec)
            token_sim = _token_semantic_similarity(req.description, text)
            effective_sim = max(cos_sim, token_sim)
            if effective_sim > best_sim:
                best_sim = effective_sim
                best_item = (source_ref, text, item_id)

        # Semantic Thresholds
        if best_sim >= 0.75 and best_item:
            source_ref, text, item_id = best_item
            if "experience" in source_ref:
                matched_exp_ids.add(item_id)
            elif "projects" in source_ref:
                matched_proj_ids.add(item_id)

            return RequirementEvidenceMapping(
                requirementId=req.id,
                requirementText=req.description,
                requirementType=req.type,
                importance=req.importance,
                status="SUPPORTED",
                uncertainty="LOW",
                needsClarification=False,
                matchingEvidence=[f"Semantic match ({round(best_sim, 2)}): '{text[:120]}...'"],
                sourceItems=[source_ref],
                explanation=f"Semantically supported by candidate profile evidence ({source_ref}) with similarity {round(best_sim, 2)}."
            )
        elif best_sim >= 0.65 and best_item:
            source_ref, text, item_id = best_item
            if "experience" in source_ref:
                matched_exp_ids.add(item_id)
            elif "projects" in source_ref:
                matched_proj_ids.add(item_id)

            return RequirementEvidenceMapping(
                requirementId=req.id,
                requirementText=req.description,
                requirementType=req.type,
                importance=req.importance,
                status="PARTIALLY_SUPPORTED",
                uncertainty="MEDIUM",
                needsClarification=True,
                matchingEvidence=[f"Related evidence ({round(best_sim, 2)}): '{text[:120]}...'"],
                sourceItems=[source_ref],
                explanation=f"Candidate has related background ({source_ref}) but specific qualification may require clarification."
            )

        # -------------------------------------------------------------
        # LAYER 5: Fallback & Non-Prejudicial Not Found Representation
        # -------------------------------------------------------------
        # Check screening question / application question
        if req.type == "SCREENING":
            return RequirementEvidenceMapping(
                requirementId=req.id,
                requirementText=req.description,
                requirementType=req.type,
                importance=req.importance,
                status="NEEDS_CLARIFICATION",
                uncertainty="HIGH",
                needsClarification=True,
                matchingEvidence=[],
                sourceItems=[],
                explanation="Application screening question requiring direct user answer before submission."
            )

        # Default NOT_FOUND: strictly assert that absence of evidence != lack of qualification
        return RequirementEvidenceMapping(
            requirementId=req.id,
            requirementText=req.description,
            requirementType=req.type,
            importance=req.importance,
            status="NOT_FOUND",
            uncertainty="LOW",
            needsClarification=False,
            matchingEvidence=[],
            sourceItems=[],
            explanation="No direct evidence found in current verified profile. (Absence of evidence does not indicate lack of qualification; consider adding relevant experience if applicable)."
        )

    def _compute_coverage(
        self,
        mappings: List[RequirementEvidenceMapping]
    ) -> Tuple[JobMatchBreakdown, float]:
        """
        Calculates Applier's internal requirement-coverage breakdown and weighted estimate.
        Weights:
          - SUPPORTED: 1.0
          - PARTIALLY_SUPPORTED: 0.5
          - NEEDS_CLARIFICATION: 0.25
          - NOT_FOUND: 0.0
        """
        total = len(mappings)
        if total == 0:
            return JobMatchBreakdown(
                mandatoryCoverage=100.0,
                preferredCoverage=100.0,
                totalRequirements=0,
                supportedCount=0,
                partiallySupportedCount=0,
                needsClarificationCount=0,
                notFoundCount=0
            ), 100.0

        supported = 0
        partially = 0
        clarification = 0
        not_found = 0

        mand_points = 0.0
        mand_max = 0.0

        pref_points = 0.0
        pref_max = 0.0

        for m in mappings:
            # Score points
            if m.status == "SUPPORTED":
                supported += 1
                points = 1.0
            elif m.status == "PARTIALLY_SUPPORTED":
                partially += 1
                points = 0.5
            elif m.status == "NEEDS_CLARIFICATION":
                clarification += 1
                points = 0.25
            else:  # NOT_FOUND or NOT_APPLICABLE
                not_found += 1
                points = 0.0

            if m.importance == "MANDATORY":
                mand_points += points
                mand_max += 1.0
            elif m.importance == "PREFERRED":
                pref_points += points
                pref_max += 1.0
            else:  # UNCERTAIN
                # Treat uncertain as half-weight mandatory for coverage safety
                mand_points += points * 0.5
                mand_max += 0.5

        mand_coverage = round((mand_points / mand_max * 100.0), 1) if mand_max > 0 else 100.0
        pref_coverage = round((pref_points / pref_max * 100.0), 1) if pref_max > 0 else 100.0

        # Weighted estimate: 75% mandatory, 25% preferred (or 100% mandatory if no preferred)
        if pref_max > 0 and mand_max > 0:
            overall_estimate = round(mand_coverage * 0.75 + pref_coverage * 0.25, 1)
        elif mand_max > 0:
            overall_estimate = mand_coverage
        elif pref_max > 0:
            overall_estimate = pref_coverage
        else:
            overall_estimate = 100.0

        breakdown = JobMatchBreakdown(
            mandatoryCoverage=mand_coverage,
            preferredCoverage=pref_coverage,
            totalRequirements=total,
            supportedCount=supported,
            partiallySupportedCount=partially,
            needsClarificationCount=clarification,
            notFoundCount=not_found
        )

        return breakdown, overall_estimate


profile_matching_engine = ProfileMatchingEngine()
