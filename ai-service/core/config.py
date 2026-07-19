import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    PROJECT_NAME = "Applier AI Service"
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

settings = Settings()
