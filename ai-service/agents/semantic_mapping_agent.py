"""
Semantic Field Mapping Agent — Applier 2.0
Phase 8: Semantic Field Mapping Engine

Maps:
WebsiteField -> ApplicantKnowledgeGraph -> DocumentEvidence
without depending on exact website field names.

Combines 10 matching signals:
- label
- role
- name
- placeholder
- autocomplete
- nearby text
- semantic context
- page context
- field type
- known portal knowledge

Strict Rule:
Never automatically fill AMBIGUOUS, CONFLICT, MISSING, REQUIRES_USER, or LOW_CONFIDENCE fields.
"""

import re
import uuid
import datetime
from typing import Dict, Any, List, Optional, Tuple
from core.models import (
    FieldMappingModel,
    SemanticFieldMappingSetModel,
    AlternativeMatchModel,
    ConflictDetailModel
)

# Canonical field target definitions with multi-signal keywords & patterns
SEMANTIC_TARGETS = {
    "applicant.fullName": {
        "graph_path": "identity.fullName",
        "label_patterns": [r"\b(full\s*name|applicant\s*name|candidate\s*name|student\s*name|legal\s*name|your\s*name|name\s*of\s*applicant|name\s*of\s*candidate)\b"],
        "name_patterns": [r"^(name|fullname|cand_name|appl_name|txt_name|applicant_name|student_name)$"],
        "autocompletes": ["name", "given-name"],
        "valid_types": ["text"],
        "portal_keywords": ["cand_name", "appl_name", "txt_cand_name", "applicantname"],
        "context_boosts": ["personal", "applicant", "identity", "basic"],
        "context_penalties": ["father", "mother", "guardian", "parent", "college", "institute"]
    },
    "applicant.firstName": {
        "graph_path": "identity.firstName",
        "label_patterns": [r"\b(first\s*name|given\s*name|fname)\b"],
        "name_patterns": [r"^(fname|firstname|first_name)$"],
        "autocompletes": ["given-name"],
        "valid_types": ["text"],
        "portal_keywords": ["f_name", "txt_fname"],
        "context_boosts": ["personal", "applicant"],
        "context_penalties": ["father", "mother"]
    },
    "applicant.lastName": {
        "graph_path": "identity.lastName",
        "label_patterns": [r"\b(last\s*name|surname|family\s*name|lname)\b"],
        "name_patterns": [r"^(lname|lastname|last_name|surname)$"],
        "autocompletes": ["family-name"],
        "valid_types": ["text"],
        "portal_keywords": ["l_name", "txt_lname"],
        "context_boosts": ["personal", "applicant"],
        "context_penalties": ["father", "mother"]
    },
    "applicant.dateOfBirth": {
        "graph_path": "identity.dateOfBirth",
        "label_patterns": [r"\b(date\s*of\s*birth|dob|birth\s*date|born\s*on)\b"],
        "name_patterns": [r"^(dob|dateofbirth|date_of_birth|birth_date|txt_dob)$"],
        "autocompletes": ["bday", "bday-day", "bday-month", "bday-year"],
        "valid_types": ["date", "text"],
        "portal_keywords": ["dob", "dob_d", "txt_dob", "birth_dt"],
        "context_boosts": ["personal", "identity"],
        "context_penalties": []
    },
    "applicant.gender": {
        "graph_path": "identity.gender",
        "label_patterns": [r"\b(gender|sex)\b"],
        "name_patterns": [r"^(gender|sex|cbo_gender|ddl_gender)$"],
        "autocompletes": ["sex"],
        "valid_types": ["select", "radio", "text"],
        "portal_keywords": ["gender", "gen", "cbo_gender"],
        "context_boosts": ["personal", "identity"],
        "context_penalties": []
    },
    "applicant.email": {
        "graph_path": "contact.email",
        "label_patterns": [r"\b(email|e-mail|email\s*address|mail\s*id|e-mail\s*id)\b"],
        "name_patterns": [r"^(email|email_id|emailaddress|mail|user_email|txt_email)$"],
        "autocompletes": ["email"],
        "valid_types": ["email", "text"],
        "portal_keywords": ["mail_id", "email_id", "txt_email"],
        "context_boosts": ["contact", "communication", "personal"],
        "context_penalties": []
    },
    "applicant.phone": {
        "graph_path": "contact.phone",
        "label_patterns": [r"\b(mobile|phone|contact\s*no|mobile\s*number|phone\s*number|cell\s*no)\b"],
        "name_patterns": [r"^(mobile|phone|contact|mob_no|mobile_no|txt_mob|phone_number)$"],
        "autocompletes": ["tel", "tel-national"],
        "valid_types": ["tel", "text", "number"],
        "portal_keywords": ["mob_no", "cell_no", "txt_mob", "cont_no"],
        "context_boosts": ["contact", "communication", "personal"],
        "context_penalties": ["alternate", "secondary", "father", "mother"]
    },
    "applicant.alternatePhone": {
        "graph_path": "contact.alternatePhone",
        "label_patterns": [r"\b(alternate\s*mobile|alternate\s*phone|secondary\s*mobile|alternative\s*contact)\b"],
        "name_patterns": [r"^(alt_mobile|alternate_phone|alt_phone|sec_mobile)$"],
        "autocompletes": ["tel"],
        "valid_types": ["tel", "text", "number"],
        "portal_keywords": ["alt_mob", "alt_phone"],
        "context_boosts": ["contact", "alternate", "secondary"],
        "context_penalties": []
    },
    "applicant.address": {
        "graph_path": "address.street",
        "label_patterns": [r"\b(address|street\s*address|residential\s*address|permanent\s*address|correspondence\s*address)\b"],
        "name_patterns": [r"^(address|street|addr|perm_addr|comm_addr)$"],
        "autocompletes": ["street-address", "address-line1"],
        "valid_types": ["text", "textarea"],
        "portal_keywords": ["perm_addr", "addr_line1", "comm_addr"],
        "context_boosts": ["address", "residence", "domicile"],
        "context_penalties": []
    },
    "address.city": {
        "graph_path": "address.city",
        "label_patterns": [r"\b(city|town|district)\b"],
        "name_patterns": [r"^(city|town|district|txt_city)$"],
        "autocompletes": ["address-level2"],
        "valid_types": ["text", "select"],
        "portal_keywords": ["city", "dist", "txt_city"],
        "context_boosts": ["address", "location"],
        "context_penalties": []
    },
    "address.state": {
        "graph_path": "address.state",
        "label_patterns": [r"\b(state|province)\b"],
        "name_patterns": [r"^(state|province|txt_state|ddl_state)$"],
        "autocompletes": ["address-level1"],
        "valid_types": ["select", "text"],
        "portal_keywords": ["state", "txt_state", "ddl_state"],
        "context_boosts": ["address", "location"],
        "context_penalties": []
    },
    "address.pincode": {
        "graph_path": "address.pincode",
        "label_patterns": [r"\b(pincode|pin\s*code|zip\s*code|postal\s*code|zip)\b"],
        "name_patterns": [r"^(pincode|pin|zip|zipcode|postal_code|txt_pin)$"],
        "autocompletes": ["postal-code"],
        "valid_types": ["text", "number"],
        "portal_keywords": ["pincode", "pin_code", "txt_pin"],
        "context_boosts": ["address", "location"],
        "context_penalties": []
    },
    "family.fatherName": {
        "graph_path": "family.fatherName",
        "label_patterns": [r"\b(father|parents?|guardians?|father\s*name|parents?\s*name|guardians?\s*name|father\s*or\s*guardian)\b"],
        "name_patterns": [r"^(father_name|fname|fat_name|fath_name|parent_name|guardian_name|txt_father)$"],
        "autocompletes": [],
        "valid_types": ["text"],
        "portal_keywords": ["f_name", "fat_name", "fath_name", "parent_name"],
        "context_boosts": ["family", "parent", "guardian", "father"],
        "context_penalties": ["mother"]
    },
    "family.motherName": {
        "graph_path": "family.motherName",
        "label_patterns": [r"\b(mother|mother'?s?\s*name)\b"],
        "name_patterns": [r"^(mother_name|mot_name|moth_name|txt_mother)$"],
        "autocompletes": [],
        "valid_types": ["text"],
        "portal_keywords": ["m_name", "mot_name", "moth_name"],
        "context_boosts": ["family", "parent", "mother"],
        "context_penalties": ["father"]
    },
    "family.guardianName": {
        "graph_path": "family.guardianName",
        "label_patterns": [r"\b(guardians?|guardian\s*name|guardians?\s*name)\b"],
        "name_patterns": [r"^(guardian|guardian_name|guard_name|txt_guardian)$"],
        "autocompletes": [],
        "valid_types": ["text"],
        "portal_keywords": ["g_name", "guard_name", "guardian"],
        "context_boosts": ["guardian"],
        "context_penalties": ["father", "mother"]
    },
    "education.college": {
        "graph_path": "education.college",
        "label_patterns": [r"\b(college|institution|institute|university|school|campus)\b"],
        "name_patterns": [r"^(college|institute|university|school|inst_name)$"],
        "autocompletes": [],
        "valid_types": ["text", "select"],
        "portal_keywords": ["coll_name", "inst_name", "univ_name"],
        "context_boosts": ["education", "academic", "qualification"],
        "context_penalties": []
    },
    "education.degree": {
        "graph_path": "education.degree",
        "label_patterns": [r"\b(degree|course|qualification|branch|program)\b"],
        "name_patterns": [r"^(degree|course|qualification|branch)$"],
        "autocompletes": [],
        "valid_types": ["select", "text"],
        "portal_keywords": ["degree", "course_name"],
        "context_boosts": ["education", "academic"],
        "context_penalties": []
    },
    "education.cgpa": {
        "graph_path": "education.cgpa",
        "label_patterns": [r"\b(cgpa|gpa|percentage|marks|aggregate|score)\b"],
        "name_patterns": [r"^(cgpa|gpa|percentage|marks|score|tot_cgpa)$"],
        "autocompletes": [],
        "valid_types": ["text", "number"],
        "portal_keywords": ["cgpa_marks", "tot_cgpa", "perc_marks"],
        "context_boosts": ["education", "academic"],
        "context_penalties": []
    },
    "financial.annualIncome": {
        "graph_path": "financial.annualIncome",
        "label_patterns": [r"\b(annual\s*income|family\s*income|total\s*income|annual\s*family\s*income|income)\b"],
        "name_patterns": [r"^(annual_income|family_income|income|ann_inc|fam_inc)$"],
        "autocompletes": [],
        "valid_types": ["text", "number", "select"],
        "portal_keywords": ["ann_inc", "fam_inc", "income_rs"],
        "context_boosts": ["income", "financial", "family"],
        "context_penalties": []
    },
    "financial.bankAccountNumber": {
        "graph_path": "financial.bankAccountNumber",
        "label_patterns": [r"\b(bank\s*account|account\s*number|acc\s*no|bank\s*acc|account\s*num|bank\s*account\s*number)\b"],
        "name_patterns": [r"^(account_number|acc_number|acc_num|bank_acc|bank_account|account_no)$"],
        "autocompletes": [],
        "valid_types": ["text", "number"],
        "portal_keywords": ["acc_no", "acc_number", "bank_acc", "ac_number"],
        "context_boosts": ["financial", "bank", "refund", "fee"],
        "context_penalties": []
    },
    "identity.aadhaarNumber": {
        "graph_path": "identity.aadhaarNumber",
        "label_patterns": [r"\b(aadhaar|aadhar|uid|uidai|unique\s*identity)\b"],
        "name_patterns": [r"^(aadhaar|aadhar|uid|aadhaar_no|aadhar_number)$"],
        "autocompletes": [],
        "valid_types": ["text", "number"],
        "portal_keywords": ["aadhaar_no", "uid_no", "aadhar_num"],
        "context_boosts": ["identity", "id_proof"],
        "context_penalties": []
    }
}


