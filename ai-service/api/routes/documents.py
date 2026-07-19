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
        return {"status": "success", "message": f"Saved document to {file_path}", "docId": str(doc.id)}
    except Exception:
        raise
