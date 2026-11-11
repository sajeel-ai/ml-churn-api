from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):

    app_name: str = "Customer Churn Intelligence Platform API"
    app_version: str = "1.1.0"
    environment: str = "development"  # development | test | production
    log_level: str = "INFO"

    model_path: str = "models/churn_model.joblib"
    metadata_path: str = "models/metadata.json"

    # Risk policy (business policy, NOT derived from the model).
    # low < model threshold <= medium < risk_high_threshold <= high.
    # With the measured calibration (ECE 0.018) 0.50 means roughly even odds.
    risk_high_threshold: float = 0.50

    # --- Database -----------------------------------------------------
    database_url: str = "sqlite:///./churn_dev.db"

    # --- Sessions / cookies ---------------------------------------------
    session_cookie_name: str = "churn_session"
    csrf_cookie_name: str = "churn_csrf"
    session_ttl_hours: int = 12
    remember_me_days: int = 30
    cookie_secure: bool = False
    cookie_samesite: str = "lax"

    # Origins allowed to make state-changing requests (checked when an
    # Origin header is present). Comma separated.
    allowed_origins: str = "http://localhost:3000"
    allowed_hosts: str = "*"
    trust_proxy_headers: bool = False

    # --- Password hashing (Argon2id; defaults follow OWASP minimums) -------
    argon2_time_cost: int = 2
    argon2_memory_cost: int = 19456
    argon2_parallelism: int = 1

    # --- Abuse protection ------------------------------------------------
    login_max_failures_per_email: int = 5
    login_max_failures_per_ip: int = 20
    login_window_minutes: int = 15
    register_max_per_ip_per_hour: int = 10
    reset_max_per_email_per_hour: int = 5

    # --- Email -------------------------------------------------------------
    email_backend: str = "console"  # console (dev only) | smtp
    email_from: str = "no-reply@example.com"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    frontend_base_url: str = "http://localhost:3000"
    require_email_verification: bool = False
    reset_token_ttl_minutes: int = 30
    verify_token_ttl_hours: int = 48

    # --- Bulk prediction --------------------------------------------------
    bulk_max_rows: int = 5000
    bulk_max_upload_bytes: int = 5 * 1024 * 1024

    # --- Data retention ----------------------------------------------------
    audit_retention_days: int = 365

    # None = auto (enabled outside production). The unauthenticated legacy
    # /predict endpoint must not be exposed on a public deployment.
    legacy_endpoints_enabled: bool | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @model_validator(mode="after")
    def _validate(self):
        if not 0.0 < self.risk_high_threshold < 1.0:
            raise ValueError("risk_high_threshold must be between 0 and 1")
        if self.environment == "production":
            if not self.cookie_secure:
                raise ValueError("COOKIE_SECURE must be true in production")
            if self.database_url.startswith("sqlite"):
                raise ValueError("DATABASE_URL must be PostgreSQL in production")
        return self

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def legacy_enabled(self) -> bool:
        if self.legacy_endpoints_enabled is None:
            return not self.is_production
        return self.legacy_endpoints_enabled

    @property
    def origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def hosts(self) -> list[str]:
        return [h.strip() for h in self.allowed_hosts.split(",") if h.strip()]

    @property
    def sqlalchemy_url(self) -> str:
        url = self.database_url
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        if url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://"):]
        return url


settings = Settings()
