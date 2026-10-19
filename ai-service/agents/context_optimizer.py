"""
Context Optimization Engine — AI Service
Applier 2.0 — Phase 21: Large Application and Context Optimization

Implements the 5-level hierarchy:
Application -> Page -> Section -> Field group -> Field

Core Principles:
1. Never send the entire application DOM or full context to the LLM unnecessarily.
2. Only provide the AI with:
   - Current relevant section
   - Relevant applicant data (subgraph)
   - Relevant evidence (filtered documents)
   - Previous decisions (compact summary of prior resolved fields)
3. Cache semantic page analysis, field mappings, and website knowledge.
4. Invalidate cache when page fingerprint changes.
5. Scale to 50, 100, 200+ fields.
"""

import hashlib
import json
import re
import time
from typing import Dict, Any, List, Optional, Tuple


class ContextOptimizationCache:
    """Multi-tiered in-memory cache for page analysis, field mappings, and website knowledge."""

    def __init__(self, max_entries: int = 500, ttl_seconds: int = 1800):
        self.max_entries = max_entries
        self.ttl_seconds = ttl_seconds
        self.page_analysis_store: Dict[str, Dict[str, Any]] = {}
        self.field_mapping_store: Dict[str, Dict[str, Any]] = {}
        self.website_knowledge_store: Dict[str, Dict[str, Any]] = {}
        self.active_fingerprints: Dict[str, str] = {}

    @staticmethod
    def compute_page_fingerprint(page_structure: Any) -> str:
        raw = json.dumps(page_structure, sort_keys=True) if not isinstance(page_structure, str) else page_structure
        return "pfp_" + hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]

    @staticmethod
    def compute_section_fingerprint(section_name: str, fields: List[Dict[str, Any]]) -> str:
        field_sigs = [f"{f.get('name')}:{f.get('type', 'text')}:{f.get('label', '')}" for f in fields]
        raw = f"{section_name}|{';'.join(field_sigs)}"
        return "sfp_" + hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]

    def check_and_invalidate_on_drift(self, page_key: str, current_fingerprint: str) -> Tuple[bool, Optional[str]]:
        previous = self.active_fingerprints.get(page_key)
        if not previous:
            self.active_fingerprints[page_key] = current_fingerprint
            return False, None

        if previous != current_fingerprint:
            self.invalidate_page(previous)
            self.active_fingerprints[page_key] = current_fingerprint
            return True, previous

        return False, previous

    def get_page_analysis(self, page_fingerprint: str) -> Optional[Dict[str, Any]]:
        entry = self.page_analysis_store.get(page_fingerprint)
        if not entry:
            return None
        if time.time() - entry["timestamp"] > self.ttl_seconds:
            del self.page_analysis_store[page_fingerprint]
            return None
        return entry["data"]

    def set_page_analysis(self, page_fingerprint: str, data: Dict[str, Any]):
        self.page_analysis_store[page_fingerprint] = {
            "data": data,
            "timestamp": time.time()
        }

    def get_field_mappings(self, section_fingerprint: str) -> Optional[List[Dict[str, Any]]]:
        entry = self.field_mapping_store.get(section_fingerprint)
        if not entry:
            return None
        if time.time() - entry["timestamp"] > self.ttl_seconds:
            del self.field_mapping_store[section_fingerprint]
            return None
        return entry["mappings"]

    def set_field_mappings(self, section_fingerprint: str, mappings: List[Dict[str, Any]]):
        self.field_mapping_store[section_fingerprint] = {
            "mappings": mappings,
            "timestamp": time.time()
        }

    def invalidate_page(self, page_fingerprint: str):
        if page_fingerprint in self.page_analysis_store:
            del self.page_analysis_store[page_fingerprint]

    def clear(self):
        self.page_analysis_store.clear()
        self.field_mapping_store.clear()
        self.website_knowledge_store.clear()
        self.active_fingerprints.clear()


