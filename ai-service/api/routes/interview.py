from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any
from services.interview_ai import process_interview_turn

router = APIRouter()

class InterviewRequest(BaseModel):
    state: Dict[str, Any]
    lastUserMessage: str

@router.post("/turn")
async def interview_turn_endpoint(request: InterviewRequest):
    try:
        result = await process_interview_turn(request.state, request.lastUserMessage)
        return {"status": "success", "data": result}
    except Exception:
        raise
