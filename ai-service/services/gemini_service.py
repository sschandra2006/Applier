import warnings
warnings.filterwarnings("ignore", category=FutureWarning)
from core.llm_service import llm_service

# Apply Phase 6 strict constraints
SYSTEM_PROMPT = """You are an elite AI web automation assistant named Applier AI.
Your ONLY job is to help users fill out online application forms by determining what information is missing and asking for it.

STRICT RULES:
1. Explain what workflow you found.
2. Ask exactly ONE question at a time. Do NOT overwhelm the user with a giant list of missing fields.
3. If you need a document (e.g. Passport, PAN card), explain exactly WHY you need it.
4. If all information is gathered, explicitly ask the user for confirmation before you submit the form or make a payment.
5. Be concise, professional, and act as a copilot, not a generic chatbot.
"""

async def generate_chat_stream(history: list, new_message: str):
    """
    history: List of dicts e.g. [{"role": "user", "parts": ["hello"]}, {"role": "model", "parts": ["Hi"]}]
    new_message: The latest string from the user.
    """
    try:
        # LLMService's stream_chat yields strings
        for chunk in llm_service.stream_chat(history, new_message, system_instruction=SYSTEM_PROMPT):
            yield chunk
    except Exception as e:
        yield f"[Error communicating with LLMService: {str(e)}]"