class ContextOptimizer:
    """Optimizes context for applications containing 50, 100, 200+ fields."""

    def __init__(self, cache: Optional[ContextOptimizationCache] = None):
        self.cache = cache or ContextOptimizationCache()

    def build_hierarchy(
        self,
        application_id: str,
        portal_domain: str,
        raw_fields: List[Dict[str, Any]],
        page_fingerprint: Optional[str] = None
    ) -> Dict[str, Any]:
        pfp = page_fingerprint or ContextOptimizationCache.compute_page_fingerprint(raw_fields)
        clusters = self._cluster_fields(raw_fields)

        sections = []
        for s_idx, (cat, cluster) in enumerate(clusters.items()):
            if not cluster["fields"]:
                continue
            section_id = f"sec_{cat.lower()}_{s_idx + 1}"
            field_groups = self._group_fields(cluster["fields"])
            sfp = ContextOptimizationCache.compute_section_fingerprint(cluster["name"], cluster["fields"])

            sections.append({
                "sectionId": section_id,
                "sectionName": cluster["name"],
                "sectionPurpose": cluster["purpose"],
                "sectionFingerprint": sfp,
                "status": "PENDING",
                "fieldGroups": field_groups
            })

        return {
            "schemaVersion": "2.0.0",
            "applicationId": application_id,
            "portalDomain": portal_domain,
            "totalFieldCount": len(raw_fields),
            "pages": [{
                "pageId": "page_1",
                "pageNumber": 1,
                "pageType": "APPLICATION_FORM",
                "pageFingerprint": pfp,
                "sections": sections
            }],
            "activeSectionId": sections[0]["sectionId"] if sections else None,
            "optimizedContextMetrics": None
        }

    def get_section_context(
        self,
        hierarchy: Dict[str, Any],
        section_id: str,
        applicant_graph: Dict[str, Any],
        document_vault: List[Dict[str, Any]],
        previous_decisions: Dict[str, Any]
    ) -> Dict[str, Any]:
        target_section = None
        for page in hierarchy.get("pages", []):
            for sec in page.get("sections", []):
                if sec["sectionId"] == section_id:
                    target_section = sec
                    break

        if not target_section and hierarchy.get("pages", []) and hierarchy["pages"][0].get("sections", []):
            target_section = hierarchy["pages"][0]["sections"][0]

        section_fields = [f for g in target_section.get("fieldGroups", []) for f in g.get("fields", [])]
        semantic_targets = [f.get("semanticTarget") or f.get("name") for f in section_fields if f.get("name")]

        relevant_applicant_data = self._filter_subgraph(applicant_graph, target_section["sectionName"], semantic_targets)
        relevant_evidence = self._filter_evidence(document_vault, target_section["sectionName"])
        compact_previous = {k: str(v) for k, v in previous_decisions.items() if v is not None}

        monolithic_tokens = self._estimate_tokens({
            "hierarchy": hierarchy,
            "graph": applicant_graph,
            "vault": document_vault,
            "decisions": previous_decisions
        })

        optimized_tokens = self._estimate_tokens({
            "section": target_section,
            "graph": relevant_applicant_data,
            "evidence": relevant_evidence,
            "decisions": compact_previous
        })

        savings_ratio = round((monolithic_tokens - optimized_tokens) / monolithic_tokens, 3) if monolithic_tokens > 0 else 0.0

        return {
            "currentRelevantSection": target_section,
            "relevantApplicantData": relevant_applicant_data,
            "relevantEvidence": relevant_evidence,
            "previousDecisions": compact_previous,
            "metrics": {
                "monolithicTokenEstimate": monolithic_tokens,
                "optimizedSectionTokens": optimized_tokens,
                "tokenSavingsRatio": savings_ratio,
                "sectionFieldCount": len(section_fields),
                "totalApplicationFields": hierarchy.get("totalFieldCount", len(section_fields))
            }
        }

    def _cluster_fields(self, fields: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        clusters = {
            "PERSONAL": {"name": "Personal Information", "purpose": "Identity and demographics", "fields": []},
            "CONTACT": {"name": "Contact Coordinates", "purpose": "Address and communication", "fields": []},
            "EDUCATION": {"name": "Academic Records", "purpose": "Degrees, colleges, CGPA", "fields": []},
            "EXPERIENCE": {"name": "Work Experience", "purpose": "Employment history and employers", "fields": []},
            "DOCUMENTS": {"name": "Document Attachments", "purpose": "Upload files and resumes", "fields": []},
            "DECLARATIONS": {"name": "Declarations & Disclosures", "purpose": "Legal consent and authorization", "fields": []}
        }

        for f in fields:
            text = f"{f.get('name', '')} {f.get('label', '')} {f.get('id', '')}".lower()
            ftype = (f.get("type") or "text").lower()

            if ftype == "file" or any(w in text for w in ["resume", "cv", "transcript", "upload"]):
                clusters["DOCUMENTS"]["fields"].append(f)
            elif any(w in text for w in ["education", "college", "degree", "cgpa", "gpa", "university"]):
                clusters["EDUCATION"]["fields"].append(f)
            elif any(w in text for w in ["experience", "employer", "company", "salary", "job", "work"]):
                clusters["EXPERIENCE"]["fields"].append(f)
            elif any(w in text for w in ["email", "phone", "address", "city", "state", "zip", "mobile"]):
                clusters["CONTACT"]["fields"].append(f)
            elif any(w in text for w in ["declaration", "consent", "authorized", "agree", "signature"]):
                clusters["DECLARATIONS"]["fields"].append(f)
            else:
                clusters["PERSONAL"]["fields"].append(f)

        return clusters

    def _group_fields(self, fields: List[Dict[str, Any]], group_size: int = 4) -> List[Dict[str, Any]]:
        groups = []
        for i in range(0, len(fields), group_size):
            slice_ = fields[i : i + group_size]
            grp_num = (i // group_size) + 1
            groups.append({
                "groupId": f"grp_{grp_num}",
                "groupName": f"Field Group {grp_num}",
                "fields": [{
                    "fieldId": f.get("fieldId") or f.get("name", f"fld_{i}"),
                    "name": f.get("name", f"fld_{i}"),
                    "type": f.get("type", "text"),
                    "label": f.get("label", ""),
                    "selector": f.get("selector", f"#{f.get('name', '')}"),
                    "semanticTarget": f.get("semanticTarget") or f"applicant.{f.get('name', '')}",
                    "required": bool(f.get("required", False)),
                    "value": f.get("value")
                } for f in slice_]
            })
        return groups

    def _filter_subgraph(self, graph: Dict[str, Any], section_name: str, targets: List[str]) -> Dict[str, Any]:
        subgraph = {}
        s_lower = section_name.lower()
        for k, v in graph.items():
            k_lower = k.lower()
            if any(t.lower() in k_lower or k_lower in t.lower() for t in targets if t):
                subgraph[k] = v
            elif "personal" in s_lower and any(w in k_lower for w in ["applicant", "name", "dob", "gender"]):
                subgraph[k] = v
            elif "contact" in s_lower and any(w in k_lower for w in ["contact", "email", "phone", "address"]):
                subgraph[k] = v
            elif ("academic" in s_lower or "education" in s_lower) and any(w in k_lower for w in ["education", "degree", "college"]):
                subgraph[k] = v
            elif "experience" in s_lower and any(w in k_lower for w in ["experience", "employment", "company"]):
                subgraph[k] = v
            elif "document" in s_lower and any(w in k_lower for w in ["document", "resume"]):
                subgraph[k] = v
        return subgraph

    def _filter_evidence(self, vault: List[Dict[str, Any]], section_name: str) -> List[Dict[str, Any]]:
        s_lower = section_name.lower()
        filtered = []
        for doc in vault:
            dtype = (doc.get("type") or "").lower()
            fn = (doc.get("filename") or "").lower()
            if "document" in s_lower:
                filtered.append(doc)
            elif "education" in s_lower and any(w in dtype or w in fn for w in ["transcript", "degree"]):
                filtered.append(doc)
            elif "experience" in s_lower and any(w in dtype or w in fn for w in ["resume", "experience"]):
                filtered.append(doc)
            elif "personal" in s_lower and any(w in dtype or w in fn for w in ["id", "aadhaar", "passport"]):
                filtered.append(doc)
        return filtered

    def _estimate_tokens(self, data: Any) -> int:
        raw = json.dumps(data) if not isinstance(data, str) else data
        return max(1, len(raw) // 4)
