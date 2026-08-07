import re
import logging
from pydantic import BaseModel, Field
from typing import List, Dict, Any
from core.llm_service import llm_service

logger = logging.getLogger("ValidationAgent")


class ValidationError(BaseModel):
    field: str
    error: str
    severity: str = "ERROR"  # ERROR | WARNING


class ValidationResult(BaseModel):
    errors: List[ValidationError] = Field(default_factory=list)
    isValid: bool = True
    eligibilityNotes: str = ""
    confidence: float = 0.99


# ──────────────────────────────────────────────────────────
# Rule Engine — fast, deterministic, zero LLM cost
# ──────────────────────────────────────────────────────────

RULES = {
    "age": lambda v: "Must be 18 or older" if int(v) < 18 else None,
    "email": lambda v: "Invalid email format" if "@" not in str(v) or "." not in str(v).split("@")[-1] else None,
    "phone": lambda v: "Phone number must be 10 digits" if not re.fullmatch(r"[6-9]\d{9}", str(v).replace(" ", "").replace("-", "")) else None,
    "aadhaar": lambda v: "Aadhaar must be exactly 12 digits" if not re.fullmatch(r"\d{12}", str(v).replace(" ", "")) else None,
    "pan": lambda v: "Invalid PAN format (e.g. ABCDE1234F)" if not re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]", str(v).upper()) else None,
    "pincode": lambda v: "PIN code must be 6 digits" if not re.fullmatch(r"\d{6}", str(v)) else None,
    "percentage": lambda v: "Percentage must be between 0 and 100" if not (0 <= float(v) <= 100) else None,
    "income": lambda v: "Income must be a positive number" if float(v) < 0 else None,
}


class ValidationAgent:
    """
    Two-stage validation:
    1. Rule Engine — instant deterministic checks (format, range, pattern)
    2. AI Eligibility Check — for complex business logic (eligibility, cross-field)
    """

    def process(self, context: dict) -> dict:
        fields_to_validate: Dict[str, Any] = context.get("raw_data", {}).get("fields", {})
        workflow = context.get("workflow", {})

        errors = []

        # Stage 1: Rule Engine
        for field_name, value in fields_to_validate.items():
            if value is None or value == "":
                continue
            rule = RULES.get(field_name.lower())
            if rule:
                try:
                    error_msg = rule(value)
                    if error_msg:
                        errors.append(ValidationError(field=field_name, error=error_msg))
                except (ValueError, TypeError) as e:
                    errors.append(ValidationError(
                        field=field_name,
                        error=f"Invalid value format: {str(e)}",
                        severity="WARNING"
                    ))

        # Stage 2: AI eligibility check (only when no hard errors found)
        eligibility_notes = ""
        if not errors and fields_to_validate:
            ai_result = self._ai_validate_eligibility(fields_to_validate, workflow)
            errors.extend(ai_result.get("errors", []))
            eligibility_notes = ai_result.get("notes", "")

        error_dicts = [e.model_dump() for e in errors]
        is_valid = len(errors) == 0

        return {
            "action": "validated",
            "errors": error_dicts,
            "isValid": is_valid,
            "eligibilityNotes": eligibility_notes,
            "confidence": 0.99 if is_valid else 0.95,
        }

    def _ai_validate_eligibility(self, fields: Dict[str, Any], workflow: dict) -> dict:
        """Use LLM for eligibility cross-checks that rule engines can't handle."""
        try:
            portal_type = workflow.get("metadata", {}).get("portal_type", "generic")

            class EligibilityCheck(BaseModel):
                isEligible: bool = True
                errors: List[Dict[str, str]] = Field(default_factory=list)
                notes: str = ""

            prompt = f"""
You are an eligibility checker for a "{portal_type}" application portal.
Review the following user-provided field values for eligibility issues.
Only flag real eligibility problems — not formatting issues.

Fields:
{str(fields)}

Check for:
- Age eligibility (many scholarships require age < 25 or > 18)
- Income criteria (if income is provided and seems disqualifying)
- Conflicting information
- Missing critical combinations

Return JSON with: isEligible (bool), errors (list of {{field, error}}), notes (string).
"""
            result = llm_service.generate_safe_json(
                prompt=prompt,
                schema_model=EligibilityCheck,
                temperature=0.1,
            )
            return {"errors": result.errors, "notes": result.notes}

        except Exception as e:
            logger.warning(f"[ValidationAgent] AI eligibility check failed (non-critical): {e}")
            return {"errors": [], "notes": ""}
