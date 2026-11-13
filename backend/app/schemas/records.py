import uuid
from datetime import datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.prediction import CustomerData

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


class CustomerCreate(CustomerData):
    customer_identifier: str = Field(min_length=1, max_length=100)


class LatestPrediction(BaseModel):
    id: uuid.UUID
    probability: float
    risk_level: str
    predicted_label: str
    created_at: datetime


class CustomerOut(CustomerData):
    id: uuid.UUID
    customer_identifier: str
    created_at: datetime
    updated_at: datetime
    latest_prediction: LatestPrediction | None = None


class PredictionCreate(BaseModel):
    """Save a prediction for either an ad-hoc input or an existing customer."""
    input: CustomerData | None = None
    customer_id: uuid.UUID | None = None
    reference: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def _one_of(self):
        if (self.input is None) == (self.customer_id is None):
            raise ValueError("Provide exactly one of 'input' or 'customer_id'.")
        return self


class PredictionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer_id: uuid.UUID | None
    reference: str | None
    source: str
    prediction: int
    predicted_label: Literal["churn", "no_churn"]
    probability: float
    threshold: float
    risk_level: str
    model_version: str
    created_at: datetime


class PredictionDetail(PredictionOut):
    input: dict
    disclaimer: str
    explanation: dict | None = None


class DashboardOut(BaseModel):
    total_predictions: int
    high_risk: int
    medium_risk: int
    low_risk: int
    average_probability: float | None
    recent: list[PredictionOut]
    activity: list[dict]
    scope: str
