from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):

    app_name: str = "Customer Churn Prediction API"
    app_version: str = "1.0.0"
    environment: str = "development"
    log_level: str = "INFO"

    model_path: str = "models/churn_model.joblib"
    metadata_path: str = "models/metadata.json"

    # Risk policy (business policy, NOT derived from the model).
    # Customers below the model's classification threshold are "low" risk,
    # customers from the model threshold up to this value are "medium",
    # and customers at or above this value are "high".
    # The default is a placeholder pending business approval.
    risk_high_threshold: float = 0.50

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @model_validator(mode="after")
    def _check_risk_threshold(self):
        if not 0.0 < self.risk_high_threshold < 1.0:
            raise ValueError("risk_high_threshold must be between 0 and 1")
        return self


settings = Settings()
