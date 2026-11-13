from datetime import timedelta

from fastapi import HTTPException, Request, Response
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (hash_password, hash_token, needs_rehash, new_token,
                               verify_password)
from app.db.base import utcnow
from app.models import AttemptLog, AuthToken, User, UserSession
from app.services import audit, ratelimit
from app.services.audit import client_ip


def normalize_email(email: str) -> str:
    return email.strip().lower()


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == normalize_email(email)))


def create_user(db: Session, *, name: str, email: str, password: str,
                role: str = "analyst", verified: bool = False) -> User:
    user = User(name=name, email=normalize_email(email),
                password_hash=hash_password(password), role=role,
                is_active=True, email_verified=verified)
    db.add(user)
    db.flush()
    return user


# ---- sessions ------------------------------------------------------------

def create_session(db: Session, user: User, request: Request, remember: bool):
    token, csrf = new_token(), new_token()
    ttl = timedelta(days=settings.remember_me_days) if remember \
        else timedelta(hours=settings.session_ttl_hours)
    sess = UserSession(
        user_id=user.id, token_hash=hash_token(token), csrf_token=csrf,
        expires_at=utcnow() + ttl,
        user_agent=(request.headers.get("user-agent") or "")[:300] or None,
        ip=client_ip(request))
    db.add(sess)
    user.last_login_at = utcnow()
    db.commit()
    return sess, token, ttl


def set_auth_cookies(response: Response, token: str, csrf: str, ttl: timedelta) -> None:
    common = dict(max_age=int(ttl.total_seconds()), path="/",
                  secure=settings.cookie_secure, samesite=settings.cookie_samesite)
    response.set_cookie(settings.session_cookie_name, token, httponly=True, **common)
    # Readable by JS on purpose: double-submit CSRF token.
    response.set_cookie(settings.csrf_cookie_name, csrf, httponly=False, **common)


def clear_auth_cookies(response: Response) -> None:
    for name in (settings.session_cookie_name, settings.csrf_cookie_name):
        response.delete_cookie(name, path="/")


def revoke_user_sessions(db: Session, user_id, except_session_id=None) -> None:
    q = update(UserSession).where(UserSession.user_id == user_id,
                                  UserSession.revoked_at.is_(None))
    if except_session_id:
        q = q.where(UserSession.id != except_session_id)
    db.execute(q.values(revoked_at=utcnow()))
    db.commit()


# ---- login -----------------------------------------------------------------

def authenticate(db: Session, request: Request, email: str, password: str) -> User:
    email = normalize_email(email)
    ip = client_ip(request) or "unknown"
    window = timedelta(minutes=settings.login_window_minutes)
    ratelimit.enforce(db, "login", f"email:{email}", settings.login_max_failures_per_email,
                      window, only_failures=True)
    ratelimit.enforce(db, "login", f"ip:{ip}", settings.login_max_failures_per_ip,
                      window, only_failures=True)

    user = get_user_by_email(db, email)
    ok = verify_password(password, user.password_hash if user else None)
    if not ok or user is None:
        ratelimit.log_attempt(db, "login", f"email:{email}", False)
        ratelimit.log_attempt(db, "login", f"ip:{ip}", False)
        audit.record(db, "login_failed", actor_id=user.id if user else None,
                     resource_type="user", request=request)
        raise HTTPException(401, "Invalid email or password.")

    if not user.is_active:
        audit.record(db, "login_blocked_inactive", actor_id=user.id, request=request)
        raise HTTPException(403, "This account has been deactivated.")
    if settings.require_email_verification and not user.email_verified:
        raise HTTPException(403, "Please verify your email address before signing in.")

    db.execute(delete(AttemptLog).where(AttemptLog.kind == "login",
                                        AttemptLog.key == f"email:{email}"))
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    db.commit()
    return user


# ---- single-use tokens ------------------------------------------------------

def issue_token(db: Session, user: User, purpose: str) -> str:
    ttl = timedelta(minutes=settings.reset_token_ttl_minutes) if purpose == "reset" \
        else timedelta(hours=settings.verify_token_ttl_hours)
    # invalidate earlier unused tokens of the same purpose
    db.execute(update(AuthToken).where(
        AuthToken.user_id == user.id, AuthToken.purpose == purpose,
        AuthToken.used_at.is_(None)).values(used_at=utcnow()))
    token = new_token()
    db.add(AuthToken(user_id=user.id, purpose=purpose, token_hash=hash_token(token),
                     expires_at=utcnow() + ttl))
    db.commit()
    return token


def consume_token(db: Session, token: str, purpose: str) -> User:
    row = db.scalar(select(AuthToken).where(
        AuthToken.token_hash == hash_token(token), AuthToken.purpose == purpose))
    if row is None or row.used_at is not None or row.expires_at < utcnow():
        raise HTTPException(400, "This link is invalid or has expired.")
    row.used_at = utcnow()
    user = db.get(User, row.user_id)
    if user is None or not user.is_active:
        raise HTTPException(400, "This link is invalid or has expired.")
    db.commit()
    return user


def active_admin_count(db: Session) -> int:
    from sqlalchemy import func
    return db.scalar(select(func.count()).select_from(User).where(
        User.role == "admin", User.is_active.is_(True))) or 0
