import uuid
from datetime import datetime

from sqlalchemy import (BigInteger, Boolean, CheckConstraint, Float, ForeignKey,
                        Index, Integer, String, Text, UniqueConstraint, Uuid)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, JSONType, UTCDateTime, utcnow

ROLES = ("admin", "analyst", "viewer")
RISK_LEVELS = ("low", "medium", "high")


def _id():
    return mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role in ('admin','analyst','viewer')", name="role_valid"),
    )

    id: Mapped[uuid.UUID] = _id()
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)  # stored lowercase
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="analyst")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    # A viewer reads (read-only) the records owned by this analyst.
    viewer_of_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)


class UserSession(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = _id()
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    last_seen_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(300), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)

    user: Mapped[User] = relationship()


class AuthToken(Base):
    """Single-use tokens for password reset and email verification."""
    __tablename__ = "auth_tokens"
    __table_args__ = (
        CheckConstraint("purpose in ('reset','verify')", name="purpose_valid"),
    )

    id: Mapped[uuid.UUID] = _id()
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    purpose: Mapped[str] = mapped_column(String(10))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    used_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class AttemptLog(Base):
    """Rows used for rate limiting (login / register / reset)."""
    __tablename__ = "attempt_logs"
    __table_args__ = (
        Index("ix_attempt_kind_key_time", "kind", "key", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"),
                                    primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(20))
    key: Mapped[str] = mapped_column(String(254))  # email or ip, prefixed
    success: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class Customer(Base):
    __tablename__ = "customers"
    __table_args__ = (
        UniqueConstraint("owner_id", "customer_identifier", name="owner_identifier"),
        CheckConstraint("tenure >= 0", name="tenure_nonneg"),
        CheckConstraint("monthly_charges >= 0", name="monthly_nonneg"),
        Index("ix_customers_owner_created", "owner_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = _id()
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"))
    customer_identifier: Mapped[str] = mapped_column(String(100))

    gender: Mapped[str] = mapped_column(String(10))
    senior_citizen: Mapped[int] = mapped_column(Integer)
    partner: Mapped[str] = mapped_column(String(3))
    dependents: Mapped[str] = mapped_column(String(3))
    tenure: Mapped[int] = mapped_column(Integer)
    phone_service: Mapped[str] = mapped_column(String(3))
    multiple_lines: Mapped[str] = mapped_column(String(20))
    internet_service: Mapped[str] = mapped_column(String(12))
    online_security: Mapped[str] = mapped_column(String(25))
    online_backup: Mapped[str] = mapped_column(String(25))
    device_protection: Mapped[str] = mapped_column(String(25))
    tech_support: Mapped[str] = mapped_column(String(25))
    streaming_tv: Mapped[str] = mapped_column(String(25))
    streaming_movies: Mapped[str] = mapped_column(String(25))
    contract: Mapped[str] = mapped_column(String(20))
    paperless_billing: Mapped[str] = mapped_column(String(3))
    payment_method: Mapped[str] = mapped_column(String(30))
    monthly_charges: Mapped[float] = mapped_column(Float)
    total_charges: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (
        CheckConstraint("status in ('pending','running','completed','failed')",
                        name="status_valid"),
    )

    id: Mapped[uuid.UUID] = _id()
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(30), default="bulk_prediction")
    status: Mapped[str] = mapped_column(String(15), default="pending")
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    total_rows: Mapped[int] = mapped_column(Integer, default=0)
    processed_rows: Mapped[int] = mapped_column(Integer, default=0)
    invalid_rows: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    input_csv: Mapped[str | None] = mapped_column(Text, nullable=True)   # cleared when done
    result_csv: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)


class Prediction(Base):
    __tablename__ = "predictions"
    __table_args__ = (
        CheckConstraint("churn_probability >= 0 and churn_probability <= 1",
                        name="probability_range"),
        CheckConstraint("risk_level in ('low','medium','high')", name="risk_valid"),
        Index("ix_predictions_user_created", "user_id", "created_at"),
        Index("ix_predictions_user_risk", "user_id", "risk_level"),
    )

    id: Mapped[uuid.UUID] = _id()
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"))
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True)
    job_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True, index=True)
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    source: Mapped[str] = mapped_column(String(10), default="single")  # single|customer|bulk
    predicted_class: Mapped[int] = mapped_column(Integer)
    churn_probability: Mapped[float] = mapped_column(Float)
    threshold: Mapped[float] = mapped_column(Float)
    risk_level: Mapped[str] = mapped_column(String(10))
    model_version: Mapped[str] = mapped_column(String(30))
    input_snapshot: Mapped[dict] = mapped_column(JSONType)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class ModelVersion(Base):
    __tablename__ = "model_versions"
    __table_args__ = (
        CheckConstraint("status in ('active','archived')", name="status_valid"),
    )

    id: Mapped[uuid.UUID] = _id()
    version: Mapped[str] = mapped_column(String(30), unique=True)
    artifact_path: Mapped[str] = mapped_column(String(300))
    artifact_sha256: Mapped[str] = mapped_column(String(64))
    model_metadata: Mapped[dict] = mapped_column("metadata", JSONType)
    status: Mapped[str] = mapped_column(String(10), default="archived")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    activated_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_created", "created_at"),
        Index("ix_audit_action_created", "action", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"),
                                    primary_key=True, autoincrement=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(60))
    resource_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    resource_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    details: Mapped[dict | None] = mapped_column("metadata", JSONType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
