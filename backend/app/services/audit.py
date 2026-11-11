import logging

from fastapi import Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import AuditLog

logger = logging.getLogger("audit")

# Keys that must never be written to audit metadata.
_FORBIDDEN = {"password", "token", "password_hash", "input_snapshot", "email"}


def client_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    if settings.trust_proxy_headers:
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()[:64]
    return request.client.host[:64] if request.client else None


def record(db: Session, action: str, *, actor_id=None, resource_type=None,
           resource_id=None, request: Request | None = None, details: dict | None = None,
           commit: bool = True) -> None:
    clean = {k: v for k, v in (details or {}).items() if k not in _FORBIDDEN}
    db.add(AuditLog(actor_id=actor_id, action=action, resource_type=resource_type,
                    resource_id=str(resource_id) if resource_id else None,
                    ip=client_ip(request), details=clean or None))
    if commit:
        db.commit()
    logger.info("audit action=%s resource=%s/%s", action, resource_type, resource_id)
