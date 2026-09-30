from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):

    app_name: str = "Customer Churn Prediction API"
    app_version: str = "1.0.0"
    environment: str = "development"
    log_level: str = "INFO"

    model_path: str = "models/churn_model.joblib"
    metadata_path: str = "models/metadata.json"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()