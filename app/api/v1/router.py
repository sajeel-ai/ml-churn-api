import logging

from fastapi import APIRouter, HTTPException, Response

from app.core.config import settings
from app.model.loader import get_bundle
from app.schemas.prediction import (
    CustomerData, HealthLive, HealthReady, PredictionV1Response,
)
from app.services.deps import get_prediction_service

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
def ready(response: Response):
    try:
        get_bundle()
        get_prediction_service()
        loaded, detail = True, None
    except Exception as exc:  # readiness must never raise
        logger.exception("Readiness check failed")
        loaded, detail = False, type(exc).__name__
        response.status_code = 503
    return {
        "status": "ready" if loaded else "not_ready",
        "model_loaded": loaded,
        "app_version": settings.app_version,
        "environment": settings.environment,
        "detail": detail,
    }


@router.get("/model", tags=["model"])
def model_info():
    bundle = get_bundle()
    info = {k: bundle.metadata[k] for k in _PUBLIC_MODEL_FIELDS
            if k in bundle.metadata}
    info["risk_policy"] = {
        "low": f"probability < {bundle.threshold}",
        "medium": f"{bundle.threshold} <= probability < {settings.risk_high_threshold}",
        "high": f"probability >= {settings.risk_high_threshold}",
        "note": "Business policy layered on the model output; not model-derived.",
    }
    info["artifact_sha256"] = bundle.artifact_sha256
    return info


@router.post("/predict", response_model=PredictionV1Response, tags=["predict"])
def predict(customer: CustomerData):
    try:
        result = get_prediction_service().predict_detailed(customer.model_dump())
    except Exception as exc:
        logger.exception("Prediction failed")
        raise HTTPException(status_code=500, detail="Prediction failed.") from exc

    logger.info(
        "Prediction completed | prediction=%s | risk=%s | probability=%.4f",
        result["prediction"], result["risk_level"], result["probability"],
    )
    return result
