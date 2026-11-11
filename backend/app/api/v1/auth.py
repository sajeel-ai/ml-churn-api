from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, auth_ctx, public_endpoint
from app.core.config import settings
from app.core.security import hash_password, password_problems, verify_password
from app.db.base import utcnow
from app.db.session import get_db
from app.models import User, UserSession
from app.schemas.auth import (ChangePasswordRequest, DeleteAccountRequest,
                              ForgotPasswordRequest, LoginRequest, MessageOut,
                              RegisterRequest, ResetPasswordRequest, SessionOut,
                              UpdateProfileRequest, UserOut, VerifyEmailRequest)
from app.services import audit, auth_service as svc, ratelimit
from app.services.email import send_reset_email, send_verify_email

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=201,
             dependencies=[Depends(public_endpoint)])
def register(body: RegisterRequest, request: Request, response: Response,
             background: BackgroundTasks, db: Session = Depends(get_db)):
    ip = audit.client_ip(request) or "unknown"
    ratelimit.enforce(db, "register", f"ip:{ip}", settings.register_max_per_ip_per_hour,
                      timedelta(hours=1))
    ratelimit.log_attempt(db, "register", f"ip:{ip}", True)

    if svc.get_user_by_email(db, body.email):
        raise HTTPException(409, "An account with this email already exists.")
    try:
        user = svc.create_user(db, name=body.name, email=str(body.email),
                               password=body.password, role="analyst")
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "An account with this email already exists.")

    audit.record(db, "user_registered", actor_id=user.id, resource_type="user",
                 resource_id=user.id, request=request)
    token = svc.issue_token(db, user, "verify")
    background.add_task(send_verify_email, user.email, token)

    if not settings.require_email_verification:
        sess, raw, ttl = svc.create_session(db, user, request, remember=False)
        svc.set_auth_cookies(response, raw, sess.csrf_token, ttl)
    return user


@router.post("/login", response_model=UserOut, dependencies=[Depends(public_endpoint)])
def login(body: LoginRequest, request: Request, response: Response,
          db: Session = Depends(get_db)):
    user = svc.authenticate(db, request, str(body.email), body.password)
    sess, raw, ttl = svc.create_session(db, user, request, body.remember_me)
    svc.set_auth_cookies(response, raw, sess.csrf_token, ttl)
    audit.record(db, "login_success", actor_id=user.id, resource_type="user",
                 resource_id=user.id, request=request)
    return user


@router.post("/logout", response_model=MessageOut)
def logout(request: Request, response: Response, ctx: AuthContext = Depends(auth_ctx),
           db: Session = Depends(get_db)):
    ctx.session.revoked_at = utcnow()
    db.commit()
    audit.record(db, "logout", actor_id=ctx.user.id, request=request)
    svc.clear_auth_cookies(response)
    return {"message": "Signed out."}


@router.get("/me", response_model=UserOut)
def me(ctx: AuthContext = Depends(auth_ctx)):
    return ctx.user


@router.patch("/me", response_model=UserOut)
def update_me(body: UpdateProfileRequest, ctx: AuthContext = Depends(auth_ctx),
              db: Session = Depends(get_db)):
    ctx.user.name = body.name
    db.commit()
    return ctx.user


@router.post("/change-password", response_model=MessageOut)
def change_password(body: ChangePasswordRequest, request: Request,
                    ctx: AuthContext = Depends(auth_ctx), db: Session = Depends(get_db)):
    if not verify_password(body.current_password, ctx.user.password_hash):
        raise HTTPException(400, "Current password is incorrect.")
    problems = password_problems(body.new_password, ctx.user.email, ctx.user.name)
    if problems:
        raise HTTPException(422, " ".join(problems))
    ctx.user.password_hash = hash_password(body.new_password)
    db.commit()
    svc.revoke_user_sessions(db, ctx.user.id, except_session_id=ctx.session.id)
    audit.record(db, "password_changed", actor_id=ctx.user.id, request=request)
    return {"message": "Password updated. Other sessions were signed out."}


@router.post("/forgot-password", response_model=MessageOut, status_code=202,
             dependencies=[Depends(public_endpoint)])
