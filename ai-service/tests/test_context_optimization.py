"""
Context Optimization Test Suite — AI Service
Applier 2.0 — Phase 21: Large Application and Context Optimization

Verifies:
1. 5-level hierarchy generation: Application -> Page -> Section -> Field group -> Field
2. Context slicing: section, relevant applicant data, relevant evidence, previous decisions
3. Token usage reduction across 50, 100, and 200 fields
4. Multi-tiered caching and fingerprint invalidation
"""

import pytest
from agents.context_optimizer import ContextOptimizer, ContextOptimizationCache


def generate_fields(count: int):
    categories = ["personal", "contact", "education", "experience", "documents", "declarations"]
    fields = []
    for i in range(count):
        cat = categories[i % len(categories)]
        name = f"{cat}_field_{i + 1}"
        ftype = "file" if cat == "documents" else ("email" if "email" in name else "text")
        fields.append({
            "fieldId": f"fld_{i + 1}",
            "name": name,
            "type": ftype,
            "label": f"Field Label {i + 1} ({cat})",
            "required": (i % 2 == 0)
        })
    return fields


def generate_applicant_graph(fields):
    return {f["name"]: f"Verified Value for {f['name']}" for f in fields}


def test_hierarchy_structure_50_fields():
    optimizer = ContextOptimizer()
    fields = generate_fields(50)
    hierarchy = optimizer.build_hierarchy(
        application_id="app_test_50",
        portal_domain="careers.scale50.ai",
        raw_fields=fields
    )

    assert hierarchy["schemaVersion"] == "2.0.0"
    assert hierarchy["totalFieldCount"] == 50
    assert len(hierarchy["pages"]) == 1

    page = hierarchy["pages"][0]
    assert len(page["sections"]) >= 4

    # Verify each section has field groups and fields
    for sec in page["sections"]:
        assert sec["sectionId"].startswith("sec_")
        assert len(sec["fieldGroups"]) >= 1
        for grp in sec["fieldGroups"]:
            assert len(grp["fields"]) >= 1


def test_section_context_slicing_token_reduction():
    optimizer = ContextOptimizer()
    fields = generate_fields(100)
    graph = generate_applicant_graph(fields)
    vault = [{"type": "RESUME", "filename": "alex_cv.pdf"}]
    decisions = {"personal_field_1": "John Doe"}

    hierarchy = optimizer.build_hierarchy("app_100", "jobs.100.org", fields)
    sec_id = hierarchy["pages"][0]["sections"][0]["sectionId"]

    context = optimizer.get_section_context(
        hierarchy=hierarchy,
        section_id=sec_id,
        applicant_graph=graph,
        document_vault=vault,
        previous_decisions=decisions
    )

    metrics = context["metrics"]
    assert metrics["monolithicTokenEstimate"] > metrics["optimizedSectionTokens"]
    assert metrics["tokenSavingsRatio"] >= 0.65  # >= 65% token savings per section


def test_200_fields_subgraph_isolation():
    optimizer = ContextOptimizer()
    fields = generate_fields(200)
    graph = generate_applicant_graph(fields)
    vault = [{"type": "RESUME", "filename": "resume.pdf"}]

    hierarchy = optimizer.build_hierarchy("app_200", "gov.mega200.gov", fields)

    # Pick education section
    edu_sec = next((s for s in hierarchy["pages"][0]["sections"] if "education" in s["sectionId"].lower()), None)
    if not edu_sec:
        edu_sec = hierarchy["pages"][0]["sections"][0]

    context = optimizer.get_section_context(
        hierarchy=hierarchy,
        section_id=edu_sec["sectionId"],
        applicant_graph=graph,
        document_vault=vault,
        previous_decisions={}
    )

    # Subgraph should isolate only relevant keys, NOT all 200 keys
    relevant_graph = context["relevantApplicantData"]
    assert len(relevant_graph) < len(graph)
    assert len(relevant_graph) <= 40  # Tight focus


def test_cache_hit_and_fingerprint_invalidation():
    cache = ContextOptimizationCache()
    optimizer = ContextOptimizer(cache=cache)
    fields_v1 = generate_fields(50)

    pfp_1 = "pfp_initial_v1"
    cache.check_and_invalidate_on_drift("portal.ai", pfp_1)
    h1 = optimizer.build_hierarchy("app_cache", "portal.ai", fields_v1, page_fingerprint=pfp_1)
    cache.set_page_analysis(pfp_1, h1)

    # Cache hit
    cached = cache.get_page_analysis(pfp_1)
    assert cached is not None
    assert cached["applicationId"] == "app_cache"

    # Fingerprint drift
    pfp_2 = "pfp_drifted_v2"
    drifted, prev = cache.check_and_invalidate_on_drift("portal.ai", pfp_2)
    assert drifted is True
    assert prev == pfp_1

    # Stale page analysis invalidated
    assert cache.get_page_analysis(pfp_1) is None
