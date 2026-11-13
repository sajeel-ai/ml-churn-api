import csv
import io
import uuid

from app.models import Customer

# API / model field name -> ORM column name
FEATURE_COLUMNS = {
    "gender": "gender", "SeniorCitizen": "senior_citizen", "Partner": "partner",
    "Dependents": "dependents", "tenure": "tenure", "PhoneService": "phone_service",
    "MultipleLines": "multiple_lines", "InternetService": "internet_service",
    "OnlineSecurity": "online_security", "OnlineBackup": "online_backup",
    "DeviceProtection": "device_protection", "TechSupport": "tech_support",
    "StreamingTV": "streaming_tv", "StreamingMovies": "streaming_movies",
    "Contract": "contract", "PaperlessBilling": "paperless_billing",
    "PaymentMethod": "payment_method", "MonthlyCharges": "monthly_charges",
    "TotalCharges": "total_charges",
}
FEATURES = list(FEATURE_COLUMNS)


def customer_features(c: Customer) -> dict:
    return {api: getattr(c, col) for api, col in FEATURE_COLUMNS.items()}


def to_columns(features: dict) -> dict:
    return {FEATURE_COLUMNS[k]: v for k, v in features.items() if k in FEATURE_COLUMNS}


def parse_uuid(value: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value))
    except ValueError:
        return None


_DANGEROUS = ("=", "+", "-", "@", "\t", "\r")


def csv_safe(value):
    """Neutralise spreadsheet formula injection in exported text cells."""
    if isinstance(value, str) and value and value[0] in _DANGEROUS:
        try:
            float(value)
            return value  # a plain number such as -5
        except ValueError:
            return "'" + value
    return value


def to_csv(header: list[str], rows: list[list]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    for r in rows:
        w.writerow([csv_safe(v) for v in r])
    return buf.getvalue()
