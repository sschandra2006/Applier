from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
from api.routes import chat, rag, scanner, workflow, interview, documents, automation
from services.failure_analyzer import FailureAnalyzer
from core.llm_service import llm_service
from core.logger import setup_logger, correlation_id_ctx
from api.middlewares import CorrelationIdMiddleware
import datetime
from fastapi.responses import JSONResponse
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = setup_logger("FastAPI")

app = FastAPI(title="Applier AI Service")

app.add_middleware(CorrelationIdMiddleware)

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    c_id = correlation_id_ctx.get()
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": {
                "code": "HTTP_ERROR",
                "message": getattr(exc, "detail", "HTTP Error"),
                "details": str(exc),
                "requestId": c_id,
                "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
                "retryable": False
            }
        }
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    c_id = correlation_id_ctx.get()
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Invalid request parameters.",
                "details": exc.errors(),
                "requestId": c_id,
                "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
                "retryable": False
            }
        }
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled Exception: {str(exc)}", exc_info=exc)
    c_id = correlation_id_ctx.get()
    
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected error occurred in the AI Service.",
                "details": str(exc),
                "requestId": c_id,
                "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
                "retryable": False
            }
        }
    )

@app.on_event("startup")
async def startup_event():
    # Fail fast if Gemini is completely broken or out of credits
    try:
        llm_service.startup_check()
        logger.info("Startup validation passed successfully.")
    except Exception as e:
        logger.fatal(f"AI Service failed to start: {str(e)}")
        import sys
        sys.exit(1)

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