class SemanticFieldMappingAgent:
    """
    Multi-Signal Semantic Field Mapping Agent
    """

    def __init__(self, confidence_threshold: float = 0.80):
        self.confidence_threshold = confidence_threshold

    def _normalize_text(self, text: Optional[str]) -> str:
        if not text:
            return ""
        # Remove apostrophes to keep possessives together ("parent's" -> "parents")
        cleaned = re.sub(r"['’]", "", str(text).lower())
        cleaned = re.sub(r"[^a-z0-9\s]", " ", cleaned)
        return " ".join(cleaned.split())

    def _score_field_candidate(
        self,
        website_field: dict,
        target_key: str,
        target_def: dict,
        page_context: str = ""
    ) -> Tuple[float, List[str]]:
        """
        Calculates multi-signal score for a candidate target.
        Signals: label, role, name, placeholder, autocomplete, nearby text, semantic context, field type, known portal knowledge.
        """
        signals_used = []
        score = 0.0

        label_raw = website_field.get("label", "")
        norm_label = self._normalize_text(label_raw)
        name_raw = website_field.get("name", "")
        norm_name = self._normalize_text(name_raw)
        placeholder_raw = website_field.get("placeholder", "")
        norm_placeholder = self._normalize_text(placeholder_raw)
        autocomplete = str(website_field.get("autocomplete", "")).strip().lower()
        nearby_text = self._normalize_text(website_field.get("nearbyText", ""))
        semantic_context = self._normalize_text(website_field.get("semanticContext", ""))
        field_type = str(website_field.get("type", "text")).lower()
        role = str(website_field.get("role", "")).lower()

        # 1. Autocomplete match (+0.35)
        if autocomplete and autocomplete not in ["off", "none"]:
            if autocomplete in target_def["autocompletes"]:
                score += 0.35
                signals_used.append("autocomplete")

        # 2. Label match (+0.40)
        for pat in target_def["label_patterns"]:
            if re.search(pat, norm_label, re.IGNORECASE):
                score += 0.40
                signals_used.append("label")
                break

        # 3. Name match (+0.25)
        for pat in target_def["name_patterns"]:
            if (
                re.search(pat, norm_name, re.IGNORECASE) or
                re.search(pat, name_raw, re.IGNORECASE) or
                re.search(pat, name_raw.replace("_", ""), re.IGNORECASE)
            ):
                score += 0.25
                signals_used.append("name")
                break

        # 4. Known Portal Knowledge (+0.25)
        for kw in target_def["portal_keywords"]:
            if kw in norm_name or kw in norm_label or kw == name_raw.lower() or kw in name_raw.lower():
                score += 0.25
                signals_used.append("known_portal_knowledge")
                break

        # 5. Placeholder match (+0.15)
        for pat in target_def["label_patterns"]:
            if re.search(pat, norm_placeholder, re.IGNORECASE):
                score += 0.15
                signals_used.append("placeholder")
                break

        # 6. Semantic Context & Nearby Text (+0.20 boost, -0.30 penalty)
        full_context = f"{semantic_context} {nearby_text}"
        for cb in target_def["context_boosts"]:
            if cb in full_context:
                score += 0.20
                signals_used.append("semantic_context")
                break

        for cp in target_def["context_penalties"]:
            if cp in full_context or cp in norm_label:
                score -= 0.30

        # 7. Field Type Compatibility Validation
        if field_type in target_def["valid_types"]:
            score += 0.10
            signals_used.append("field_type")
        else:
            # Severe type mismatch penalty! e.g. "file" for email, or "checkbox" for name
            score -= 0.60

        # Cap between 0.0 and 1.0
        final_score = max(0.0, min(1.0, round(score, 2)))
        return final_score, signals_used

    def map_field(
        self,
        website_field: dict,
        knowledge_graph: Optional[dict] = None,
        page_context: str = ""
    ) -> FieldMappingModel:
        """
        Maps a single WebsiteField to Candidate Graph value + Document Evidence.
        """
        field_id = website_field.get("fieldId") or website_field.get("name") or "unknown_field"
        label = website_field.get("label", "")
        field_type = website_field.get("type", "text")

        # 0. Check for interactive security/action fields (CAPTCHA, OTP, buttons)
        norm_label = self._normalize_text(label)
        norm_name = self._normalize_text(website_field.get("name", ""))
        if re.search(r"\b(captcha|recaptcha|security\s*code|enter\s*code)\b", f"{norm_label} {norm_name}"):
            return FieldMappingModel(
                websiteFieldId=field_id,
                applicantField="security.captcha",
                candidateValue=None,
                source="NONE",
                confidence=0.99,
                status="REQUIRES_USER",
                isFillable=False,
                signalsUsed=["label", "name", "page_context"],
                matchReason="Security CAPTCHA requires human user entry."
            )

        if re.search(r"\b(otp|one\s*time\s*password|verification\s*code)\b", f"{norm_label} {norm_name}"):
            return FieldMappingModel(
                websiteFieldId=field_id,
                applicantField="security.otp",
                candidateValue=None,
                source="NONE",
                confidence=0.99,
                status="REQUIRES_USER",
                isFillable=False,
                signalsUsed=["label", "name", "page_context"],
                matchReason="Security OTP verification code requires live user entry."
            )

        # Check for wrong semantic type upfront
        if field_type == "file" and re.search(r"\b(email|phone|name|dob)\b", norm_label):
            return FieldMappingModel(
                websiteFieldId=field_id,
                applicantField="unknown.file_mismatch",
                candidateValue=None,
                source="NONE",
                confidence=0.20,
                status="REQUIRES_USER",
                isFillable=False,
                signalsUsed=["field_type", "label"],
                matchReason="Type mismatch: file input declared for text-like semantic label."
            )

        # 1. Score all candidates
        candidate_scores = []
        for target_key, target_def in SEMANTIC_TARGETS.items():
            c_score, c_signals = self._score_field_candidate(
                website_field, target_key, target_def, page_context
            )
            if c_score > 0.30:
                candidate_scores.append((target_key, c_score, c_signals, target_def))

        candidate_scores.sort(key=lambda x: x[1], reverse=True)

        # 2. Check for AMBIGUITY (top two candidates with competitive scores and non-trivial confidence)
        if len(candidate_scores) > 1:
            second_match = candidate_scores[1]
            top_match = candidate_scores[0]
            top_key, top_score, top_signals, top_def = top_match
            sec_key, sec_score, sec_signals, _ = second_match
            if sec_score >= 0.40 and (top_score - sec_score) < 0.15:
                alt_list = [
                    AlternativeMatchModel(applicantField=top_key, confidence=top_score, reason="Candidate 1"),
                    AlternativeMatchModel(applicantField=sec_key, confidence=sec_score, reason="Candidate 2")
                ]
                return FieldMappingModel(
                    websiteFieldId=field_id,
                    applicantField=top_key,
                    candidateValue=None,
                    source="NONE",
                    confidence=top_score,
                    status="AMBIGUOUS",
                    isFillable=False,
                    signalsUsed=top_signals,
                    matchReason=f"Ambiguous signals: competing match between {top_key} ({top_score}) and {sec_key} ({sec_score}).",
                    alternativeMatches=alt_list
                )

        # 3. Check if no strong matches -> LOW_CONFIDENCE / REQUIRES_USER
        if not candidate_scores or candidate_scores[0][1] < self.confidence_threshold:
            conf = candidate_scores[0][1] if candidate_scores else 0.20
            matched_key = candidate_scores[0][0] if candidate_scores else "UNKNOWN_FIELD"
            return FieldMappingModel(
                websiteFieldId=field_id,
                applicantField=matched_key,
                candidateValue=None,
                source="NONE",
                confidence=conf,
                status="REQUIRES_USER",
                isFillable=False,
                signalsUsed=candidate_scores[0][2] if candidate_scores else ["label"],
                matchReason="Low confidence mapping: missing distinctive signals."
            )

        top_match = candidate_scores[0]
        top_key, top_score, top_signals, top_def = top_match

        # 4. Resolve against Applicant Knowledge Graph & Document Evidence
        graph_path = top_def["graph_path"]
        kg = knowledge_graph or {}
        domain, prop = graph_path.split(".")

        # Check for active conflict in knowledge graph
        conflicts = kg.get("conflicts", [])
        unresolved_conflict = next(
            (c for c in conflicts if c.get("path") == graph_path and c.get("status") == "UNRESOLVED"),
            None
        )

        domain_data = kg.get(domain, {})
        node = domain_data.get(prop)

        if unresolved_conflict or (node and node.get("verificationStatus") == "CONFLICT"):
            existing_v = (
                unresolved_conflict.get("existingValue", {}).get("value")
                if unresolved_conflict else node.get("value")
            )
            conflicting_v = (
                unresolved_conflict.get("conflictingValue", {}).get("value")
                if unresolved_conflict else None
            )
            evidence_str = (
                unresolved_conflict.get("existingValue", {}).get("evidence")
                if unresolved_conflict else node.get("evidence")
            )
            return FieldMappingModel(
                websiteFieldId=field_id,
                applicantField=top_key,
                candidateValue=existing_v,
                source=node.get("source", "DOCUMENT") if node else "DOCUMENT",
                confidence=min(top_score, 0.70),
                status="CONFLICT",
                isFillable=False,
                evidence=evidence_str,
                signalsUsed=top_signals,
                matchReason=f"Unresolved FIELD_CONFLICT detected for {graph_path}.",
                conflictDetails=ConflictDetailModel(
                    existingValue=existing_v,
                    conflictingValue=conflicting_v,
                    reason="FIELD_CONFLICT"
                )
            )

        # Check if value is MISSING
        if not node or node.get("value") in [None, "", []]:
            return FieldMappingModel(
                websiteFieldId=field_id,
                applicantField=top_key,
                candidateValue=None,
                source="NONE",
                confidence=top_score,
                status="MISSING",
                isFillable=False,
                signalsUsed=top_signals,
                matchReason=f"Field identified as {top_key}, but knowledge graph contains no value."
            )

        # MATCHED & Clean!
        candidate_val = node.get("value")
        source = node.get("source", "PROFILE")
        evidence = node.get("evidence")
        node_conf = node.get("confidence", 0.95)
        combined_conf = round(top_score * node_conf, 2)

        return FieldMappingModel(
            websiteFieldId=field_id,
            applicantField=top_key,
            candidateValue=candidate_val,
            source=source,
            confidence=combined_conf,
            status="MATCHED",
            isFillable=True,
            evidence=evidence,
            signalsUsed=top_signals,
            matchReason=f"High confidence match on multi-signals, verified in knowledge graph."
        )

    def map_page_fields(
        self,
        website_fields: List[dict],
        knowledge_graph: Optional[dict] = None,
        page_url: str = "",
        page_type: str = "APPLICATION_FORM"
    ) -> SemanticFieldMappingSetModel:
        """
        Maps a list of WebsiteFields for an entire page.
        """
        mappings: List[FieldMappingModel] = []
        counts = {
            "totalFields": len(website_fields),
            "matched": 0,
            "ambiguous": 0,
            "missing": 0,
            "conflict": 0,
            "requiresUser": 0,
            "fillableCount": 0
        }

        for field in website_fields:
            m = self.map_field(field, knowledge_graph, page_context=page_type)
            mappings.append(m)

            if m.status == "MATCHED":
                counts["matched"] += 1
            elif m.status == "AMBIGUOUS":
                counts["ambiguous"] += 1
            elif m.status == "MISSING":
                counts["missing"] += 1
            elif m.status == "CONFLICT":
                counts["conflict"] += 1
            elif m.status == "REQUIRES_USER":
                counts["requiresUser"] += 1

            if m.isFillable:
                counts["fillableCount"] += 1

        return SemanticFieldMappingSetModel(
            schemaVersion="2.0.0",
            mappingId=f"map_{uuid.uuid4()}",
            pageUrl=page_url,
            pageType=page_type,
            mappings=mappings,
            stats=counts,
            timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat()
        )
