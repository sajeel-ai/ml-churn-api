def classify_risk(probability: float, threshold: float, high_threshold: float) -> str:
    """Map a churn probability to a risk level using the configured policy.

    low    : probability < model classification threshold
    medium : threshold <= probability < high_threshold
    high   : probability >= high_threshold

    This is a business policy layered on the model output. It does not
    imply the probability is calibrated.
    """
    if probability >= high_threshold:
        return "high"
    if probability >= threshold:
        return "medium"
    return "low"
