import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    PROJECT_NAME = "Applier AI Service"
    LLM_PROVIDER = os.getenv("LLM_PROVIDER", "huggingface")
    HF_TOKEN = os.getenv("HF_TOKEN", os.getenv("LLM_API_KEY", ""))
    LLM_API_KEY = os.getenv("LLM_API_KEY", os.getenv("HF_TOKEN", ""))
    LLM_BASE_URL = os.getenv("LLM_BASE_URL", "")
    HF_MODEL = os.getenv("HF_MODEL", "Qwen/Qwen2.5-7B-Instruct")
    HF_FALLBACK_MODEL = os.getenv("HF_FALLBACK_MODEL", "Qwen/Qwen2.5-72B-Instruct")
    EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    LLM_TIMEOUT = int(os.getenv("LLM_TIMEOUT", "60"))
    LLM_MAX_RETRIES = int(os.getenv("LLM_MAX_RETRIES", "3"))


    # CORS: Restrict to known origins. Comma-separated in env.
    # Example: ALLOWED_ORIGINS=http://localhost:5000,http://localhost:5173
    ALLOWED_ORIGINS_RAW = os.getenv("ALLOWED_ORIGINS", "http://localhost:5000,http://localhost:5173,http://127.0.0.1:5000")
    ALLOWED_ORIGINS: list = [o.strip() for o in ALLOWED_ORIGINS_RAW.split(",") if o.strip()]

    # Internal Node.js API URL for callbacks
    NODE_API_URL = os.getenv("NODE_API_URL", "http://localhost:5000/api/v1")

settings = Settings()

