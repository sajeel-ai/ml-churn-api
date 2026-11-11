import logging

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, auth_ctx
from app.api.v1 import admin, auth, bulk, customers, predictions
from app.core.config import settings
from app.db.session import get_db
from app.model.loader import get_bundle
from app.models import ModelVersion
from app.schemas.prediction import HealthLive, HealthReady
from app.services.deps import get_prediction_service
from app.services.model_registry import sync_model_versions

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1")

# Fields of metadata.json that are safe to expose publicly.
_PUBLIC_MODEL_FIELDS = (
    "model_version", "model_type", "algorithm", "preprocessing", "threshold",
    "target", "features", "categorical_values", "training_ranges",
    "training_dataset", "evaluation", "metrics", "calibration_evaluated",
    "intended_use", "limitations", "last_updated", "calibration",
)


@router.get("/health/live", response_model=HealthLive, tags=["health"])
def live():
    return {"status": "ok"}


@router.get("/health/ready", response_model=HealthReady, tags=["health"])
def ready(response: Response, db: Session = Depends(get_db)):
    detail = None
    try:
        get_bundle()
        get_prediction_service()
        from sqlalchemy import text
        db.execute(text("select 1"))
        loaded = True
    except Exception as exc:  # readiness must never raise
        logger.exception("Readiness check failed")
        loaded, detail = False, type(exc).__name__
        response.status_code = 503
    return {"status": "ready" if loaded else "not_ready", "model_loaded": loaded,
            "app_version": settings.app_version, "environment": settings.environment,
            "detail": detail}


@router.get("/model", tags=["model"])
def model_info():
    bundle = get_bundle()
    info = {k: bundle.metadata[k] for k in _PUBLIC_MODEL_FIELDS if k in bundle.metadata}
    info["risk_policy"] = {
        "low": f"probability < {bundle.threshold}",
        "medium": f"{bundle.threshold} <= probability < {settings.risk_high_threshold}",
        "high": f"probability >= {settings.risk_high_threshold}",
        "note": "Business policy layered on the model output; not model-derived.",
    }
    info["risk_high_threshold"] = settings.risk_high_threshold
    info["artifact_sha256"] = bundle.artifact_sha256
    return info


@router.get("/model/versions", tags=["model"])
def model_versions(ctx: AuthContext = Depends(auth_ctx), db: Session = Depends(get_db)):
    sync_model_versions(db)
    rows = db.scalars(select(ModelVersion).order_by(ModelVersion.created_at.desc())).all()
    out = []
    for v in rows:
        m = v.model_metadata or {}
        out.append({"version": v.version, "status": v.status,
                    "created_at": v.created_at, "activated_at": v.activated_at,
                    "metrics": m.get("metrics"), "threshold": m.get("threshold"),
                    "artifact_sha256": v.artifact_sha256,
                    "note": ("Metrics for this version were tuned on the same test split."
                             if v.version == "1.0.0" else None)})
    return out


router.include_router(auth.router)
router.include_router(customers.router)
router.include_router(predictions.router)
router.include_router(bulk.router)
router.include_router(admin.router)
