import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    PROJECT_NAME = "Applier AI Service"
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
    GEMINI_FALLBACK_MODEL = os.getenv("GEMINI_FALLBACK_MODEL", "gemini-1.5-pro")
    GEMINI_TIMEOUT = int(os.getenv("GEMINI_TIMEOUT", "60"))
    GEMINI_MAX_RETRIES = int(os.getenv("GEMINI_MAX_RETRIES", "3"))

settings = Settings()
