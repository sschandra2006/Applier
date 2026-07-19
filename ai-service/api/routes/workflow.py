from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any
from services.workflow_generator import generate_workflow

import logging

router = APIRouter()
logger = logging.getLogger("WorkflowAPI")

class WorkflowRequest(BaseModel):
    form_data: Dict[str, Any]

@router.post("/generate")
async def generate_workflow_endpoint(request: WorkflowRequest):
    try:
        schema = await generate_workflow(request.form_data)
        return {"status": "success", "schema": schema}
    except Exception:
        raise
