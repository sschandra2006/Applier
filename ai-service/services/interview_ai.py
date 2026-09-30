from core.llm_service import llm_service
import json
from pydantic import BaseModel, Field
from typing import Any, Dict, Optional


class ExtractedAnswer(BaseModel):
    extracted_data: Dict[str, Any] = Field(default_factory=dict)
    nextField: Optional[str] = Field(default="")
    question: str = Field(default="Could you please provide your details to proceed with your application?")
    confidence: float = Field(default=0.85)
    requiresClarification: bool = Field(default=False)


def process_interview_turn(state: dict, last_user_message: str) -> dict:
    pending_fields = (state.get("pendingFields") or [])[:10]
    field_details = state.get("fieldDetails") or {}
    
    scanned_field_context = []
    for f_id in pending_fields:
        if f_id in field_details:
            info = field_details[f_id]
            scanned_field_context.append({
                "field_id": f_id,
                "label": info.get("label", f_id),
                "type": info.get("type", "text"),
                "required": info.get("required", True),
                "options": info.get("options"),
                "page_title": info.get("page_title"),
                "validation": info.get("validation")
            })
        else:
            scanned_field_context.append({"field_id": f_id, "label": f_id})

    compact_state = {
        "pendingFields": pending_fields,
        "activeField": state.get("currentField") or (pending_fields[0] if pending_fields else None),
        "scannedSiteFields": scanned_field_context,
        "applicationOptions": state.get("applicationOptions") or [],
        "selectedOption": state.get("selectedOption"),
        "completedFields": list((state.get("answers") or {}).keys()),
        "availableDocuments": [d.get("type") or d.get("name") for d in (state.get("availableDocuments") or [])],
    }

    import logging
    logging.getLogger("InterviewAI").info(f"COMPACT_STATE: {json.dumps(compact_state)}")

    prompt = f"""
You are an intelligent Interview AI helping a user complete an application form based strictly on data scanned from the target website.

CRITICAL INSTRUCTION: You must NEVER invent or hallucinate questions. You may ONLY ask questions about fields explicitly listed in `pendingFields`.

Rules:
1. Handling Application Options:
   - ONLY if `applicationOptions` is NOT empty (contains 2 or more options) AND `selectedOption` is NOT set:
     - Ask the user to choose one of the options from `applicationOptions`.
     - Output `nextField: "application_type"`.
   - IF `applicationOptions` is empty OR `selectedOption` is already set:
     - You MUST NOT ask what type of application they want to submit. Skip directly to field collection.

2. Collecting Form Fields:
   - The `activeField` is the current field being collected (e.g. "{compact_state['activeField']}").
   - If the user's message is an answer to `activeField` (any string, name, number, or text provided by the user), you MUST extract it as `{{"{compact_state['activeField']}": "<user_answer>"}}` in `extracted_data`.
   - After extracting, set `nextField` to the NEXT field in `pendingFields` (the field immediately after `activeField`), and set `question` to clearly ask for that next field using its `label`.
   - IMPORTANT FOR DROPDOWNS/SELECT FIELDS: If `nextField` has dropdown `options`, list the available option labels clearly in your question (e.g., "Select Language (Choices: English, Hindi, Gujarati, Marathi...)").
   - If the user's message is just a greeting (e.g. "Hello", "Hi"), leave `extracted_data` as {{}}, set `nextField` to `activeField`, and ask for `activeField`.

Scanned Site Form Context:
{json.dumps(compact_state, indent=2)}

User's Last Message: "{last_user_message}"

Return ONLY a valid JSON object matching this exact structure:
{{
  "extracted_data": {{}},
  "nextField": "<the_id_of_the_field_you_are_asking_about_next>",
  "question": "<your clear, polite question asking for the nextField>",
  "confidence": 0.9,
  "requiresClarification": false
}}
"""

    schema_obj = llm_service.generate_safe_json(
        prompt=prompt, schema_model=ExtractedAnswer, temperature=0.2, max_output_tokens=1000, use_cache=False
    )

    res = schema_obj.model_dump()
    if not res.get("question") or not str(res.get("question")).trim():
        res["question"] = "Thank you! All required details have been collected."
    if not res.get("nextField"):
        res["nextField"] = ""
    return res
