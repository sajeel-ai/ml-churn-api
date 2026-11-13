import math
import secrets
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, admin_only
from app.core.config import settings
from app.db.base import utcnow
from app.db.session import get_db
from app.model.loader import get_bundle
from app.models import AuditLog, ModelVersion, Prediction, User
from app.schemas.admin import (AdminCreateUser, AuditLogOut, RoleUpdate, StatusUpdate,
                               ViewerAssignment)
from app.schemas.auth import UserOut
from app.schemas.records import Page
from app.services import audit, auth_service as svc
from app.services.email import send_reset_email
from app.services.records import parse_uuid

router = APIRouter(prefix="/admin", tags=["admin"])


def _user(db: Session, user_id: str) -> User:
    uid = parse_uuid(user_id)
    u = db.get(User, uid) if uid else None
    if u is None:
        raise HTTPException(404, "User not found.")
    return u


@router.get("/overview")
def overview(ctx: AuthContext = Depends(admin_only), db: Session = Depends(get_db)):
    """Aggregate platform statistics only; no private customer records."""
    day_ago = utcnow() - timedelta(hours=24)
    week_ago = utcnow() - timedelta(days=7)
    count = lambda stmt: db.scalar(stmt) or 0  # noqa: E731
    versions = db.scalars(select(ModelVersion).order_by(ModelVersion.created_at)).all()
    return {
        "registered_users": count(select(func.count()).select_from(User)),
        "active_users": count(select(func.count()).select_from(User).where(User.is_active.is_(True))),
        "users_by_role": dict(db.execute(select(User.role, func.count()).group_by(User.role)).all()),
        "total_predictions": count(select(func.count()).select_from(Prediction)),
        "predictions_last_7d": count(select(func.count()).select_from(Prediction)
                                     .where(Prediction.created_at >= week_ago)),
        "failed_logins_24h": count(select(func.count()).select_from(AuditLog).where(
            AuditLog.action == "login_failed", AuditLog.created_at >= day_ago)),
        "model_versions": [{"version": v.version, "status": v.status} for v in versions],
        "app_version": settings.app_version,
        "environment": settings.environment,
    }


@router.get("/system")
def system_status(ctx: AuthContext = Depends(admin_only), db: Session = Depends(get_db)):
    try:
        db.execute(text("select 1"))
        database = "ok"
    except Exception:
        database = "error"
    try:
        bundle = get_bundle()
        model = {"loaded": True, "version": bundle.version}
    except Exception:
        model = {"loaded": False, "version": None}
    return {"api": "ok", "database": database, "model": model,
            "app_version": settings.app_version, "environment": settings.environment,
            "email_backend": settings.email_backend}


@router.get("/users", response_model=Page[UserOut])
def list_users(q: str | None = Query(None, max_length=100), role: str | None = None,
               is_active: bool | None = None, page: int = Query(1, ge=1),
               page_size: int = Query(20, ge=1, le=100),
               ctx: AuthContext = Depends(admin_only), db: Session = Depends(get_db)):
    stmt = select(User)
    if q:
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(func.lower(User.email).like(like) | func.lower(User.name).like(like))
    if role:
        stmt = stmt.where(User.role == role)
    if is_active is not None:
        stmt = stmt.where(User.is_active.is_(is_active))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(User.created_at.desc())
                      .offset((page - 1) * page_size).limit(page_size)).all()
    return Page(items=[UserOut.model_validate(u) for u in rows], total=total, page=page,
                page_size=page_size, pages=max(1, math.ceil(total / page_size)))


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(body: AdminCreateUser, request: Request, background: BackgroundTasks,
                ctx: AuthContext = Depends(admin_only), db: Session = Depends(get_db)):
    if svc.get_user_by_email(db, str(body.email)):
        raise HTTPException(409, "An account with this email already exists.")
    # Random unusable password; the person sets their own via the emailed link.
    try:
        user = svc.create_user(db, name=body.name, email=str(body.email),
                               password=secrets.token_urlsafe(24), role=body.role)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "An account with this email already exists.")
    token = svc.issue_token(db, user, "reset")
    background.add_task(send_reset_email, user.email, token)
    audit.record(db, "user_created", actor_id=ctx.user.id, resource_type="user",
                 resource_id=user.id, request=request, details={"role": body.role})
    return user


