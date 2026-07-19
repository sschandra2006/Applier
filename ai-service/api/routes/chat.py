from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any
from services.gemini_service import generate_chat_stream

router = APIRouter()

class ChatRequest(BaseModel):
    message: str
    history: List[Dict[str, Any]] = []

@router.post("/stream")
async def chat_stream(request: ChatRequest):
    formatted_history = []
    for msg in request.history:
        role = "model" if msg.get("sender") == "AI" else "user"
        formatted_history.append({
            "role": role,
            "parts": [msg.get("content", "")]
        })
        
    return StreamingResponse(
        generate_chat_stream(formatted_history, request.message),
        media_type="text/event-stream"
    )
