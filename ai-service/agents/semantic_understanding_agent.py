"""
Semantic Understanding Agent
Applier 2.0 — Phase 5: Semantic Page Understanding

Converts BrowserObservation into a validated SemanticPageModel.
Understands WHAT the page and fields mean without generating execution selectors or actions.
Supports caching, confidence scoring, low-confidence unresolved states, and LLM safety.
"""

import re
import uuid
import hashlib
import datetime
from typing import Dict, Any, List, Optional
from core.models import SemanticPageModel, SemanticField
from core.llm_service import llm_service
from core.ai_logger import ai_logger

try:
    import sys
    import os
    _VALIDATORS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "shared", "validators"))
    if _VALIDATORS_DIR not in sys.path:
        sys.path.insert(0, _VALIDATORS_DIR)
    from python_validator import validate_canonical
except ImportError:
    validate_canonical = None


# Canonical semantic field mappings with regex patterns
SEMANTIC_FIELD_PATTERNS = [
    # Explicit specific fields checked before general fullName
    (
        "applicant.email",
        re.compile(r"\b(email|e-mail|mail\s*address)\b", re.IGNORECASE),
        "Email address field pattern recognized.",
        0.98
    ),
    (
        "applicant.phone",
        re.compile(r"\b(phone|mobile|contact\s*no|telephone|cell)\b", re.IGNORECASE),
        "Telephone or mobile contact number field recognized.",
        0.96
    ),
    (
        "applicant.fatherName",
        re.compile(r"\b(father|father'?s?\s*name|parent'?s?\s*name|guardian)\b", re.IGNORECASE),
        "Field specifically references father or guardian name.",
        0.95
    ),
    (
        "applicant.motherName",
        re.compile(r"\b(mother|mother'?s?\s*name)\b", re.IGNORECASE),
        "Field specifically references mother's name.",
        0.95
    ),
    (
        "education.college",
        re.compile(r"\b(college|institution|institute|university|school|campus)\b", re.IGNORECASE),
        "Educational institution or college name recognized.",
        0.93
    ),
    (
        "education.degree",
        re.compile(r"\b(degree|course|qualification|branch|major|stream|program)\b", re.IGNORECASE),
        "Educational degree or academic course recognized.",
        0.92
    ),
    (
        "education.cgpa",
        re.compile(r"\b(cgpa|gpa|percentage|marks|grade|score|aggregate)\b", re.IGNORECASE),
        "Academic performance metric (CGPA/percentage) recognized.",
        0.94
    ),
    (
        "financial.income",
        re.compile(r"\b(income|annual\s*income|family\s*income|salary|earnings)\b", re.IGNORECASE),
        "Household or annual family income field recognized.",
        0.94
    ),
    (
        "document.identity",
        re.compile(r"\b(aadhaar|pan|passport|id\s*proof|identity|voter)\b", re.IGNORECASE),
        "Identity verification document upload or number.",
        0.91
    ),
    (
        "auth.password",
        re.compile(r"\b(password|passwd|pwd|secret)\b", re.IGNORECASE),
        "Authentication credential field.",
        0.97
    ),
    (
        "applicant.dateOfBirth",
        re.compile(r"\b(dob|date\s*of\s*birth|birth\s*date|born\s*on)\b", re.IGNORECASE),
        "Date of birth identifier detected in label or attribute.",
        0.96
    ),
    (
        "applicant.gender",
        re.compile(r"\b(gender|sex)\b", re.IGNORECASE),
        "Gender or sex selection identifier detected.",
        0.94
    ),
    (
        "applicant.fullName",
        re.compile(r"\b(full\s*name|applicant\s*name|candidate\s*name|student\s*name|first\s*name|last\s*name|legal\s*name|your\s*name|name)\b", re.IGNORECASE),
        "Field text/label explicitly indicates applicant official name.",
        0.95
    ),
    (
        "applicant.address",
        re.compile(r"\b(address|street|residence|domicile|postal\s*address|permanent\s*address)\b", re.IGNORECASE),
        "Residential or permanent address field recognized.",
        0.92
    )
]

AMBIGUOUS_PATTERNS = re.compile(
    r"\b(code|ref|id|temp|query|value|arg|field|data|other|misc|check|item)\b",
    re.IGNORECASE
)