@router.patch("/users/{user_id}/role", response_model=UserOut)
def set_role(user_id: str, body: RoleUpdate, request: Request,
             ctx: AuthContext = Depends(admin_only), db: Session = Depends(get_db)):
    u = _user(db, user_id)
    if u.role == "admin" and body.role != "admin" and svc.active_admin_count(db) <= 1:
        raise HTTPException(409, "Cannot remove the last administrator.")
    old = u.role
    u.role = body.role
    if body.role != "viewer":
        u.viewer_of_id = None
    db.commit()
    audit.record(db, "role_changed", actor_id=ctx.user.id, resource_type="user",
                 resource_id=u.id, request=request, details={"from": old, "to": body.role})
    return u


@router.patch("/users/{user_id}/status", response_model=UserOut)
def set_status(user_id: str, body: StatusUpdate, request: Request,
               ctx: AuthContext = Depends(admin_only), db: Session = Depends(get_db)):
    u = _user(db, user_id)
    if u.id == ctx.user.id and not body.is_active:
        raise HTTPException(409, "You cannot deactivate your own account.")
    if u.role == "admin" and not body.is_active and svc.active_admin_count(db) <= 1:
        raise HTTPException(409, "Cannot deactivate the last administrator.")
    u.is_active = body.is_active
    db.commit()
    if not body.is_active:
        svc.revoke_user_sessions(db, u.id)
    audit.record(db, "user_activated" if body.is_active else "user_deactivated",
                 actor_id=ctx.user.id, resource_type="user", resource_id=u.id, request=request)
    return u


@router.patch("/users/{user_id}/viewer", response_model=UserOut)
def assign_viewer(user_id: str, body: ViewerAssignment, request: Request,
                  ctx: AuthContext = Depends(admin_only), db: Session = Depends(get_db)):
    u = _user(db, user_id)
    if u.role != "viewer":
        raise HTTPException(422, "Only viewers can be assigned to an analyst.")
    if body.viewer_of_id is not None:
        owner = db.get(User, body.viewer_of_id)
        if owner is None or owner.role != "analyst":
            raise HTTPException(422, "A viewer can only be assigned to an analyst.")
    u.viewer_of_id = body.viewer_of_id
    db.commit()
    audit.record(db, "viewer_assignment_changed", actor_id=ctx.user.id, resource_type="user",
                 resource_id=u.id, request=request,
                 details={"viewer_of_id": str(body.viewer_of_id) if body.viewer_of_id else None})
    return u


@router.get("/audit-logs", response_model=Page[AuditLogOut])
def audit_logs(action: str | None = None, actor_id: str | None = None,
               date_from: date | None = None, date_to: date | None = None,
               page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
               ctx: AuthContext = Depends(admin_only), db: Session = Depends(get_db)):
    stmt = select(AuditLog, User.name).outerjoin(User, User.id == AuditLog.actor_id)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if actor_id:
        stmt = stmt.where(AuditLog.actor_id == parse_uuid(actor_id))
    if date_from:
        stmt = stmt.where(AuditLog.created_at >= datetime.combine(
            date_from, datetime.min.time(), tzinfo=timezone.utc))
    if date_to:
        stmt = stmt.where(AuditLog.created_at < datetime.combine(
            date_to + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.execute(stmt.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
                      .offset((page - 1) * page_size).limit(page_size)).all()
    items = [AuditLogOut(id=a.id, created_at=a.created_at, actor_id=a.actor_id, actor_name=n,
                         action=a.action, resource_type=a.resource_type,
                         resource_id=a.resource_id, ip=a.ip, details=a.details)
             for a, n in rows]
    return Page(items=items, total=total, page=page, page_size=page_size,
                pages=max(1, math.ceil(total / page_size)))
