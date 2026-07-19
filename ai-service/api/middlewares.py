from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
import uuid
from core.logger import correlation_id_ctx

class CorrelationIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        correlation_id = request.headers.get('x-correlation-id', str(uuid.uuid4()))
        correlation_id_ctx.set(correlation_id)
        
        response = await call_next(request)
        response.headers['x-correlation-id'] = correlation_id
        return response
