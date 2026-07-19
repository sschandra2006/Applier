from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.scanner_service import scan_url

router = APIRouter()

class ScanRequest(BaseModel):
    url: str

@router.post("/scan")
async def scan_endpoint(request: ScanRequest):
    if not request.url.startswith("http"):
        raise HTTPException(status_code=400, detail="URL must start with http or https")
        
    try:
        result = await scan_url(request.url)
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to scan URL: {str(e)}")
