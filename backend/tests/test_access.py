"""Server-side authorization: roles, ownership (IDOR) and privilege escalation."""
from tests.conftest import new_client


def seed(analyst, customer, ident="C-1"):
    cust = analyst.post("/api/v1/customers", json={**customer, "customer_identifier": ident}).json()
    pred = analyst.post("/api/v1/predictions", json={"customer_id": cust["id"]}).json()
    return cust["id"], pred["id"]


def test_user_cannot_touch_other_users_records(make_client, customer):
    a = make_client("a@example.com")
    b = make_client("b@example.com")
    cid, pid = seed(a, customer)
    for method, url, body in [
        ("GET", f"/api/v1/customers/{cid}", None),
        ("PATCH", f"/api/v1/customers/{cid}", {"tenure": 3}),
        ("DELETE", f"/api/v1/customers/{cid}", None),
        ("GET", f"/api/v1/predictions/{pid}", None),
        ("GET", f"/api/v1/predictions/{pid}/report", None),
        ("DELETE", f"/api/v1/predictions/{pid}", None),
    ]:
        r = b.request(method, url, json=body)
        assert r.status_code == 404, (method, url, r.status_code)   # existence not revealed
    assert b.get("/api/v1/customers").json()["total"] == 0
    assert b.get("/api/v1/predictions").json()["total"] == 0
    assert b.get("/api/v1/predictions/export.csv").text.count("\n") == 1  # header only
    assert b.post("/api/v1/predictions", json={"customer_id": cid}).status_code == 404
    assert b.get("/api/v1/dashboard").json()["total_predictions"] == 0
    assert a.get(f"/api/v1/customers/{cid}").status_code == 200  # untouched


def test_malformed_ids_are_404_not_500(make_client):
    a = make_client("a@example.com")
    for url in ("/api/v1/customers/not-a-uuid", "/api/v1/predictions/123", "/api/v1/jobs/abc"):
        assert a.get(url).status_code == 404


def test_admin_has_no_access_to_private_records(make_client, customer):
    a = make_client("a@example.com")
    admin = make_client("root@example.com", role="admin")
    cid, pid = seed(a, customer)
    assert admin.get(f"/api/v1/customers/{cid}").status_code == 404
    assert admin.get(f"/api/v1/predictions/{pid}").status_code == 404
    assert admin.get("/api/v1/customers").json()["total"] == 0
    # but admins do get aggregate statistics
    assert admin.get("/api/v1/admin/overview").json()["total_predictions"] == 1


def test_viewer_read_only_and_scoped(make_client, customer):
    a = make_client("a@example.com")
    cid, pid = seed(a, customer)
    other = make_client("other@example.com")
    seed(other, customer, "O-1")

    unassigned = make_client("v0@example.com", role="viewer")
    assert unassigned.get("/api/v1/customers").json()["total"] == 0
    assert unassigned.get(f"/api/v1/customers/{cid}").status_code == 404

    viewer = make_client("v1@example.com", role="viewer", viewer_of=a.user_id)
    assert viewer.get("/api/v1/customers").json()["total"] == 1
    assert viewer.get(f"/api/v1/customers/{cid}").status_code == 200
    assert viewer.get(f"/api/v1/predictions/{pid}").status_code == 200
    assert viewer.get("/api/v1/dashboard").json()["total_predictions"] == 1
    # read-only: every write is refused
    assert viewer.post("/api/v1/customers", json={**customer, "customer_identifier": "X"}).status_code == 403
    assert viewer.patch(f"/api/v1/customers/{cid}", json={"tenure": 2}).status_code == 403
    assert viewer.delete(f"/api/v1/customers/{cid}").status_code == 403
    assert viewer.delete(f"/api/v1/predictions/{pid}").status_code == 403
    assert viewer.post("/api/v1/predictions", json={"input": customer}).status_code == 403
    assert viewer.post("/api/v1/predict", json=customer).status_code == 403
    assert viewer.get("/api/v1/jobs").status_code == 403
    assert viewer.get("/api/v1/predictions/export.csv").status_code == 200
    assert a.get(f"/api/v1/customers/{cid}").status_code == 200


def test_admin_endpoints_forbidden_for_non_admins(make_client):
    analyst = make_client("a@example.com")
    viewer = make_client("v@example.com", role="viewer")
    anon = new_client()
    paths = [("GET", "/api/v1/admin/users"), ("GET", "/api/v1/admin/overview"),
             ("GET", "/api/v1/admin/audit-logs"), ("GET", "/api/v1/admin/system"),
             ("POST", "/api/v1/admin/users")]
    for method, p in paths:
        assert anon.request(method, p).status_code == 401
        assert analyst.request(method, p, json={}).status_code == 403, p
        assert viewer.request(method, p, json={}).status_code == 403, p


def test_no_privilege_escalation(make_client):
    analyst = make_client("a@example.com")
    root = make_client("root@example.com", role="admin")
    target = str(analyst.user_id)
    assert analyst.patch(f"/api/v1/admin/users/{target}/role", json={"role": "admin"}).status_code == 403
    assert analyst.patch("/api/v1/auth/me", json={"name": "N", "role": "admin"}).json()["role"] == "analyst"
    assert root.patch(f"/api/v1/admin/users/{target}/role", json={"role": "superuser"}).status_code == 422
    assert analyst.get("/api/v1/auth/me").json()["role"] == "analyst"
    me = analyst.get("/api/v1/auth/me").json()
    assert me["role"] == "analyst"


def test_role_change_takes_effect_immediately(make_client):
    analyst = make_client("a@example.com")
    root = make_client("root@example.com", role="admin")
    assert root.patch(f"/api/v1/admin/users/{analyst.user_id}/role", json={"role": "viewer"}).status_code == 200
    assert analyst.post("/api/v1/customers", json={}).status_code == 403  # now a viewer


def test_deactivated_user_session_dies(make_client):
    analyst = make_client("a@example.com")
    root = make_client("root@example.com", role="admin")
    assert analyst.get("/api/v1/auth/me").status_code == 200
    assert root.patch(f"/api/v1/admin/users/{analyst.user_id}/status", json={"is_active": False}).status_code == 200
    assert analyst.get("/api/v1/auth/me").status_code == 401
    r = new_client().post("/api/v1/auth/login", json={"email": "a@example.com", "password": "Sturdy-pass-2026"})
    assert r.status_code == 403


def test_bulk_job_idor(make_client, customer):
    a = make_client("a@example.com")
    b = make_client("b@example.com")
    csv = ",".join(customer) + "\n" + ",".join(str(v) for v in customer.values()) + "\n"
    job = a.post("/api/v1/predictions/bulk", files={"file": ("x.csv", csv, "text/csv")}).json()
    assert a.get(f"/api/v1/jobs/{job['id']}").status_code == 200
    assert b.get(f"/api/v1/jobs/{job['id']}").status_code == 404
    assert b.get(f"/api/v1/jobs/{job['id']}/result.csv").status_code == 404
    assert b.get("/api/v1/jobs").json() == []
