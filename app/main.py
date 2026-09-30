import logging

from fastapi import FastAPI, HTTPException

from app.core.config import settings
from app.core.logging_config import configure_logging

from app.model.loader import load_model, load_metadata
from app.services.prediction_service import PredictionService
from app.schemas.prediction import CustomerData, PredictionResponse


configure_logging()

logger = logging.getLogger(__name__)


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version
)


model = load_model()
metadata = load_metadata()


prediction_service = PredictionService(
    model=model,
    threshold=metadata["threshold"]
)


logger.info(
    "Application started | environment=%s | model=%s",
    settings.environment,
    metadata["model_type"]
)


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