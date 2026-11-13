from datetime import timedelta

from sqlalchemy import select

from app.db import session as dbsession
from app.db.base import utcnow
from app.models import AuditLog, AuthToken, User, UserSession
from tests.conftest import PASSWORD, login, make_user, new_client

REG = {"name": "Ada Lovelace", "email": "ada@example.com",
       "password": "Correct-horse-42", "confirm_password": "Correct-horse-42"}


def register(client, **over):
    return client.post("/api/v1/auth/register", json={**REG, **over})


def test_register_creates_user_hashes_password_and_logs_in(app_client, outbox):
    r = register(app_client)
    assert r.status_code == 201
    body = r.json()
    assert body["email"] == "ada@example.com" and body["role"] == "analyst"
    assert "password" not in body and "password_hash" not in body
    with dbsession.SessionLocal() as db:
        u = db.scalar(select(User))
        assert u.password_hash.startswith("$argon2id$")
        assert "Correct-horse-42" not in u.password_hash
    assert app_client.get("/api/v1/auth/me").status_code == 200  # auto-login
    assert any(n == "send_verify_email" for n, *_ in outbox)


def test_session_cookie_flags(app_client):
    r = register(app_client)
    cookies = r.headers.get_list("set-cookie")
    session = next(c for c in cookies if c.startswith("churn_session="))
    csrf = next(c for c in cookies if c.startswith("churn_csrf="))
    assert "HttpOnly" in session and "samesite=lax" in session.lower()
    assert "HttpOnly" not in csrf  # readable on purpose (double-submit)


def test_register_validation(app_client):
    assert register(app_client, password="short1", confirm_password="short1").status_code == 422
    assert register(app_client, password="onlyletterslong", confirm_password="onlyletterslong").status_code == 422
    assert register(app_client, confirm_password="different-1234").status_code == 422
    assert register(app_client, email="not-an-email").status_code == 422
    assert register(app_client, name="  ").status_code == 422
    assert register(app_client, password="ada-lovelace-1", confirm_password="ada-lovelace-1").status_code == 422
    assert register(app_client, password="password123", confirm_password="password123").status_code == 422


def test_duplicate_email_rejected_case_insensitive(app_client):
    assert register(app_client).status_code == 201
    other = new_client()
    assert register(other, email="ADA@Example.com").status_code == 409


def test_register_rate_limited(app_client):
    codes = [register(app_client, email=f"u{i}@example.com").status_code for i in range(12)]
    assert codes[:10] == [201] * 10 and 429 in codes[10:]


def test_login_success_and_generic_failure(app_client):
    make_user("bob@example.com")
    bad = app_client.post("/api/v1/auth/login", json={"email": "bob@example.com", "password": "wrong-password1"})
    unknown = app_client.post("/api/v1/auth/login", json={"email": "nobody@example.com", "password": "wrong-password1"})
    assert bad.status_code == unknown.status_code == 401
    assert bad.json() == unknown.json()  # no account enumeration
    assert login(app_client, "bob@example.com")["email"] == "bob@example.com"


def test_login_rate_limit_locks_after_failures(app_client):
    make_user("lock@example.com")
    for _ in range(5):
        assert app_client.post("/api/v1/auth/login", json={
            "email": "lock@example.com", "password": "wrong-password1"}).status_code == 401
    r = app_client.post("/api/v1/auth/login", json={"email": "lock@example.com", "password": PASSWORD})
    assert r.status_code == 429 and "Retry-After" in r.headers


def test_inactive_user_cannot_login(app_client):
    make_user("off@example.com", active=False)
    r = app_client.post("/api/v1/auth/login", json={"email": "off@example.com", "password": PASSWORD})
    assert r.status_code == 403


def test_unauthenticated_requests_rejected():
    c = new_client()
    for path in ("/api/v1/auth/me", "/api/v1/customers", "/api/v1/predictions",
                 "/api/v1/dashboard", "/api/v1/jobs", "/api/v1/admin/users"):
        assert c.get(path).status_code == 401, path


def test_logout_revokes_session(make_client):
    c = make_client("out@example.com")
    assert c.get("/api/v1/auth/me").status_code == 200
    assert c.post("/api/v1/auth/logout").status_code == 200
    assert c.get("/api/v1/auth/me").status_code == 401


def test_expired_session_rejected(make_client):
    c = make_client("exp@example.com")
    with dbsession.SessionLocal() as db:
        for s in db.scalars(select(UserSession)):
            s.expires_at = utcnow() - timedelta(minutes=1)
        db.commit()
    assert c.get("/api/v1/auth/me").status_code == 401


def test_csrf_required_for_state_changes(make_client):
    c = make_client("csrf@example.com")
    del c.headers["X-CSRF-Token"]
    assert c.post("/api/v1/auth/logout").status_code == 403
    c.headers["X-CSRF-Token"] = "wrong"
    assert c.patch("/api/v1/auth/me", json={"name": "X"}).status_code == 403
    assert c.get("/api/v1/auth/me").status_code == 200  # safe methods exempt


def test_foreign_origin_blocked(make_client):
    c = make_client("origin@example.com")
    r = c.patch("/api/v1/auth/me", json={"name": "Evil"}, headers={"Origin": "https://evil.example"})
    assert r.status_code == 403
    ok = c.patch("/api/v1/auth/me", json={"name": "Good"}, headers={"Origin": "http://localhost:3000"})
    assert ok.status_code == 200
    r2 = new_client().post("/api/v1/auth/login", json={"email": "a@example.com", "password": "x"},
                           headers={"Origin": "https://evil.example"})
    assert r2.status_code == 403


