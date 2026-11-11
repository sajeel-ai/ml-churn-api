import math

import pytest
from pydantic import ValidationError

from app.schemas.prediction import CustomerData


def make(customer, **changes):
    return CustomerData(**{**customer, **changes})


def test_valid_customer(customer):
    assert make(customer).tenure == 12


@pytest.mark.parametrize("field,value", [
    ("gender", "Robot"),
    ("Contract", "Banana"),
    ("PaymentMethod", "Cash"),
    ("InternetService", "Satellite"),
    ("Partner", "Maybe"),
    ("SeniorCitizen", 2),
    ("tenure", -1),
    ("MonthlyCharges", -0.01),
    ("TotalCharges", -5),
    ("MonthlyCharges", math.inf),
    ("TotalCharges", math.nan),
])
def test_invalid_values_rejected(customer, field, value):
    with pytest.raises(ValidationError):
        make(customer, **{field: value})


def test_missing_field_rejected(customer):
    del customer["tenure"]
    with pytest.raises(ValidationError):
        CustomerData(**customer)


def test_no_phone_requires_no_phone_service_lines(customer):
    with pytest.raises(ValidationError):
        make(customer, PhoneService="No", MultipleLines="No")
    ok = make(customer, PhoneService="No", MultipleLines="No phone service")
    assert ok.MultipleLines == "No phone service"


def test_phone_yes_rejects_no_phone_service_lines(customer):
    with pytest.raises(ValidationError):
        make(customer, MultipleLines="No phone service")


def test_no_internet_requires_no_internet_addons(customer):
    with pytest.raises(ValidationError):
        make(customer, InternetService="No")
    no_net = {k: "No internet service" for k in (
        "OnlineSecurity", "OnlineBackup", "DeviceProtection",
        "TechSupport", "StreamingTV", "StreamingMovies")}
    assert make(customer, InternetService="No", **no_net).InternetService == "No"


def test_internet_rejects_no_internet_addon(customer):
    with pytest.raises(ValidationError):
        make(customer, TechSupport="No internet service")


def test_tenure_zero_allowed(customer):
    assert make(customer, tenure=0, TotalCharges=0).tenure == 0
