import pandas as pd 


def predict_churn(model, customer_data, threshold):
    """
    Generate churn prediction and probability.
    """

    data = pd.DataFrame([customer_data])

    probability = model.predict_proba(data)[0, 1]

    prediction = int(probability >= threshold)

    return {
        "prediction": prediction,
        "probability": float(probability)
    }