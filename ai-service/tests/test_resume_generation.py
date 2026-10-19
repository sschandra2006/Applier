"""
Automated Pytest Suite for Applier 3.0 Resume Generation Engine
Tests:
- LaTeX special character escaping and template registry
- Safe sandboxed PDF compilation and PyMuPDF vector fallback
- Multi-layer ground-truth validation (contact, dates, skills, metrics, PDF text stream)
- Anti-hallucination barriers & metric preservation
- End-to-end resume tailoring agent differential test (Job A vs Job B)
- Full orchestrator intent execution
"""

import pytest
import base64
import fitz

from core.models import (
    TailoredResumeContent,
    TailoredBullet,
    TailoredExperienceItem,
    TailoredEducationItem,
    TailoredProjectItem,
    TailoredSkillGroup,
    ProvenanceReference
)
from services.latex_template_registry import latex_template_registry, escape_latex, escape_latex_url
from services.pdf_compiler import safe_pdf_compiler
from services.resume_validator import resume_validator
from agents.resume_tailoring_agent import resume_tailoring_agent
from core.orchestrator import AIOrchestrator


@pytest.fixture
def sample_verified_profile():
    return {
        "version": 2,
        "isVerified": True,
        "personalInfo": {
            "fullName": "Jane Doe",
            "email": "jane.doe@example.com",
            "phone": "+1 (555) 234-5678",
            "location": {"city": "San Francisco", "state": "CA", "country": "USA"},
            "links": [
                {"label": "GitHub", "url": "https://github.com/janedoe"},
                {"label": "LinkedIn", "url": "https://linkedin.com/in/janedoe"}
            ]
        },
        "professionalSummary": {
            "text": "Senior Staff Engineer with 8+ years designing scalable distributed systems and high-throughput microservices."
        },
        "skills": [
            {"name": "Python", "category": "Languages"},
            {"name": "Go", "category": "Languages"},
            {"name": "Kubernetes", "category": "Cloud & Infrastructure"},
            {"name": "Docker", "category": "Cloud & Infrastructure"},
            {"name": "PostgreSQL", "category": "Databases"},
            {"name": "Kafka", "category": "Databases & Streaming"},
            {"name": "React", "category": "Frameworks"}
        ],
        "experience": [
            {
                "id": "exp_1",
                "company": "CloudScale Systems",
                "title": "Lead Distributed Systems Engineer",
                "location": "San Francisco, CA",
                "startDate": "2021-03",
                "endDate": "Present",
                "isCurrent": True,
                "highlights": [
                    {
                        "text": "Architected event-driven ingestion pipeline in Go and Kafka handling 50,000 req/s with 99.99% availability.",
                        "skillsReferenced": ["Go", "Kafka"]
                    },
                    {
                        "text": "Reduced p99 database query latency by 45% through indexing optimizations and Redis caching.",
                        "skillsReferenced": ["PostgreSQL"]
                    }
                ]
            },
            {
                "id": "exp_2",
                "company": "Nexus Web Solutions",
                "title": "Software Engineer",
                "location": "San Jose, CA",
                "startDate": "2018-06",
                "endDate": "2021-02",
                "isCurrent": False,
                "highlights": [
                    {
                        "text": "Developed customer analytics dashboard with React and Python FastAPI, serving 10,000 daily active users.",
                        "skillsReferenced": ["React", "Python"]
                    }
                ]
            }
        ],
        "education": [
            {
                "id": "edu_1",
                "institution": "University of California, Berkeley",
                "degree": "B.S.",
                "fieldOfStudy": "Computer Science",
                "startDate": "2014-08",
                "endDate": "2018-05",
                "gpa": "3.85"
            }
        ],
        "projects": [
            {
                "id": "proj_1",
                "title": "Distributed Task Scheduler",
                "description": "High-throughput task queue in Go and Redis with raft consensus.",
                "technologies": ["Go", "Redis", "Docker"],
                "highlights": [
                    {"text": "Benchmarked at 100k tasks per second with zero message loss."}
                ]
            }
        ],
        "certifications": [
            {
                "name": "AWS Certified Solutions Architect - Professional",
                "issuingOrganization": "Amazon Web Services",
                "issueDate": "2023-04"
            }
        ]
    }


def test_escape_latex():
    raw = "Special & chars: 50% discount in $USD #1 item_name {key} ~5 years ^2 <bold> & \\backslash"
    escaped = escape_latex(raw)
    assert r"\&" in escaped
    assert r"\%" in escaped
    assert r"\$" in escaped
    assert r"\#" in escaped
    assert r"\_" in escaped
    assert r"\{" in escaped
    assert r"\}" in escaped
    assert r"\textbackslash{}" in escaped
    assert r"\textasciitilde{}" in escaped
    assert r"\textasciicircum{}" in escaped


