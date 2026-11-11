import logging
from contextlib import asynccontextmanager
from datetime import timedelta

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from sqlalchemy import delete

from app.api.v1.router import router as v1_router
from app.core.config import settings
from app.core.logging_config import configure_logging
from app.db import session as dbsession
from app.db.base import utcnow
from app.model.loader import get_bundle
from app.models import AuditLog
from app.schemas.prediction import CustomerData, PredictionResponse
from app.services import ratelimit
from app.services.deps import get_prediction_service

configure_logging()

logger = logging.getLogger(__name__)

# Fail fast at startup if the model, metadata or risk policy are inconsistent.
_bundle = get_bundle()
prediction_service = get_prediction_service()
model = _bundle.model
metadata = _bundle.metadata


@asynccontextmanager
async def lifespan(app: FastAPI):
    dbsession.init_engine() if dbsession.SessionLocal is None else None
    if settings.email_backend == "console" and settings.is_production:
        logger.warning("EMAIL_BACKEND=console in production: password reset emails "
                       "will NOT be delivered. Configure SMTP.")
    try:  # housekeeping: attempt logs and audit retention
        with dbsession.SessionLocal() as db:
            ratelimit.purge_old(db)
            db.execute(delete(AuditLog).where(
                AuditLog.created_at < utcnow() - timedelta(days=settings.audit_retention_days)))
            db.commit()
    except Exception:
        logger.exception("Startup housekeeping skipped")
    yield


app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan,
              docs_url=None if settings.is_production else "/docs",
              redoc_url=None if settings.is_production else "/redoc",
              openapi_url=None if settings.is_production else "/openapi.json")

if settings.hosts and settings.hosts != ["*"]:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.hosts)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


app.include_router(v1_router)

logger.info("Application started | environment=%s | model=%s | version=%s",
            settings.environment, metadata["model_type"], metadata["model_version"])


# ---------------------------------------------------------------------------
# Legacy endpoints (unchanged response shapes). Unauthenticated, so they are
# disabled by default in production (LEGACY_ENDPOINTS_ENABLED).
# ---------------------------------------------------------------------------
if settings.legacy_enabled:

    @app.get("/")
    def root():
        return {"message": settings.app_name, "status": "running"}

    @app.get("/health")
    def health():
        return {"status": "healthy", "model": metadata["model_type"],
                "environment": settings.environment}

    @app.post("/predict", response_model=PredictionResponse)
    def predict(customer: CustomerData):
        try:
            result = prediction_service.predict(customer.model_dump())
            logger.info("Prediction completed | prediction=%s | probability=%.4f",
                        result["prediction"], result["probability"])
            return result
        except Exception as e:
            logger.exception("Prediction failed")
            raise HTTPException(status_code=500, detail="Prediction failed.") from e