class SemanticUnderstandingAgent:
    def __init__(self):
        self._cache: Dict[str, dict] = {}

    def _compute_state_hash(self, observation: dict) -> str:
        """Computes deterministic hash from URL and elements to avoid redundant analysis."""
        url = observation.get("url", "")
        elements = observation.get("elements", [])
        elem_keys = [
            f"{e.get('elementId', '')}|{e.get('tag', '')}|{e.get('name', '')}|{e.get('label', '')}|{e.get('placeholder', '')}"
            for e in elements
        ]
        elem_keys.sort()
        raw = f"{url}:::{'|'.join(elem_keys)}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def process(self, context: dict) -> dict:
        """
        Main entry point. Accepts context with observation and returns SemanticPageModel.
        """
        observation = context.get("observation") or context.get("raw_data") or context
        if not isinstance(observation, dict):
            raise ValueError("SemanticUnderstandingAgent: Valid observation dictionary is required")

        # 1. Check Cache
        cache_key = self._compute_state_hash(observation)
        if cache_key in self._cache:
            ai_logger.logger.info(f"[SemanticAgent] Cache HIT for key: {cache_key[:8]}")
            cached_result = dict(self._cache[cache_key])
            cached_result["metadata"] = dict(cached_result.get("metadata", {}))
            cached_result["metadata"]["cached"] = True
            return cached_result

        start_time = datetime.datetime.now(datetime.UTC)

        # 2. Analyze Observation
        result = self._analyze_observation(observation)

        duration_ms = (datetime.datetime.now(datetime.UTC) - start_time).total_seconds() * 1000
        result["metadata"]["durationMs"] = round(duration_ms, 2)
        result["metadata"]["cached"] = False

        # 3. Canonical Schema Validation
        if validate_canonical:
            is_valid, errors = validate_canonical("semantic-page-model", result)
            if not is_valid:
                raise ValueError(f"SemanticUnderstandingAgent: Model failed schema validation: {errors}")

        # 4. Save to Cache
        self._cache[cache_key] = result

        return result

    def _classify_page_type(self, observation: dict) -> tuple[str, float, str]:
        """Classifies page into canonical PageType enum."""
        url = observation.get("url", "").lower()
        title = observation.get("title", "").lower()
        elements = observation.get("elements", [])
        summary = (observation.get("page", {}).get("visibleTextSummary") or "").lower()

        combined_text = f"{url} {title} {summary}"

        # 1. Error Page
        if any(w in combined_text for w in ["404 not found", "error 500", "access denied", "page not found", "server error"]):
            return "ERROR", 0.95, "Page contains explicit error headers and error status text."

        # 2. Success / Receipt
        if any(w in combined_text for w in ["application submitted successfully", "submission successful", "reference number", "acknowledgement slip"]):
            return "SUCCESS", 0.96, "Page displays explicit completion confirmation and reference acknowledgment."

        # 3. OTP Verification
        if any(w in combined_text for w in ["enter otp", "one time password", "verification code", "enter code"]):
            return "OTP", 0.94, "Presence of OTP verification instructions and code entry inputs."

        # 4. Captcha
        if any(w in combined_text for w in ["enter captcha", "security check", "solve puzzle", "turnstile challenge"]):
            return "CAPTCHA", 0.93, "Dedicated CAPTCHA or security verification prompt detected."

        # 5. Payment Gateway
        if any(w in combined_text for w in ["payment gateway", "card number", "pay fee", "checkout", "transaction amount"]):
            return "PAYMENT", 0.95, "Fee collection or payment transaction inputs present."

        # 6. Review / Confirmation
        if any(w in combined_text for w in ["review application", "preview details", "verify details before submit", "declaration"]):
            return "REVIEW", 0.91, "Summary review screen with confirmation/declaration controls."

        # 7. Document Upload
        file_inputs = [e for e in elements if e.get("tag") == "input" and e.get("type") == "file"]
        if file_inputs and len(file_inputs) >= 1 and ("upload" in title or "upload" in combined_text or len(elements) <= len(file_inputs) + 3):
            return "DOCUMENT_UPLOAD", 0.92, "Page dedicated to file uploads and document attachment."

        # 8. Login Page
        password_inputs = [e for e in elements if e.get("type") == "password"]
        if password_inputs and any(w in combined_text for w in ["sign in", "login", "log in", "portal access"]):
            return "LOGIN", 0.96, "Authentication login form with credential inputs and sign-in button."

        # 9. Registration Page
        if any(w in combined_text for w in ["new registration", "create account", "sign up", "fresh register"]):
            return "REGISTRATION", 0.94, "New user onboarding or account creation form."

        # 10. Application Form
        form_inputs = [e for e in elements if e.get("tag") in ["input", "select", "textarea"] and e.get("type") not in ["hidden", "submit", "button"]]
        if len(form_inputs) >= 2 or "application" in combined_text or "scholarship" in combined_text:
            return "APPLICATION_FORM", 0.92, f"Contains multi-field application entry form ({len(form_inputs)} inputs)."

        # 11. Landing Page
        if any(w in combined_text for w in ["welcome to", "home", "portal", "guidelines", "announcements"]):
            return "LANDING", 0.85, "Portal informational landing or navigation directory."

        return "UNKNOWN", 0.40, "Insufficient specific semantic indicators to determine page category."

    def _resolve_field_semantic(self, element: dict) -> tuple[str, float, str, bool]:
        """
        Determines semantic type for a single element.
        Never forces incorrect mapping. Low confidence remains unresolved.
        """
        label = (element.get("label") or "").strip()
        name = (element.get("name") or "").strip()
        placeholder = (element.get("placeholder") or "").strip()
        text = (element.get("text") or "").strip()
        tag = (element.get("tag") or "").lower()
        elem_type = (element.get("type") or "").lower()
        role = (element.get("role") or "").lower()

        # Non-input elements (e.g. submit buttons, links) are not applicant data fields
        if tag in ["button", "a"] or elem_type in ["submit", "button", "reset"] or role == "button":
            return (
                "UNKNOWN_FIELD",
                0.30,
                f"Element is an action control ({tag}/{elem_type}), not a profile data field.",
                False
            )

        # HTML input type shortcuts
        if elem_type == "email":
            return (
                "applicant.email",
                0.98,
                "HTML input element type is explicitly email.",
                True
            )
        if elem_type == "tel":
            return (
                "applicant.phone",
                0.96,
                "HTML input element type is explicitly tel.",
                True
            )
        if elem_type == "password":
            return (
                "auth.password",
                0.98,
                "HTML input element type is explicitly password.",
                True
            )

        # Concatenate text cues
        cues = f"{label} {name} {placeholder} {text}".strip()

        # Check for ambiguous/generic markers without clear context
        is_ambiguous = bool(AMBIGUOUS_PATTERNS.fullmatch(cues) or AMBIGUOUS_PATTERNS.fullmatch(name) or len(cues) < 3)

        # Match against patterns
        best_match = None
        for semantic_type, pattern, reason, confidence in SEMANTIC_FIELD_PATTERNS:
            if pattern.search(cues):
                best_match = (semantic_type, confidence, reason, True)
                break

        if best_match:
            semantic_type, confidence, reason, _ = best_match
            # If the cue was ambiguous (e.g. just "code"), lower confidence and leave unresolved
            if is_ambiguous and not ("father" in cues.lower() or "mother" in cues.lower()):
                return (
                    semantic_type,
                    0.50,
                    f"Ambiguous matching cue ('{cues}'). Kept unresolved to prevent incorrect mapping.",
                    False
                )
            return (semantic_type, confidence, reason, True)

        # If no recognized pattern matched
        return (
            "UNKNOWN_FIELD",
            0.20,
            f"No recognized applicant semantic pattern matched for cues: '{cues}'.",
            False
        )

    def _analyze_observation(self, observation: dict) -> dict:
        """Converts observation dictionary into SemanticPageModel dictionary."""
        model_id = f"sem_{uuid.uuid4()}"
        observation_id = observation.get("observationId", f"obs_{uuid.uuid4()}")
        url = observation.get("url", "about:blank")
        elements = observation.get("elements", [])

        # 1. Page Classification
        page_type, page_type_conf, page_type_reason = self._classify_page_type(observation)

        # 2. Field Semantics
        fields_data: List[dict] = []
        resolved_count = 0

        for el in elements:
            elem_id = el.get("elementId", "")
            if not elem_id:
                continue

            semantic_type, confidence, reason, is_resolved = self._resolve_field_semantic(el)

            if is_resolved:
                resolved_count += 1

            fields_data.append({
                "elementId": elem_id,
                "semanticType": semantic_type,
                "confidence": round(confidence, 2),
                "reason": reason,
                "isResolved": is_resolved
            })

        summary = f"Semantic model for {page_type} page at {url}. Total fields: {len(fields_data)}, Resolved: {resolved_count}."

        return {
            "schemaVersion": "2.0.0",
            "modelId": model_id,
            "observationId": observation_id,
            "url": url,
            "pageType": page_type,
            "pageTypeConfidence": round(page_type_conf, 2),
            "pageTypeReason": page_type_reason,
            "fields": fields_data,
            "summary": summary,
            "metadata": {
                "analyzedAt": datetime.datetime.now(datetime.UTC).isoformat(),
                "durationMs": 0.0,
                "cached": False,
                "modelUsed": "semantic-engine-v2",
                "fieldCount": len(fields_data),
                "resolvedCount": resolved_count
            }
        }


default_semantic_agent = SemanticUnderstandingAgent()
