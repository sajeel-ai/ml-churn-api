"""End-to-end smoke test, run against a RUNNING deployment through the web URL.

    BASE_URL=https://your-app.example  python scripts/smoke_test.py
    # optional, to also exercise admin features (read from the environment, never argv):
    SMOKE_ADMIN_EMAIL=... SMOKE_ADMIN_PASSWORD=... BASE_URL=... python scripts/smoke_test.py

It registers throw-away users with synthetic data, so it is safe to run after a
deploy. It never prints passwords. Exit code 0 = everything passed.
Requires: pip install httpx
"""
import csv
import io
import os
import secrets
import sys
import time

import httpx

BASE = os.environ.get("BASE_URL", "http://localhost:3000").rstrip("/")
ADMIN_EMAIL = os.environ.get("SMOKE_ADMIN_EMAIL")
ADMIN_PW = os.environ.get("SMOKE_ADMIN_PASSWORD")

CUSTOMER = {
    "gender": "Female", "SeniorCitizen": 0, "Partner": "No", "Dependents": "No", "tenure": 5,
    "PhoneService": "Yes", "MultipleLines": "No", "InternetService": "Fiber optic",
    "OnlineSecurity": "No", "OnlineBackup": "No", "DeviceProtection": "No", "TechSupport": "No",
    "StreamingTV": "No", "StreamingMovies": "No", "Contract": "Month-to-month",
    "PaperlessBilling": "Yes", "PaymentMethod": "Electronic check",
    "MonthlyCharges": 85.0, "TotalCharges": 425.0,
}

results: list[tuple[str, bool, str]] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    results.append((name, bool(cond), detail))
    print(("PASS  " if cond else "FAIL  ") + name + (f"  [{detail}]" if detail and not cond else ""))


def new_client() -> httpx.Client:
    return httpx.Client(base_url=BASE, timeout=30, follow_redirects=False)


def csrf(c: httpx.Client) -> dict:
    return {"X-CSRF-Token": c.cookies.get("churn_csrf") or ""}


