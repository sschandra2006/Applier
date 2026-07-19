from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Dict, Any
from services.automation_engine import execute_automation

router = APIRouter()

class AutomationRequest(BaseModel):
    jobId: str
    targetUrl: str
    schema_def: Dict[str, Any] = Field(..., alias="schema")
    answers: Dict[str, Any]

@router.post("/execute")
async def execute_automation_endpoint(request: AutomationRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(
        execute_automation,
        request.jobId,
        request.targetUrl,
        request.schema_def,
        request.answers
    )
    return {"status": "success", "message": "Automation job started in background"}
