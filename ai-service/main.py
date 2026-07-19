from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
from api.routes import chat, rag, scanner, workflow, interview, documents, automation
from services.failure_analyzer import FailureAnalyzer

app = FastAPI(title="Applier AI Service")
failure_analyzer = FailureAnalyzer()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AnalyzeFailureRequest(BaseModel):
    logs: List[str]
    url: str

app.include_router(chat.router, prefix="/api/v1/chat", tags=["chat"])
app.include_router(rag.router, prefix="/api/v1/rag", tags=["rag"])
app.include_router(scanner.router, prefix="/api/v1/scanner", tags=["scanner"])
app.include_router(workflow.router, prefix="/api/v1/workflow", tags=["workflow"])
app.include_router(interview.router, prefix="/api/v1/interview", tags=["interview"])
app.include_router(documents.router, prefix="/api/v1/documents", tags=["documents"])
app.include_router(automation.router, prefix="/api/v1/automation", tags=["automation"])

@app.post("/api/v1/analyze-failure")
async def analyze_failure(req: AnalyzeFailureRequest):
    try:
        insight = failure_analyzer.analyze_failure(req.logs, req.url)
        return insight
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "ai-service"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
