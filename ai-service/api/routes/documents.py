from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.document_processor.manager import manager

router = APIRouter()

class ExtractRequest(BaseModel):
    fileUrl: str
    expectedType: str
    mimeType: str

@router.post("/extract")
async def extract_document(request: ExtractRequest):
    try:
        result = await manager.process(request.fileUrl, request.expectedType, request.mimeType)
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
