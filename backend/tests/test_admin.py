from tests.conftest import login, make_user, new_client


def test_overview_and_system(make_client, customer):
    root = make_client("root@example.com", role="admin")
    a = make_client("a@example.com")
    a.post("/api/v1/predictions", json={"input": customer})
    ov = root.get("/api/v1/admin/overview").json()
    assert ov["registered_users"] == 2 and ov["active_users"] == 2
    assert ov["total_predictions"] == 1 and ov["users_by_role"] == {"admin": 1, "analyst": 1}
    sysd = root.get("/api/v1/admin/system").json()
    assert sysd["database"] == "ok" and sysd["model"]["loaded"] is True


def test_user_listing_search_filter(make_client):
    root = make_client("root@example.com", role="admin")
    make_user("alice@example.com", name="Alice")
    make_user("bob@example.com", role="viewer", name="Bob")
    assert root.get("/api/v1/admin/users?q=ali").json()["total"] == 1
    assert root.get("/api/v1/admin/users?role=viewer").json()["items"][0]["email"] == "bob@example.com"
    assert root.get("/api/v1/admin/users?page_size=1").json()["pages"] == 3


def test_admin_creates_user_who_sets_own_password(make_client, outbox):
    root = make_client("root@example.com", role="admin")
    r = root.post("/api/v1/admin/users", json={"name": "New Person", "email": "new@example.com", "role": "viewer"})
    assert r.status_code == 201 and r.json()["role"] == "viewer"
    assert root.post("/api/v1/admin/users", json={"name": "Dup", "email": "NEW@example.com"}).status_code == 409
    token = [t for n, to, t in outbox if to == "new@example.com"][0]
    c = new_client()
    assert c.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "Chosen-pass-2026"}).status_code == 200
    login(c, "new@example.com", "Chosen-pass-2026")


def test_role_and_last_admin_protection(make_client):
    root = make_client("root@example.com", role="admin")
    assert root.patch(f"/api/v1/admin/users/{root.user_id}/role", json={"role": "analyst"}).status_code == 409
    assert root.patch(f"/api/v1/admin/users/{root.user_id}/status", json={"is_active": False}).status_code == 409
    second = make_user("root2@example.com", role="admin")
    assert root.patch(f"/api/v1/admin/users/{second}/role", json={"role": "analyst"}).status_code == 200
    assert root.patch("/api/v1/admin/users/nope/role", json={"role": "viewer"}).status_code == 404


def test_viewer_assignment_rules(make_client):
    root = make_client("root@example.com", role="admin")
    analyst = make_user("a@example.com")
    viewer = make_user("v@example.com", role="viewer")
    other_viewer = make_user("v2@example.com", role="viewer")
    url = f"/api/v1/admin/users/{viewer}/viewer"
    assert root.patch(url, json={"viewer_of_id": str(analyst)}).json()["viewer_of_id"] == str(analyst)
    assert root.patch(url, json={"viewer_of_id": str(other_viewer)}).status_code == 422   # must be an analyst
    assert root.patch(f"/api/v1/admin/users/{analyst}/viewer", json={"viewer_of_id": None}).status_code == 422
    assert root.patch(f"/api/v1/admin/users/{viewer}/role", json={"role": "analyst"}).json()["viewer_of_id"] is None


def test_audit_log_filters_and_pagination(make_client):
    root = make_client("root@example.com", role="admin")
    a = make_client("a@example.com")
    new_client().post("/api/v1/auth/login", json={"email": "a@example.com", "password": "bad-password-1"})
    root.patch(f"/api/v1/admin/users/{a.user_id}/role", json={"role": "viewer"})
    fl = root.get("/api/v1/admin/audit-logs?action=login_failed").json()
    assert fl["total"] == 1 and fl["items"][0]["actor_name"] == "Test User"
    rc = root.get("/api/v1/admin/audit-logs?action=role_changed").json()["items"][0]
    assert rc["details"] == {"from": "analyst", "to": "viewer"}
    by_actor = root.get(f"/api/v1/admin/audit-logs?actor_id={root.user_id}").json()
    assert all(i["actor_id"] == str(root.user_id) for i in by_actor["items"])
    assert root.get("/api/v1/admin/audit-logs?page_size=2").json()["pages"] >= 2
    assert root.get("/api/v1/admin/overview").json()["failed_logins_24h"] == 1


def test_model_info_and_versions(make_client):
    c = make_client("a@example.com")
    info = new_client().get("/api/v1/model").json()          # public, safe metadata
    assert info["model_version"] == "1.1.0" and info["risk_high_threshold"] == 0.5
    v = c.get("/api/v1/model/versions").json()
    assert [x["status"] for x in v if x["version"] == "1.1.0"] == ["active"]
    assert any(x["version"] == "1.0.0" and x["status"] == "archived" for x in v)
    assert new_client().get("/api/v1/model/versions").status_code == 401


def test_cli_create_admin_and_login(app_client):
    from app import cli
    assert cli.create_admin("boss@example.com", "The Boss", "Weak1") == 1       # policy enforced
    assert cli.create_admin("boss@example.com", "The Boss", "Strong-admin-pass-9") == 0
    r = app_client.post("/api/v1/auth/login", json={"email": "boss@example.com", "password": "Strong-admin-pass-9"})
    assert r.status_code == 200 and r.json()["role"] == "admin"
    assert cli.set_role("boss@example.com", "analyst") == 0
    assert cli.set_role("ghost@example.com", "analyst") == 1


def test_register_cannot_choose_role(app_client):
    r = app_client.post("/api/v1/auth/register", json={
        "name": "Mallory Smith", "email": "m@example.com", "role": "admin",
        "password": "Correct-horse-42", "confirm_password": "Correct-horse-42"})
    assert r.status_code == 201 and r.json()["role"] == "analyst"
