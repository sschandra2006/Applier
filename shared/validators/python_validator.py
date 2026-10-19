"""
Canonical Schema Validator for Python — Applier 2.0
Uses standard jsonschema library against shared/schemas/*.json.
"""

import json
import os
from typing import Dict, Any, Tuple, List, Optional
import jsonschema

_CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
_SCHEMAS_DIR = os.path.abspath(os.path.join(_CURRENT_DIR, "..", "schemas"))

try:
    import referencing
    from referencing.jsonschema import DRAFT202012
    _HAS_REFERENCING = True
except ImportError:
    _HAS_REFERENCING = False

_SCHEMAS: Dict[str, dict] = {}
_REGISTRY = None


def _load_schemas():
    global _REGISTRY
    if not os.path.exists(_SCHEMAS_DIR):
        return
    resources = []
    for fname in os.listdir(_SCHEMAS_DIR):
        if fname.endswith(".json") and fname != "index.json":
            schema_name = fname[:-5]
            full_path = os.path.join(_SCHEMAS_DIR, fname)
            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    schema_data = json.load(f)
                    _SCHEMAS[schema_name] = schema_data
                    if _HAS_REFERENCING:
                        schema_id = schema_data.get("$id") or f"https://applier.ai/schemas/{fname}"
                        res = referencing.Resource.from_contents(schema_data, default_specification=DRAFT202012)
                        resources.append((schema_id, res))
            except Exception as e:
                print(f"[PythonValidator] Failed loading schema {fname}: {e}")
    if _HAS_REFERENCING and resources:
        _REGISTRY = referencing.Registry().with_resources(resources)


_load_schemas()


class CanonicalValidationError(ValueError):
    """Raised when data fails canonical JSON schema validation."""
    def __init__(self, schema_name: str, errors: List[str]):
        super().__init__(f"Canonical validation failed for {schema_name}: {'; '.join(errors)}")
        self.schema_name = schema_name
        self.errors = errors


def validate_canonical(schema_name: str, data: Any) -> Tuple[bool, List[str]]:
    """
    Validates a Python dictionary against the named canonical JSON schema.
    Returns: (is_valid, list_of_error_messages)
    """
    if not isinstance(data, dict):
        return False, ["Payload must be a dictionary"]

    # Version tracking
    schema_ver = data.get("schemaVersion") or "1.0.0"

    schema = _SCHEMAS.get(schema_name)
    if not schema:
        return False, [f"Unknown canonical schema: '{schema_name}'"]

    validator_cls = jsonschema.validators.validator_for(schema)
    if _REGISTRY is not None:
        validator = validator_cls(schema, registry=_REGISTRY)
    else:
        validator = validator_cls(schema)

    errors = []
    for err in validator.iter_errors(data):
        path_str = ".".join(str(p) for p in err.absolute_path) or "root"
        errors.append(f"{path_str}: {err.message}")

    return len(errors) == 0, errors


def validate_canonical_or_raise(schema_name: str, data: Any) -> dict:
    """
    Validates data against canonical schema or raises CanonicalValidationError.
    """
    is_valid, errors = validate_canonical(schema_name, data)
    if not is_valid:
        raise CanonicalValidationError(schema_name, errors)
    return data


def validate_pydantic_model(model_instance: Any, schema_name: str) -> Tuple[bool, List[str]]:
    """
    Adapts a Pydantic v2 model instance into canonical JSON schema validation.
    """
    if hasattr(model_instance, "model_dump"):
        data = model_instance.model_dump()
    elif hasattr(model_instance, "dict"):
        data = model_instance.dict()
    else:
        data = dict(model_instance)
    
    # Ensure schemaVersion is present if required
    if "schemaVersion" not in data:
        data["schemaVersion"] = "2.0.0"

    return validate_canonical(schema_name, data)