def forgot_password(body: ForgotPasswordRequest, request: Request,
                    background: BackgroundTasks, db: Session = Depends(get_db)):
    email = svc.normalize_email(str(body.email))
    generic = {"message": "If an account exists for that email, a reset link has been sent."}
    try:
        ratelimit.enforce(db, "reset", f"email:{email}", settings.reset_max_per_email_per_hour,
                          timedelta(hours=1))
    except HTTPException:
        return generic  # do not reveal throttling per account
    ratelimit.log_attempt(db, "reset", f"email:{email}", True)
    user = svc.get_user_by_email(db, email)
    if user and user.is_active:
        token = svc.issue_token(db, user, "reset")
        background.add_task(send_reset_email, user.email, token)
        audit.record(db, "password_reset_requested", actor_id=user.id, request=request)
    return generic


@router.post("/reset-password", response_model=MessageOut,
             dependencies=[Depends(public_endpoint)])
def reset_password(body: ResetPasswordRequest, request: Request,
                   db: Session = Depends(get_db)):
    user = svc.consume_token(db, body.token, "reset")
    problems = password_problems(body.new_password, user.email, user.name)
    if problems:
        raise HTTPException(422, " ".join(problems))
    user.password_hash = hash_password(body.new_password)
    db.commit()
    svc.revoke_user_sessions(db, user.id)
    audit.record(db, "password_reset_completed", actor_id=user.id, request=request)
    return {"message": "Password has been reset. Please sign in."}


@router.post("/verify-email", response_model=MessageOut,
             dependencies=[Depends(public_endpoint)])
def verify_email(body: VerifyEmailRequest, request: Request, db: Session = Depends(get_db)):
    user = svc.consume_token(db, body.token, "verify")
    user.email_verified = True
    db.commit()
    audit.record(db, "email_verified", actor_id=user.id, request=request)
    return {"message": "Email verified."}


@router.post("/resend-verification", response_model=MessageOut, status_code=202)
def resend_verification(background: BackgroundTasks, ctx: AuthContext = Depends(auth_ctx),
                        db: Session = Depends(get_db)):
    if not ctx.user.email_verified:
        token = svc.issue_token(db, ctx.user, "verify")
        background.add_task(send_verify_email, ctx.user.email, token)
    return {"message": "If your email is not yet verified, a new link has been sent."}


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(ctx: AuthContext = Depends(auth_ctx), db: Session = Depends(get_db)):
    rows = db.scalars(select(UserSession).where(
        UserSession.user_id == ctx.user.id, UserSession.revoked_at.is_(None),
        UserSession.expires_at > utcnow()).order_by(UserSession.created_at.desc())).all()
    return [SessionOut(id=s.id, created_at=s.created_at, last_seen_at=s.last_seen_at,
                       expires_at=s.expires_at, user_agent=s.user_agent, ip=s.ip,
                       current=s.id == ctx.session.id) for s in rows]


@router.delete("/sessions/{session_id}", response_model=MessageOut)
def revoke_session(session_id: str, request: Request, ctx: AuthContext = Depends(auth_ctx),
                   db: Session = Depends(get_db)):
    import uuid
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(404, "Session not found.")
    sess = db.get(UserSession, sid)
    if sess is None or sess.user_id != ctx.user.id:  # ownership check (IDOR)
        raise HTTPException(404, "Session not found.")
    sess.revoked_at = utcnow()
    db.commit()
    audit.record(db, "session_revoked", actor_id=ctx.user.id, resource_type="session",
                 resource_id=sid, request=request)
    return {"message": "Session revoked."}


@router.delete("/sessions", response_model=MessageOut)
def revoke_other_sessions(request: Request, ctx: AuthContext = Depends(auth_ctx),
                          db: Session = Depends(get_db)):
    svc.revoke_user_sessions(db, ctx.user.id, except_session_id=ctx.session.id)
    audit.record(db, "sessions_revoked_all_others", actor_id=ctx.user.id, request=request)
    return {"message": "Other sessions were signed out."}


@router.delete("/me", response_model=MessageOut)
def delete_account(body: DeleteAccountRequest, request: Request, response: Response,
                   ctx: AuthContext = Depends(auth_ctx), db: Session = Depends(get_db)):
    user = ctx.user
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(400, "Password is incorrect.")
    if user.role == "admin" and svc.active_admin_count(db) <= 1:
        raise HTTPException(409, "You are the only administrator. Assign another admin first.")
    uid = user.id
    # Customers, predictions, jobs, sessions and tokens cascade; audit rows are
    # kept with the actor unlinked.
    db.execute(delete(User).where(User.id == uid))
    db.commit()
    audit.record(db, "account_deleted", resource_type="user", resource_id=uid,
                 request=request)
    svc.clear_auth_cookies(response)
    return {"message": "Your account and its data have been deleted."}
