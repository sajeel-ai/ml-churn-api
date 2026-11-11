from functools import lru_cache

from app.core.config import settings
from app.model.loader import get_bundle
from app.services.prediction_service import PredictionService


@lru_cache(maxsize=1)
def get_prediction_service() -> PredictionService:
    bundle = get_bundle()
    high = settings.risk_high_threshold
    if high <= bundle.threshold:
        raise ValueError(
            "risk_high_threshold must be greater than the model threshold "
            f"({bundle.threshold})"
        )
    return PredictionService(
        model=bundle.model,
        threshold=bundle.threshold,
        high_threshold=high,
        model_version=bundle.version,
        training_ranges=bundle.metadata.get("training_ranges", {}),
    )
