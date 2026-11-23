import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.requests import Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware

from app.api.router import api_router
from app.core.config import get_settings
from app.core.database import DatabaseConfigurationError

logger = logging.getLogger(__name__)
settings = get_settings()

app = FastAPI(
    title="BioPrice BI API",
    version="0.1.0",
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url=None,
    openapi_url="/openapi.json" if settings.environment != "production" else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)

if settings.environment == "production":
    app.add_middleware(HTTPSRedirectMiddleware)


@app.exception_handler(OperationalError)
async def database_unavailable_handler(
    request: Request,
    exc: OperationalError,
) -> JSONResponse:
    logger.error("Database operation unavailable (%s).", type(exc).__name__)
    return JSONResponse(
        status_code=503,
        content={"detail": "El servicio de autenticación no está disponible temporalmente."},
    )


@app.exception_handler(DatabaseConfigurationError)
async def database_not_configured_handler(
    request: Request,
    exc: DatabaseConfigurationError,
) -> JSONResponse:
    logger.error("Database service is not configured (%s).", type(exc).__name__)
    return JSONResponse(
        status_code=503,
        content={"detail": "El servicio de autenticación no está disponible temporalmente."},
    )


app.include_router(api_router, prefix="/api")