def test_latex_template_registry_renders_all_templates(sample_verified_profile):
    content = TailoredResumeContent(
        fullName="Jane Doe",
        email="jane.doe@example.com",
        phone="+1 555-234-5678",
        professionalSummary="Experienced engineer.",
        skillsByCategory=[
            TailoredSkillGroup(category="Languages", skills=["Go", "Python"]),
            TailoredSkillGroup(category="Cloud", skills=["Kubernetes", "Docker"])
        ],
        experience=[
            TailoredExperienceItem(
                id="exp_1",
                company="CloudScale Systems",
                title="Lead Engineer",
                startDate="2021-03",
                endDate="Present",
                highlights=[
                    TailoredBullet(text="Built pipeline handling 50k req/s.")
                ]
            )
        ],
        education=[
            TailoredEducationItem(
                id="edu_1",
                institution="UC Berkeley",
                degree="B.S.",
                fieldOfStudy="Computer Science",
                startDate="2014-08",
                endDate="2018-05"
            )
        ],
        projects=[
            TailoredProjectItem(
                id="proj_1",
                title="Task Scheduler",
                technologies=["Go", "Redis"],
                highlights=[
                    TailoredBullet(text="Benchmarked at 100k tasks/s.")
                ]
            )
        ],
        certifications=[{"name": "AWS Solutions Architect", "issuingOrganization": "AWS"}],
        matchedKeywords=["Go", "Kubernetes"]
    )

    for template_id in ["ATS_SINGLE_COLUMN", "TECHNICAL", "MODERN_PROFESSIONAL"]:
        latex = latex_template_registry.render(template_id, content)
        assert r"\documentclass" in latex
        assert "Jane Doe" in latex
        assert "jane.doe@example.com" in latex
        assert "CloudScale Systems" in latex
        assert r"\end{document}" in latex


def test_safe_pdf_compiler_produces_valid_vector_pdf(sample_verified_profile):
    content = TailoredResumeContent(
        fullName="Jane Doe",
        email="jane.doe@example.com",
        phone="+1 555-234-5678",
        professionalSummary="Senior Staff Engineer specializing in high-throughput distributed systems.",
        skillsByCategory=[
            TailoredSkillGroup(category="Languages", skills=["Go", "Python"]),
            TailoredSkillGroup(category="Cloud", skills=["Kubernetes", "Docker", "Kafka"])
        ],
        experience=[
            TailoredExperienceItem(
                id="exp_1",
                company="CloudScale Systems",
                title="Lead Engineer",
                startDate="2021-03",
                endDate="Present",
                highlights=[
                    TailoredBullet(text="Architected event-driven ingestion pipeline in Go and Kafka handling 50,000 req/s with 99.99% availability.")
                ]
            )
        ],
        education=[
            TailoredEducationItem(
                id="edu_1",
                institution="UC Berkeley",
                degree="B.S.",
                fieldOfStudy="Computer Science"
            )
        ],
        projects=[],
        certifications=[]
    )

    latex_src = latex_template_registry.render("ATS_SINGLE_COLUMN", content)
    pdf_bytes, page_count, method = safe_pdf_compiler.compile(latex_src, content, "ATS_SINGLE_COLUMN")

    assert len(pdf_bytes) > 1000
    assert page_count >= 1
    assert "PDF" in method or "LATEX" in method

    # Verify extractable text stream using PyMuPDF
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    text = "".join(page.get_text() for page in doc)
    doc.close()

    assert "Jane Doe" in text
    assert "jane.doe@example.com" in text
    assert "CloudScale Systems" in text
    assert "50,000 req/s" in text


def test_resume_validator_detects_violations(sample_verified_profile):
    # 1. Test Valid Content Passes
    valid_content = TailoredResumeContent(
        fullName="Jane Doe",
        email="jane.doe@example.com",
        phone="+1 (555) 234-5678",
        professionalSummary=sample_verified_profile["professionalSummary"]["text"],
        skillsByCategory=[
            TailoredSkillGroup(category="Languages", skills=["Python", "Go"]),
            TailoredSkillGroup(category="Cloud", skills=["Kubernetes", "Docker"])
        ],
        experience=[
            TailoredExperienceItem(
                id="exp_1",
                company="CloudScale Systems",
                title="Lead Distributed Systems Engineer",
                startDate="2021-03",
                endDate="Present",
                highlights=[
                    TailoredBullet(text="Architected event-driven ingestion pipeline in Go and Kafka handling 50,000 req/s with 99.99% availability.")
                ]
            )
        ],
        education=[
            TailoredEducationItem(
                id="edu_1",
                institution="University of California, Berkeley",
                degree="B.S.",
                fieldOfStudy="Computer Science",
                startDate="2014-08",
                endDate="2018-05"
            )
        ],
        projects=[
            TailoredProjectItem(
                id="proj_1",
                title="Distributed Task Scheduler",
                technologies=["Go", "Redis", "Docker"],
                highlights=[
                    TailoredBullet(text="Benchmarked at 100k tasks per second with zero message loss.")
                ]
            )
        ]
    )

    report_valid = resume_validator.validate(valid_content, sample_verified_profile)
    assert report_valid.isValid is True
    assert len(report_valid.violations) == 0

    # 2. Test Hallucinated Skill Detection
    hallucinated_skill_content = valid_content.model_copy(deep=True)
    hallucinated_skill_content.skillsByCategory.append(
        TailoredSkillGroup(category="AI", skills=["PyTorch", "TensorFlow"])
    )
    report_skill = resume_validator.validate(hallucinated_skill_content, sample_verified_profile)
    assert report_skill.isValid is False
    assert report_skill.skillsVerified is False
    assert any("Hallucinated skill detected" in v for v in report_skill.violations)

    # 3. Test Date Mismatch Detection
    tampered_date_content = valid_content.model_copy(deep=True)
    tampered_date_content.experience[0].startDate = "2015-01"
    report_dates = resume_validator.validate(tampered_date_content, sample_verified_profile)
    assert report_dates.isValid is False
    assert report_dates.datesVerified is False
    assert any("date mismatch" in v for v in report_dates.violations)

    # 4. Test Metric Inflation Detection (e.g. inventing 95% instead of 45%)
    inflated_metric_content = valid_content.model_copy(deep=True)
    inflated_metric_content.experience[0].highlights.append(
        TailoredBullet(text="Reduced operational overhead by 95% across all microservices.")
    )
    report_metric = resume_validator.validate(inflated_metric_content, sample_verified_profile)
    assert report_metric.isValid is False
    assert report_metric.metricsPreserved is False
    assert any("Invented or inflated metric" in v for v in report_metric.violations)


