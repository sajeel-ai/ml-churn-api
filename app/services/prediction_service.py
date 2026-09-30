from app.model.predictor import predict_churn


class PredictionService:

    def __init__(self, model, threshold):
        self.model = model
        self.threshold = threshold

    def predict(self, customer_data):
        return predict_churn(
            model=self.model,
            customer_data=customer_data,
            threshold=self.threshold
        )