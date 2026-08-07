from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Any, Dict
from core.orchestrator import orchestrator

router = APIRouter()

class AIExecuteRequest(BaseModel):
    intent: str
    conversation: list = []
    workflow: dict = {}
    user_profile: dict = {}
    documents: list = []
    portal_context: dict = {}
    raw_data: dict = {}

@router.post("/execute")
async def execute_ai(req: AIExecuteRequest):
    payload = req.model_dump()
    result = orchestrator.execute(payload)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Unknown error"))
    return result
