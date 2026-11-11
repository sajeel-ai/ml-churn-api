from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

# Allowed categorical values. These mirror the categories the trained
# OneHotEncoder was fitted on (verified against models/churn_model.joblib).
# The pipeline itself uses handle_unknown="ignore", which would silently
# accept invalid values, so the API contract enforces them explicitly.
YesNo = Literal["Yes", "No"]
YesNoNoInternet = Literal["Yes", "No", "No internet service"]
Gender = Literal["Female", "Male"]
MultipleLines = Literal["Yes", "No", "No phone service"]
InternetService = Literal["DSL", "Fiber optic", "No"]
Contract = Literal["Month-to-month", "One year", "Two year"]
PaymentMethod = Literal[
    "Bank transfer (automatic)",
    "Credit card (automatic)",
    "Electronic check",
    "Mailed check",
]

INTERNET_ADDONS = (
    "OnlineSecurity",
    "OnlineBackup",
    "DeviceProtection",
    "TechSupport",
    "StreamingTV",
    "StreamingMovies",
)


class CustomerData(BaseModel):
    gender: Gender
    SeniorCitizen: int = Field(ge=0, le=1)
    Partner: YesNo
    Dependents: YesNo
    tenure: int = Field(ge=0)

    PhoneService: YesNo
    MultipleLines: MultipleLines
    InternetService: InternetService
    OnlineSecurity: YesNoNoInternet
    OnlineBackup: YesNoNoInternet
    DeviceProtection: YesNoNoInternet
    TechSupport: YesNoNoInternet
    StreamingTV: YesNoNoInternet
    StreamingMovies: YesNoNoInternet

    Contract: Contract
    PaperlessBilling: YesNo
    PaymentMethod: PaymentMethod

    MonthlyCharges: float = Field(ge=0, allow_inf_nan=False)
    # Blank only for brand-new customers (tenure 0), as in the training data;
    # the trained pipeline then applies its fitted median imputation.
    TotalCharges: float | None = Field(default=None, ge=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def _check_service_dependencies(self):
        """Enforce the dependency rules present in the training data."""
        if self.TotalCharges is None and self.tenure != 0:
            raise ValueError("TotalCharges is required unless tenure is 0")
        if self.PhoneService == "No" and self.MultipleLines != "No phone service":
            raise ValueError(
                "MultipleLines must be 'No phone service' when PhoneService is 'No'"
            )
        if self.PhoneService == "Yes" and self.MultipleLines == "No phone service":
            raise ValueError(
                "MultipleLines cannot be 'No phone service' when PhoneService is 'Yes'"
            )

        for field in INTERNET_ADDONS:
            value = getattr(self, field)
            if self.InternetService == "No" and value != "No internet service":
                raise ValueError(
                    f"{field} must be 'No internet service' when InternetService is 'No'"
                )
            if self.InternetService != "No" and value == "No internet service":
                raise ValueError(
                    f"{field} cannot be 'No internet service' when the customer has internet service"
                )
        return self


# Legacy response, kept unchanged for POST /predict.
class PredictionResponse(BaseModel):
    prediction: int = Field(ge=0, le=1)
    probability: float = Field(ge=0, le=1)


RiskLevel = Literal["low", "medium", "high"]


class PredictionV1Response(BaseModel):
    prediction: int = Field(ge=0, le=1)
    predicted_label: Literal["churn", "no_churn"]
    probability: float = Field(ge=0, le=1)
    risk_level: RiskLevel
    threshold: float
    risk_high_threshold: float
    model_version: str
    predicted_at: datetime
    warnings: list[str]
    disclaimer: str
    explanation: dict | None = None


class HealthLive(BaseModel):
    status: Literal["ok"]


class HealthReady(BaseModel):
    status: Literal["ready", "not_ready"]
    model_loaded: bool
    app_version: str
    environment: str
    detail: str | None = None
