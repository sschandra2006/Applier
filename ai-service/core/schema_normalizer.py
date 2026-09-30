import logging

logger = logging.getLogger("SchemaNormalizer")

FIELD_ALIASES = {
    "name": [
        "workflowName",
        "applicationName",
        "formName",
        "applicationTitle",
        "workflow_title",
    ],
    "description": [
        "summary",
        "details",
        "overview",
        "purpose",
    ],
    "pages": [
        "screens",
        "forms",
        "sections",
        "views",
    ],
    "steps": [
        "actions",
        "tasks",
        "instructions",
        "operations",
        "workflow",
        "fields",  # Legacy mapped steps directly to fields
    ],
    "fields": [
        "inputs",
        "controls",
        "elements",
        "questions",
    ],
    "selector": [
        "css",
        "cssSelector",
        "xpath",
        "locator",
    ],
    "label": [
        "text",
        "caption",
    ],
    "question": [
        "followUpQuestion",
        "followup_question",
        "message",
        "prompt",
        "ask",
    ],
    "extracted_data": [
        "extractedData",
        "extracted_fields",
        "extractedFields",
        "answers",
    ],
    "nextField": [
        "next_field",
        "currentField",
        "targetField",
    ],
    "requiresClarification": [
        "requires_clarification",
        "needClarification",
    ]
}


# Build reverse mapping for O(1) lookups
ALIAS_TO_CANONICAL = {}
for canonical, aliases in FIELD_ALIASES.items():
    for alias in aliases:
        ALIAS_TO_CANONICAL[alias.lower()] = canonical

def normalize_dict(data: dict) -> dict:
    normalized = {}
    for key, value in data.items():
        lower_key = key.lower()
        
        # 1. Alias Resolution
        canonical_key = ALIAS_TO_CANONICAL.get(lower_key, key)
        
        # 2. Logging and Metrics
        if canonical_key != key:
            logger.info(f"[Normalizer] Resolved alias '{key}' -> '{canonical_key}'")
            # In production, we could increment a metrics counter here
            
        # If we couldn't resolve it and it's not a known canonical key, log unknown field hallucination
        if canonical_key == key and key not in FIELD_ALIASES and canonical_key not in ["schemaVersion", "website", "metadata", "extensions", "id", "type", "required", "validation", "options", "url"]:
            logger.warning(f"[Normalizer] Unknown field hallucinated by AI: '{key}'")
            
        # 3. Recursion for nested structures
        if isinstance(value, dict):
            normalized[canonical_key] = normalize_dict(value)
        elif isinstance(value, list):
            normalized[canonical_key] = [normalize_dict(item) if isinstance(item, dict) else item for item in value]
        else:
            normalized[canonical_key] = value
            
    if "pages" in normalized and "name" not in normalized and "title" not in normalized:
        normalized["name"] = "Application Workflow"

    return normalized