def main() -> int:
    pw = "Smoke-" + secrets.token_urlsafe(12) + "9"
    email = f"smoke-{secrets.token_hex(4)}@example.com"
    other_email = f"smoke-{secrets.token_hex(4)}@example.com"
    c, other = new_client(), new_client()

    # ---- public surface -------------------------------------------------------
    r = c.get("/")
    check("landing page renders", r.status_code == 200 and "Churn" in r.text, str(r.status_code))
    r = c.get("/dashboard")
    check("protected page redirects anonymous visitors to /login", r.status_code in (302, 307) and "/login" in r.headers.get("location", ""), str(r.status_code))
    check("security headers present", r.headers.get("x-frame-options") == "DENY" and "frame-ancestors" in (c.get("/").headers.get("content-security-policy", "")))
    r = c.get("/api/v1/health/ready")
    check("backend ready via the proxy (DB + model)", r.status_code == 200 and r.json().get("model_loaded") is True, r.text[:120])
    r = c.get("/api/v1/model")
    m = r.json() if r.status_code == 200 else {}
    check("public model info is real (19 features, calibration measured)", len(m.get("features", [])) == 19 and m.get("calibration_evaluated") is True)
    check("anonymous API access is rejected", c.get("/api/v1/customers").status_code == 401 and c.get("/api/v1/dashboard").status_code == 401)

    # ---- register / session --------------------------------------------------------
    r = c.post("/api/v1/auth/register", json={"name": "Smoke Tester", "email": email, "password": pw, "confirm_password": pw})
    check("register", r.status_code == 201 and r.json()["role"] == "analyst", r.text[:150])
    check("session cookie is HttpOnly, CSRF cookie is readable", "httponly" in "".join(r.headers.get_list("set-cookie")).lower() and c.cookies.get("churn_csrf") is not None)
    check("register: weak password rejected", other.post("/api/v1/auth/register", json={"name": "Weak User", "email": other_email, "password": "short1", "confirm_password": "short1"}).status_code == 422)
    check("/me works after registration", c.get("/api/v1/auth/me").json().get("email") == email)
    check("CSRF token is enforced on writes", c.post("/api/v1/customers", json={**CUSTOMER, "customer_identifier": "X"}).status_code == 403)

    # ---- customer + predictions ----------------------------------------------------
    r = c.post("/api/v1/customers", json={**CUSTOMER, "customer_identifier": "SMOKE-1"}, headers=csrf(c))
    check("create customer", r.status_code == 201, r.text[:150])
    cid = r.json().get("id")
    check("duplicate customer identifier rejected", c.post("/api/v1/customers", json={**CUSTOMER, "customer_identifier": "SMOKE-1"}, headers=csrf(c)).status_code == 409)
    r = c.post("/api/v1/predict", json=CUSTOMER, headers=csrf(c))
    prev = r.json() if r.status_code == 200 else {}
    check("live preview from the trained model", r.status_code == 200 and 0 <= prev.get("probability", -1) <= 1 and prev.get("explanation", {}).get("factors"), r.text[:150])
    r = c.post("/api/v1/predictions", json={"customer_id": cid}, headers=csrf(c))
    pred = r.json() if r.status_code == 201 else {}
    check("save prediction for a customer", r.status_code == 201 and abs(pred.get("probability", 9) - prev.get("probability", -9)) < 1e-9, r.text[:150])
    r = c.post("/api/v1/predictions", json={"input": {**CUSTOMER, "Contract": "Two year", "tenure": 60, "TotalCharges": 5000}, "reference": "ad-hoc"}, headers=csrf(c))
    check("save an ad-hoc prediction", r.status_code == 201)
    r = c.get("/api/v1/predictions")
    check("history lists both", r.status_code == 200 and r.json()["total"] == 2)
    check("history filter + sort", c.get("/api/v1/predictions?risk_level=high&risk_level=medium&risk_level=low&sort=probability&order=asc").json()["total"] == 2)
    check("prediction detail", c.get(f"/api/v1/predictions/{pred.get('id')}").status_code == 200)
    r = c.get("/api/v1/predictions/export.csv")
    check("CSV export", r.status_code == 200 and len(list(csv.DictReader(io.StringIO(r.text)))) == 2)
    r = c.get(f"/api/v1/predictions/{pred.get('id')}/report")
    check("downloadable report", r.status_code == 200 and "not a guarantee" in r.text)
    check("customer list shows latest prediction", c.get("/api/v1/customers").json()["items"][0]["latest_prediction"] is not None)

    # ---- bulk -----------------------------------------------------------------------
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["customerID", *CUSTOMER])
    w.writerow(["B-1", *CUSTOMER.values()])
    w.writerow(["B-2", *{**CUSTOMER, "Contract": "Banana"}.values()])
    w.writerow(["B-3", *{**CUSTOMER, "tenure": 70, "Contract": "Two year", "TotalCharges": 5900}.values()])
    files = {"file": ("smoke.csv", buf.getvalue(), "text/csv")}
    r = c.post("/api/v1/predictions/bulk/validate", files=files, headers=csrf(c))
    check("bulk validation report flags the bad row", r.status_code == 200 and r.json()["invalid_rows"] == 1 and r.json()["valid_rows"] == 2, r.text[:200])
    r = c.post("/api/v1/predictions/bulk", files=files, headers=csrf(c))
    job = r.json() if r.status_code == 202 else {}
    check("bulk job accepted", r.status_code == 202, r.text[:150])
    for _ in range(40):
        job = c.get(f"/api/v1/jobs/{job.get('id')}").json()
        if job.get("status") in ("completed", "failed"):
            break
        time.sleep(0.5)
    check("bulk job completes", job.get("status") == "completed", str(job))
    r = c.get(f"/api/v1/jobs/{job.get('id')}/result.csv")
    rows = list(csv.DictReader(io.StringIO(r.text))) if r.status_code == 200 else []
    check("bulk results keep EVERY row, invalid ones flagged", [x["row_status"] for x in rows] == ["ok", "invalid", "ok"], str([x.get("row_status") for x in rows]))
    check("bulk predictions saved to history", c.get("/api/v1/predictions?source=bulk").json()["total"] == 2)
    d = c.get("/api/v1/dashboard").json()
    check("dashboard totals add up (4 saved predictions)", d["total_predictions"] == 4 and d["high_risk"] + d["medium_risk"] + d["low_risk"] == 4, str(d)[:200])

    # ---- authorization boundaries -----------------------------------------------------
    r = other.post("/api/v1/auth/register", json={"name": "Other Person", "email": other_email, "password": pw, "confirm_password": pw})
    check("second user registered", r.status_code == 201)
    check("IDOR: other user cannot read my customer", other.get(f"/api/v1/customers/{cid}").status_code == 404)
    check("IDOR: other user cannot read my prediction", other.get(f"/api/v1/predictions/{pred.get('id')}").status_code == 404)
    check("IDOR: other user cannot delete my prediction", other.delete(f"/api/v1/predictions/{pred.get('id')}", headers=csrf(other)).status_code == 404)
    check("IDOR: other user cannot read my bulk job", other.get(f"/api/v1/jobs/{job.get('id')}").status_code == 404)
    check("other user sees an empty history", other.get("/api/v1/predictions").json()["total"] == 0)
    check("non-admin cannot reach admin API", other.get("/api/v1/admin/users").status_code == 403)
    check("protected pages render when signed in", all(c.get(p).status_code == 200 for p in ("/dashboard", "/predict", "/predictions", "/customers", "/bulk", "/model", "/settings")))

    # ---- profile / password / sessions -----------------------------------------------
    check("update profile name", c.patch("/api/v1/auth/me", json={"name": "Smoke Renamed"}, headers=csrf(c)).json().get("name") == "Smoke Renamed")
    new_pw = pw + "x"
    r = c.post("/api/v1/auth/change-password", json={"current_password": pw, "new_password": new_pw}, headers=csrf(c))
    check("change password", r.status_code == 200, r.text[:120])
    check("sessions list", len(c.get("/api/v1/auth/sessions").json()) >= 1)
    fresh = new_client()
    check("login with the new password", fresh.post("/api/v1/auth/login", json={"email": email, "password": new_pw, "remember_me": False}).status_code == 200)
    check("old password no longer works", new_client().post("/api/v1/auth/login", json={"email": email, "password": pw}).status_code == 401)
    check("logout", c.post("/api/v1/auth/logout", headers=csrf(c)).status_code == 200)
    check("session invalid after logout", c.get("/api/v1/auth/me").status_code == 401)

    # ---- cleanup: delete throw-away accounts (also tests account deletion) --------------
    check("delete account removes data", fresh.request("DELETE", "/api/v1/auth/me", json={"password": new_pw}, headers=csrf(fresh)).status_code == 200)
    check("second account deleted", other.request("DELETE", "/api/v1/auth/me", json={"password": pw}, headers=csrf(other)).status_code == 200)

    # ---- admin (optional) --------------------------------------------------------------------
    if ADMIN_EMAIL and ADMIN_PW:
        a = new_client()
        r = a.post("/api/v1/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
        check("admin login", r.status_code == 200 and r.json()["role"] == "admin")
        check("admin overview", a.get("/api/v1/admin/overview").status_code == 200)
        s = a.get("/api/v1/admin/system").json()
        check("admin system health: db + model ok", s.get("database") == "ok" and s["model"]["loaded"] is True, str(s))
        logs = a.get("/api/v1/admin/audit-logs?page_size=100").json()
        acts = {x["action"] for x in logs["items"]}
        check("audit log recorded the journey", {"user_registered", "prediction_created", "bulk_upload", "data_export"} <= acts, str(sorted(acts)))
        check("admin cannot read analysts' customers", a.get("/api/v1/customers").json()["total"] == 0)
        check("admin page renders", a.get("/admin").status_code == 200)
    else:
        print("SKIP  admin checks (set SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD to enable)")

    failed = [n for n, ok, _ in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed against {BASE}")
    for n in failed:
        print("  FAILED:", n)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
