import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    PROJECT_NAME = "Applier AI Service"
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
    # Fix: gemini-3.5-flash does not exist; use gemini-1.5-flash as the correct default
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    GEMINI_FALLBACK_MODEL = os.getenv("GEMINI_FALLBACK_MODEL", "gemini-1.5-pro")
    GEMINI_TIMEOUT = int(os.getenv("GEMINI_TIMEOUT", "60"))
    GEMINI_MAX_RETRIES = int(os.getenv("GEMINI_MAX_RETRIES", "3"))

    # CORS: Restrict to known origins. Comma-separated in env.
    # Example: ALLOWED_ORIGINS=http://localhost:5000,http://localhost:5173
    ALLOWED_ORIGINS_RAW = os.getenv("ALLOWED_ORIGINS", "http://localhost:5000,http://localhost:5173,http://127.0.0.1:5000")
    ALLOWED_ORIGINS: list = [o.strip() for o in ALLOWED_ORIGINS_RAW.split(",") if o.strip()]

    # Internal Node.js API URL for callbacks
    NODE_API_URL = os.getenv("NODE_API_URL", "http://localhost:5000/api/v1")

settings = Settings()
