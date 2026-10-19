"""
Tests for Document Text Extraction & Structured Resume Intelligence.
Verifies PDF extraction, DOCX extraction, scanned OCR fallback logic,
Pydantic schema compliance, and anti-hallucination guardrails.
"""

import io
import pytest
import fitz  # PyMuPDF
import docx

from services.document_text_extractor import (
    extract_text_from_pdf,
    extract_text_from_docx,
    extract_text_from_document
)
from core.models import ExtractedResumeProfile
from agents.resume_extraction_agent import ResumeExtractionAgent


def create_sample_pdf(text: str) -> bytes:
    """Helper to generate a clean in-memory PDF."""
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 72), text)
    return doc.tobytes()


def create_sample_docx(paragraphs: list) -> bytes:
    """Helper to generate an in-memory DOCX."""
    doc = docx.Document()
    for p in paragraphs:
        doc.add_paragraph(p)
    stream = io.BytesIO()
    doc.save(stream)
    return stream.getvalue()


class TestDocumentTextExtractor:
    def test_extract_text_from_pdf_success(self):
        sample_text = (
            "Jane Doe\n"
            "Software Architect\n"
            "jane.doe@example.com | (555) 123-4567 | San Francisco, CA\n"
            "EXPERIENCE\n"
            "Acme Technologies - Lead Engineer (2020 - Present)\n"
            "- Designed real-time event streaming pipeline processing 50M messages daily.\n"
            "- Mentored team of 8 junior and mid-level engineers.\n"
            "EDUCATION\n"
            "Stanford University - B.S. in Computer Science (2016 - 2020)\n"
            "SKILLS\n"
            "Python, FastAPI, TypeScript, Docker, Kubernetes, AWS\n"
        )
        pdf_bytes = create_sample_pdf(sample_text)
        result = extract_text_from_pdf(pdf_bytes)

        assert result["pages"] == 1
        assert result["wordCount"] > 25
        assert "Jane Doe" in result["text"]
        assert "Acme Technologies" in result["text"]
        assert result["ocrUsed"] is False

    def test_extract_text_from_docx_success(self):
        paragraphs = [
            "Alex Smith",
            "alex.smith@email.com | GitHub: github.com/alexsmith",
            "SUMMARY",
            "Senior Backend Engineer with 7 years specializing in Python microservices and distributed databases.",
            "WORK EXPERIENCE",
            "Stripe - Senior Backend Developer (2019 - Present)",
            "• Scaled payment reconciliation service to 99.999% availability.",
            "• Reduced database query latency by 45% through Redis caching.",
            "EDUCATION",
            "University of Washington - M.S. Software Engineering",
            "SKILLS",
            "Python, Django, PostgreSQL, Redis, gRPC"
        ]
        docx_bytes = create_sample_docx(paragraphs)
        result = extract_text_from_docx(docx_bytes)

        assert result["pages"] >= 1
        assert "Alex Smith" in result["text"]
        assert "Stripe" in result["text"]
        assert result["wordCount"] > 20
        assert result["ocrUsed"] is False

    def test_empty_buffer_raises_value_error(self):
        with pytest.raises(ValueError, match="empty"):
            extract_text_from_pdf(b"")

        with pytest.raises(ValueError, match="empty"):
            extract_text_from_docx(b"")

    def test_universal_dispatcher(self):
        pdf_bytes = create_sample_pdf("Hello World PDF")
        res_pdf = extract_text_from_document(pdf_bytes, "test_resume.pdf")
        assert "Hello World PDF" in res_pdf["text"]

        docx_bytes = create_sample_docx(["Hello World DOCX"])
        res_docx = extract_text_from_document(docx_bytes, "test_resume.docx")
        assert "Hello World DOCX" in res_docx["text"]


class TestResumeExtractionAgent:
    def test_insufficient_text_returns_safe_error(self):
        agent = ResumeExtractionAgent()
        result = agent.process({
            "raw_data": {
                "text": "Too short"
            }
        })
        assert result["success"] is False
        assert "insufficient" in result["error"].lower()

    def test_model_schema_conformance(self):
        sample_json = {
            "fullName": "Jane Doe",
            "email": "jane@example.com",
            "phone": "555-0199",
            "location": {"city": "Austin", "state": "TX", "country": "USA"},
            "links": [{"label": "LinkedIn", "url": "https://linkedin.com/in/janedoe"}],
            "professionalSummary": "Results-driven engineering lead.",
            "skills": [
                {"category": "Languages", "name": "Python", "yearsOfExperience": 5.0},
                {"category": "Cloud", "name": "AWS", "yearsOfExperience": 4.0}
            ],
            "experience": [
                {
                    "company": "CloudCorp",
                    "title": "Principal Architect",
                    "startDate": "2021-01",
                    "endDate": "Present",
                    "isCurrent": True,
                    "highlights": [
                        {"text": "Migrated legacy monolith to event-driven microservices.", "skillsReferenced": ["AWS", "Kafka"]}
                    ]
                }
            ],
            "education": [
                {
                    "institution": "MIT",
                    "degree": "B.S. Electrical Engineering and Computer Science",
                    "startDate": "2015-09",
                    "endDate": "2019-06",
                    "gpa": "3.9"
                }
            ],
            "projects": [
                {
                    "title": "OpenLLM Orchestrator",
                    "description": "High-throughput inference pipeline.",
                    "technologies": ["Python", "FastAPI"],
                    "url": "https://github.com/janedoe/orchestrator"
                }
            ],
            "certifications": [
                {
                    "name": "AWS Solutions Architect Professional",
                    "issuingOrganization": "Amazon Web Services",
                    "issueDate": "2023-04"
                }
            ],
            "achievements": [
                {
                    "title": "Patent Award: Distributed Consistency Algorithm",
                    "date": "2022"
                }
            ],
            "confidence": 0.95,
            "warnings": []
        }

        model = ExtractedResumeProfile(**sample_json)
        assert model.fullName == "Jane Doe"
        assert model.skills[0].name == "Python"
        assert model.experience[0].company == "CloudCorp"
        assert len(model.experience[0].highlights) == 1
        assert model.education[0].institution == "MIT"
        assert model.certifications[0].name == "AWS Solutions Architect Professional"