def test_resume_tailoring_agent_differential_jobs(sample_verified_profile):
    """
    Verifies that tailoring for Job A (Go/Distributed Systems) vs Job B (React/Frontend)
    selects differential keywords and emphasizes different skills and experiences,
    all strictly grounded in verified facts.
    """
    # Target Job A: Go Distributed Systems Lead
    job_a_desc = """
    We are looking for a Senior Staff Distributed Systems Engineer to scale our Go and Kafka infrastructure.
    Requirements:
    - Deep expertise in Go, Kubernetes, Kafka, and event-driven architecture.
    - Experience handling high-throughput pipelines (> 10k req/s).
    - Strong database optimization skills (PostgreSQL).
    """

    res_a = resume_tailoring_agent.generate_tailored_resume(
        profile=sample_verified_profile,
        job_title="Senior Staff Distributed Systems Engineer",
        company="StreamCloud Inc",
        job_description=job_a_desc,
        template_id="ATS_SINGLE_COLUMN"
    )

    assert res_a.success is True
    assert "Go" in res_a.matchedKeywords or "Kafka" in res_a.matchedKeywords
    assert res_a.validationReport.isValid is True
    assert res_a.pdfBase64 is not None

    # Target Job B: Frontend Web Engineer
    job_b_desc = """
    We are seeking a Full-Stack / Frontend Engineer to build web user dashboards.
    Requirements:
    - Proficiency in React and modern JavaScript/TypeScript.
    - Backend integration with Python and FastAPI.
    - Experience serving high DAU analytics dashboards.
    """

    res_b = resume_tailoring_agent.generate_tailored_resume(
        profile=sample_verified_profile,
        job_title="Frontend Engineer",
        company="DesignDash",
        job_description=job_b_desc,
        template_id="MODERN_PROFESSIONAL"
    )

    assert res_b.success is True
    assert "React" in res_b.matchedKeywords or "Python" in res_b.matchedKeywords
    assert res_b.validationReport.isValid is True


def test_resume_tailoring_with_confirmed_gaps(sample_verified_profile):
    """
    Verifies that skills explicitly confirmed by the user in a missing info session
    are legitimately incorporated into the resume without triggering hallucination alarms.
    """
    user_confirmed = {
        "Docker Swarm": {
            "skillName": "Docker Swarm",
            "status": "ANSWERED",
            "userResponse": {"level": "experienced", "details": "Used in staging deployment"}
        }
    }

    job_desc = "Seeking engineer with Docker Swarm and Go expertise."

    res = resume_tailoring_agent.generate_tailored_resume(
        profile=sample_verified_profile,
        job_title="DevOps Engineer",
        company="ScaleCo",
        job_description=job_desc,
        template_id="TECHNICAL",
        user_confirmed_gaps=user_confirmed
    )

    assert res.success is True
    assert res.validationReport.isValid is True
    # Verify that Docker Swarm appears in skills
    all_skills = [
        s for g in res.resumeContent.skillsByCategory for s in g.skills
    ]
    assert "Docker Swarm" in all_skills


def test_orchestrator_generate_tailored_resume_intent(sample_verified_profile):
    """Verifies that AIOrchestrator routes 'generate_tailored_resume' appropriately."""
    orch = AIOrchestrator()
    payload = {
        "intent": "generate_tailored_resume",
        "raw_data": {
            "profile": sample_verified_profile,
            "jobTitle": "Backend Systems Architect",
            "company": "FastTech",
            "jobDescription": "Experience in Go, PostgreSQL, and Kubernetes required.",
            "templateId": "ATS_SINGLE_COLUMN"
        }
    }

    resp = orch.execute(payload)
    assert resp["success"] is True
    agent_resp = resp["data"]
    assert agent_resp["action"] == "resume_tailored"
    data = agent_resp["data"]
    assert data["success"] is True
    assert data["pdfBase64"] is not None
    assert len(data["pdfBase64"]) > 500
    assert data["validationReport"]["isValid"] is True
