import warnings
warnings.filterwarnings("ignore", category=FutureWarning)
import google.generativeai as genai
from core.config import settings

genai.configure(api_key=settings.GEMINI_API_KEY)

model = genai.GenerativeModel('gemini-2.5-flash')

async def generate_chat_stream(history: list, new_message: str):
    """
    history: List of dicts e.g. [{"role": "user", "parts": ["hello"]}, {"role": "model", "parts": ["Hi"]}]
    new_message: The latest string from the user.
    """
    try:
        chat = model.start_chat(history=history)
        response = chat.send_message(new_message, stream=True)
        
        for chunk in response:
            if chunk.text:
                yield chunk.text
    except Exception as e:
        yield f"[Error communicating with Gemini: {str(e)}]"
