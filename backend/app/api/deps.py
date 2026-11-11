from dataclasses import dataclass
from datetime import timedelta

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_token, safe_equal
from app.db.base import utcnow
from app.db.session import get_db
from app.models import User, UserSession

UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


@dataclass
class AuthContext:
    user: User
    session: UserSession


def check_origin(request: Request) -> None:
    """Reject cross-origin state-changing requests when an Origin is sent."""
    if request.method not in UNSAFE:
        return
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") not in settings.origins:
        raise HTTPException(403, "Origin not allowed.")


def public_endpoint(request: Request) -> None:
    check_origin(request)


def auth_ctx(request: Request, db: Session = Depends(get_db)) -> AuthContext:
    check_origin(request)
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise HTTPException(401, "Not authenticated.")
    sess = db.scalar(select(UserSession).where(UserSession.token_hash == hash_token(token)))
    now = utcnow()
    if sess is None or sess.revoked_at is not None or sess.expires_at < now:
        raise HTTPException(401, "Session expired. Please sign in again.")
    user = db.get(User, sess.user_id)
    if user is None or not user.is_active:
        raise HTTPException(401, "Account unavailable.")

    if request.method in UNSAFE:
        sent = request.headers.get("x-csrf-token", "")
        if not sent or not safe_equal(sent, sess.csrf_token):
            raise HTTPException(403, "Missing or invalid CSRF token.")

    if now - sess.last_seen_at > timedelta(minutes=5):
        sess.last_seen_at = now
        db.commit()
    return AuthContext(user=user, session=sess)


def require_roles(*roles: str):
    """Dependency factory: server-side role check on every protected route."""
    def dep(ctx: AuthContext = Depends(auth_ctx)) -> AuthContext:
        if ctx.user.role not in roles:
            raise HTTPException(403, "You do not have permission to perform this action.")
        return ctx
    return dep


writer = require_roles("admin", "analyst")
admin_only = require_roles("admin")
