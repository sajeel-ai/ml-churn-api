from datetime import datetime, timezone

from app.model.predictor import predict_churn
from app.services.risk import classify_risk

DISCLAIMER = (
    "Predicted probability is a model estimate, not a guarantee that the "
    "customer will churn."
)


class PredictionService:

    def __init__(self, model, threshold, high_threshold=None,
                 model_version="unknown", training_ranges=None):
        self.model = model
        self.threshold = threshold
        self.high_threshold = high_threshold
        self.model_version = model_version
        self.training_ranges = training_ranges or {}

    def predict(self, customer_data):
        return predict_churn(
            model=self.model,
            customer_data=customer_data,
            threshold=self.threshold
        )

    def range_warnings(self, customer_data):
        """Flag numeric inputs outside the range seen during training."""
        warnings = []
        for field, bounds in self.training_ranges.items():
            value = customer_data.get(field)
            if value is None:
                continue
            if value < bounds["min"] or value > bounds["max"]:
                warnings.append(
                    f"{field}={value} is outside the training data range "
                    f"[{bounds['min']}, {bounds['max']}]; the prediction "
                    "may be less reliable."
                )
        return warnings

    def predict_detailed(self, customer_data):
        result = self.predict(customer_data)
        probability = result["probability"]
        return {
            "prediction": result["prediction"],
            "predicted_label": "churn" if result["prediction"] else "no_churn",
            "probability": probability,
            "risk_level": classify_risk(
                probability, self.threshold, self.high_threshold
            ),
            "threshold": self.threshold,
            "risk_high_threshold": self.high_threshold,
            "model_version": self.model_version,
            "predicted_at": datetime.now(timezone.utc),
            "warnings": self.range_warnings(customer_data),
            "disclaimer": DISCLAIMER,
        }
