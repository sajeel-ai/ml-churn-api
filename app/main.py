import logging

from fastapi import FastAPI, HTTPException

from app.api.v1.router import router as v1_router
from app.core.config import settings
from app.core.logging_config import configure_logging
from app.model.loader import get_bundle
from app.schemas.prediction import CustomerData, PredictionResponse
from app.services.deps import get_prediction_service


configure_logging()

logger = logging.getLogger(__name__)


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version
)

app.include_router(v1_router)


# Fail fast at startup if the model, metadata or risk policy are inconsistent.
_bundle = get_bundle()
prediction_service = get_prediction_service()
model = _bundle.model
metadata = _bundle.metadata


logger.info(
    "Application started | environment=%s | model=%s | version=%s",
    settings.environment,
    metadata["model_type"],
    metadata["model_version"],
)


# ---------------------------------------------------------------------------
# Legacy endpoints (unchanged response shapes). Prefer /api/v1/*.
# ---------------------------------------------------------------------------

@app.get("/")
def root():

    return {
        "message": settings.app_name,
        "status": "running"
    }


@app.get("/health")
def health():

    return {
        "status": "healthy",
        "model": metadata["model_type"],
        "environment": settings.environment
    }


@app.post("/predict", response_model=PredictionResponse)
def predict(customer: CustomerData):

    try:

        result = prediction_service.predict(
            customer.model_dump()
        )

        logger.info(
            "Prediction completed | prediction=%s | probability=%.4f",
            result["prediction"],
            result["probability"]
        )

        return result

    except Exception as e:

        logger.exception("Prediction failed")

        raise HTTPException(
            status_code=500,
            detail="Prediction failed."
        ) from e
