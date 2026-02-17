import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi import HTTPException
from sqlalchemy import select

from app.api.routes.auth import router as auth_router
from app.api.routes.users import router as users_router
from app.core.errors import create_error_response
from app.db.session import get_db_session
from app.schemas.common import HealthResponse
from app.services.startup import initialize_service


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [request_id=%(request_id)s] %(message)s",
)
logger = logging.getLogger("svc_authentication")


class RequestIdAdapter(logging.LoggerAdapter):
    def process(self, msg, kwargs):
        extra = kwargs.setdefault("extra", {})
        extra.setdefault("request_id", self.extra.get("request_id", "-"))
        return msg, kwargs


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_service()
    yield


app = FastAPI(title="svc_authentication", lifespan=lifespan)


@app.middleware("http")
async def request_id_logging_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id", "-")
    request.state.request_id = request_id
    request_logger = RequestIdAdapter(logger, {"request_id": request_id})
    request_logger.info("Incoming %s %s", request.method, request.url.path)
    response = await call_next(request)
    response.headers["X-Request-Id"] = request_id
    return response


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return create_error_response(
        status.HTTP_400_BAD_REQUEST,
        "validation_error",
        "Invalid request payload",
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    if isinstance(exc.detail, dict):
        code = str(exc.detail.get("code", "http_error"))
        message = str(exc.detail.get("message", "Request failed"))
    else:
        code = "http_error"
        message = str(exc.detail)

    return create_error_response(exc.status_code, code, message)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", "-")
    RequestIdAdapter(logger, {"request_id": request_id}).exception("Unhandled server error")
    return create_error_response(
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "internal_error",
        "Unexpected server error",
    )


app.include_router(auth_router)
app.include_router(users_router)


@app.get("/health", response_model=HealthResponse)
def health():
    with get_db_session() as db:
        db.execute(select(1))
    return HealthResponse(status="ok", service="svc_authentication", db="ok")
