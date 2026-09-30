from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
from api.routes import execute
from core.llm_service import llm_service
from core.logger import setup_logger, correlation_id_ctx
from core.config import settings
from api.middlewares import CorrelationIdMiddleware
import datetime
from fastapi.responses import JSONResponse
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException


from contextlib import asynccontextmanager

logger = setup_logger("FastAPI")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail fast if AI service startup validation fails
    try:
        llm_service.startup_check()
        logger.info("Startup validation passed successfully.")
    except Exception as e:
        logger.fatal(f"AI Service failed to start: {str(e)}")
    yield

app = FastAPI(title="Applier AI Service", lifespan=lifespan)

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




app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Content-Type", "x-correlation-id", "Authorization"],
)

app.include_router(execute.router, prefix="/api/v1/ai", tags=["ai"])

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "ai-service"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
