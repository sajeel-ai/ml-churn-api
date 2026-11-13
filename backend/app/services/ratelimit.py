from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.base import utcnow
from app.models import AttemptLog


def count_recent(db: Session, kind: str, key: str, window: timedelta,
                 only_failures: bool = False) -> int:
    q = select(func.count()).select_from(AttemptLog).where(
        AttemptLog.kind == kind, AttemptLog.key == key,
        AttemptLog.created_at >= utcnow() - window)
    if only_failures:
        q = q.where(AttemptLog.success.is_(False))
    return db.scalar(q) or 0


def log_attempt(db: Session, kind: str, key: str, success: bool = False) -> None:
    db.add(AttemptLog(kind=kind, key=key[:254], success=success))
    db.commit()


def enforce(db: Session, kind: str, key: str, limit: int, window: timedelta,
            only_failures: bool = False) -> None:
    if count_recent(db, kind, key, window, only_failures) >= limit:
        raise HTTPException(
            status_code=429,
            detail="Too many attempts. Please wait and try again later.",
            headers={"Retry-After": str(int(window.total_seconds()))})


def purge_old(db: Session, older_than: timedelta = timedelta(days=2)) -> None:
    from sqlalchemy import delete
    db.execute(delete(AttemptLog).where(AttemptLog.created_at < utcnow() - older_than))
    db.commit()
