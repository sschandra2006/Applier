import json
import asyncio
from core.llm_service import llm_service
from services.interview_ai import ExtractedAnswer

compact_state = {
    'pendingFields': ['userName_id', 'password_id', 'captchaId', 'prevApplId', 'sscPassType', 'sscExamNo', 'sscPassYr', 'applnameinaadhar'],
    'activeField': 'userName_id',
    'scannedSiteFields': [
        {'field_id': 'userName_id', 'label': 'userName', 'type': 'text'},
        {'field_id': 'password_id', 'label': 'password', 'type': 'password'},
    ],
    'applicationOptions': [],
    'selectedOption': None,
    'completedFields': [],
    'availableDocuments': []
}

last_user_message = 'my first name is thodupunuri'

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
   - The `activeField` is the current field you need to collect.
   - If the user's message answers the current `activeField`, extract it into `extracted_data` using the EXACT `field_id` from `scannedSiteFields`.
   - Determine the next question to ask:
     - If the user just started (e.g. "Hello"), your question should ask for the `activeField` (e.g. {compact_state['activeField']}).
     - If the user successfully answered the `activeField`, your question should ask for the NEXT field in `pendingFields`.
   - Your question MUST use the exact `label` from `scannedSiteFields` to make it clear what you are asking for.

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

schema = llm_service.generate_safe_json(prompt, ExtractedAnswer, use_cache=False)
print(schema.model_dump_json(indent=2))