def test_update_profile(make_client):
    c = make_client("prof@example.com")
    assert c.patch("/api/v1/auth/me", json={"name": "  New   Name "}).json()["name"] == "New Name"
    assert c.patch("/api/v1/auth/me", json={"name": ""}).status_code == 422


def test_change_password_revokes_other_sessions(make_client):
    c1 = make_client("pw@example.com")
    c2 = new_client()
    login(c2, "pw@example.com")
    assert c1.post("/api/v1/auth/change-password", json={
        "current_password": "wrong", "new_password": "Another-pass-77"}).status_code == 400
    assert c1.post("/api/v1/auth/change-password", json={
        "current_password": PASSWORD, "new_password": "weak"}).status_code == 422
    assert c1.post("/api/v1/auth/change-password", json={
        "current_password": PASSWORD, "new_password": "Another-pass-77"}).status_code == 200
    assert c1.get("/api/v1/auth/me").status_code == 200   # this session survives
    assert c2.get("/api/v1/auth/me").status_code == 401   # others signed out
    fresh = new_client()
    assert fresh.post("/api/v1/auth/login", json={"email": "pw@example.com", "password": PASSWORD}).status_code == 401
    login(fresh, "pw@example.com", "Another-pass-77")


def test_password_reset_flow(app_client, outbox):
    make_user("reset@example.com")
    unknown = app_client.post("/api/v1/auth/forgot-password", json={"email": "ghost@example.com"})
    known = app_client.post("/api/v1/auth/forgot-password", json={"email": "reset@example.com"})
    assert unknown.status_code == known.status_code == 202 and unknown.json() == known.json()
    sent = [t for n, to, t in outbox if n == "send_reset_email"]
    assert len(sent) == 1  # only the real account got an email
    token = sent[0]

    old = new_client()
    login(old, "reset@example.com")
    assert app_client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "weak"}).status_code == 422
    ok = app_client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "Brand-new-pass-9"})
    assert ok.status_code == 200
    assert old.get("/api/v1/auth/me").status_code == 401        # sessions revoked
    again = app_client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "Third-pass-12345"})
    assert again.status_code == 400                              # single use
    login(new_client(), "reset@example.com", "Brand-new-pass-9")


def test_reset_token_expiry_and_garbage(app_client, outbox):
    make_user("exp2@example.com")
    app_client.post("/api/v1/auth/forgot-password", json={"email": "exp2@example.com"})
    token = [t for n, _, t in outbox if n == "send_reset_email"][0]
    with dbsession.SessionLocal() as db:
        row = db.scalar(select(AuthToken))
        row.expires_at = utcnow() - timedelta(minutes=1)
        db.commit()
    assert app_client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "Brand-new-pass-9"}).status_code == 400
    assert app_client.post("/api/v1/auth/reset-password", json={"token": "x" * 40, "new_password": "Brand-new-pass-9"}).status_code == 400
    with dbsession.SessionLocal() as db:  # tokens are stored hashed
        assert token not in db.scalar(select(AuthToken)).token_hash


def test_email_verification(app_client, outbox):
    register(app_client)
    token = [t for n, _, t in outbox if n == "send_verify_email"][0]
    assert app_client.get("/api/v1/auth/me").json()["email_verified"] is False
    assert app_client.post("/api/v1/auth/verify-email", json={"token": token}).status_code == 200
    assert app_client.get("/api/v1/auth/me").json()["email_verified"] is True


def test_session_management_and_idor(make_client):
    a = make_client("a@example.com")
    b = make_client("b@example.com")
    sessions = a.get("/api/v1/auth/sessions").json()
    assert len(sessions) == 1 and sessions[0]["current"] is True
    other = b.get("/api/v1/auth/sessions").json()[0]["id"]
    assert a.delete(f"/api/v1/auth/sessions/{other}").status_code == 404   # not yours
    assert b.get("/api/v1/auth/me").status_code == 200
    second = new_client()
    login(second, "a@example.com")
    assert len(a.get("/api/v1/auth/sessions").json()) == 2
    assert a.delete("/api/v1/auth/sessions").status_code == 200
    assert second.get("/api/v1/auth/me").status_code == 401
    assert a.get("/api/v1/auth/me").status_code == 200


def test_delete_account_cascades(make_client, customer):
    c = make_client("gone@example.com")
    c.post("/api/v1/customers", json={**customer, "customer_identifier": "C1"})
    c.post("/api/v1/predictions", json={"input": customer})
    assert c.request("DELETE", "/api/v1/auth/me", json={"password": "wrong"}).status_code == 400
    assert c.request("DELETE", "/api/v1/auth/me", json={"password": PASSWORD}).status_code == 200
    with dbsession.SessionLocal() as db:
        from app.models import Customer, Prediction
        assert db.scalar(select(User)) is None
        assert db.scalar(select(Customer)) is None and db.scalar(select(Prediction)) is None
        assert db.scalar(select(AuditLog).where(AuditLog.action == "account_deleted"))
    assert c.get("/api/v1/auth/me").status_code == 401


def test_last_admin_cannot_delete_account(make_client):
    c = make_client("root@example.com", role="admin")
    r = c.request("DELETE", "/api/v1/auth/me", json={"password": PASSWORD})
    assert r.status_code == 409


def test_audit_trail_never_contains_secrets(app_client):
    register(app_client)
    app_client.post("/api/v1/auth/login", json={"email": "ada@example.com", "password": "Wrong-pass-123"})
    with dbsession.SessionLocal() as db:
        blob = " ".join(str(r.details) + r.action for r in db.scalars(select(AuditLog)))
        assert "Correct-horse" not in blob and "Wrong-pass" not in blob
        actions = {r.action for r in db.scalars(select(AuditLog))}
    assert {"user_registered", "login_failed"} <= actions
