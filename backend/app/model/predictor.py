import math

import pandas as pd


def _clean(record):
    row = dict(record)
    if row.get("TotalCharges") is None:
        row["TotalCharges"] = math.nan  # handled by the pipeline's fitted imputer
    return row


def predict_churn(model, customer_data, threshold):
    """
    Generate churn prediction and probability.
    """

    data = pd.DataFrame([_clean(customer_data)])

    probability = model.predict_proba(data)[0, 1]

    prediction = int(probability >= threshold)

    return {
        "prediction": prediction,
        "probability": float(probability)
    }


def predict_churn_batch(model, records, threshold):
    """Vectorised predictions for many records (same pipeline, same threshold)."""
    if not records:
        return []
    data = pd.DataFrame([_clean(r) for r in records])
    probs = model.predict_proba(data)[:, 1]
    return [{"prediction": int(p >= threshold), "probability": float(p)} for p in probs]
