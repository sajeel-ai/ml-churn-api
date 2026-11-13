import csv
import io



def mk(client, customer, ident="C-1", **over):
    return client.post("/api/v1/customers", json={**customer, "customer_identifier": ident, **over})


def test_customer_crud(make_client, customer):
    c = make_client("a@example.com")
    r = mk(c, customer)
    assert r.status_code == 201
    cid = r.json()["id"]
    assert r.json()["Contract"] == "Month-to-month" and r.json()["latest_prediction"] is None
    assert mk(c, customer).status_code == 409                      # duplicate identifier
    assert c.get(f"/api/v1/customers/{cid}").json()["tenure"] == 12
    up = c.patch(f"/api/v1/customers/{cid}", json={"tenure": 30, "Contract": "One year", "customer_identifier": "C-9"})
    assert up.status_code == 200 and up.json()["tenure"] == 30 and up.json()["customer_identifier"] == "C-9"
    assert c.patch(f"/api/v1/customers/{cid}", json={"Contract": "Banana"}).status_code == 422
    assert c.patch(f"/api/v1/customers/{cid}", json={"nonsense": 1}).status_code == 422
    assert c.patch(f"/api/v1/customers/{cid}", json={"PhoneService": "No"}).status_code == 422  # cross-field rule
    assert c.delete(f"/api/v1/customers/{cid}").status_code == 204
    assert c.get(f"/api/v1/customers/{cid}").status_code == 404


def test_customer_validation(make_client, customer):
    c = make_client("a@example.com")
    assert mk(c, customer, ident="").status_code == 422
    bad = dict(customer, tenure=-1)
    assert mk(c, bad).status_code == 422
    assert mk(c, dict(customer, MonthlyCharges=-5)).status_code == 422


def test_customer_search_filter_sort_paginate(make_client, customer):
    c = make_client("a@example.com")
    for i in range(7):
        mk(c, customer, ident=f"ACME-{i}", tenure=i * 10)
    mk(c, customer, ident="OTHER", Contract="Two year")
    page = c.get("/api/v1/customers?q=acme&page_size=3&sort=tenure&order=asc").json()
    assert page["total"] == 7 and page["pages"] == 3 and len(page["items"]) == 3
    assert [i["tenure"] for i in page["items"]] == [0, 10, 20]
    assert c.get("/api/v1/customers?contract=Two year").json()["total"] == 1
    assert c.get("/api/v1/customers?page_size=1000").status_code == 422


def test_empty_dashboard_has_no_fabricated_numbers(make_client):
    c = make_client("a@example.com")
    d = c.get("/api/v1/dashboard").json()
    assert d["total_predictions"] == 0 and d["average_probability"] is None
    assert d["recent"] == [] and sum(a["count"] for a in d["activity"]) == 0
    assert len(d["activity"]) == 30


def test_preview_does_not_persist(make_client, customer):
    c = make_client("a@example.com")
    r = c.post("/api/v1/predict", json=customer).json()
    assert r["risk_level"] in ("low", "medium", "high") and r["explanation"]["factors"]
    assert c.get("/api/v1/predictions").json()["total"] == 0


def test_save_prediction_and_history(make_client, customer):
    c = make_client("a@example.com")
    preview = c.post("/api/v1/predict", json=customer).json()
    saved = c.post("/api/v1/predictions", json={"input": customer, "reference": "Walk-in 1"})
    assert saved.status_code == 201
    s = saved.json()
    assert abs(s["probability"] - preview["probability"]) < 1e-9     # server recomputes, never trusts client
    assert s["source"] == "single" and s["reference"] == "Walk-in 1" and s["input"]["tenure"] == 12
    assert s["explanation"]["factors"] and "not a guarantee" in s["disclaimer"]
    got = c.get(f"/api/v1/predictions/{s['id']}").json()
    assert got["id"] == s["id"]
    assert c.get("/api/v1/predictions").json()["total"] == 1


def test_prediction_requires_exactly_one_source(make_client, customer):
    c = make_client("a@example.com")
    assert c.post("/api/v1/predictions", json={}).status_code == 422
    cid = mk(c, customer).json()["id"]
    assert c.post("/api/v1/predictions", json={"input": customer, "customer_id": cid}).status_code == 422


def test_customer_prediction_links_and_latest(make_client, customer):
    c = make_client("a@example.com")
    cid = mk(c, customer).json()["id"]
    p = c.post("/api/v1/predictions", json={"customer_id": cid}).json()
    assert p["customer_id"] == cid and p["source"] == "customer" and p["reference"] == "C-1"
    cust = c.get(f"/api/v1/customers/{cid}").json()
    assert cust["latest_prediction"]["id"] == p["id"]
    assert c.get(f"/api/v1/predictions?customer_id={cid}").json()["total"] == 1


def test_deleting_customer_deletes_its_predictions(make_client, customer):
    c = make_client("a@example.com")
    cid = mk(c, customer).json()["id"]
    c.post("/api/v1/predictions", json={"customer_id": cid})
    c.post("/api/v1/predictions", json={"input": customer})
    c.delete(f"/api/v1/customers/{cid}")
    assert c.get("/api/v1/predictions").json()["total"] == 1


def test_history_filters_sorting_pagination(make_client, customer):
    c = make_client("a@example.com")
    risky = dict(customer, tenure=1, Contract="Month-to-month", InternetService="Fiber optic",
                 PaymentMethod="Electronic check", MonthlyCharges=99.0, TotalCharges=99.0)
    safe = dict(customer, tenure=70, Contract="Two year", InternetService="DSL",
                PaymentMethod="Bank transfer (automatic)", MonthlyCharges=30.0, TotalCharges=2100.0,
                PaperlessBilling="No", OnlineSecurity="Yes", TechSupport="Yes")
    for i in range(3):
        c.post("/api/v1/predictions", json={"input": risky, "reference": f"risky-{i}"})
    for i in range(2):
        c.post("/api/v1/predictions", json={"input": safe, "reference": f"safe-{i}"})
    all_ = c.get("/api/v1/predictions?sort=probability&order=desc").json()
    probs = [i["probability"] for i in all_["items"]]
    assert probs == sorted(probs, reverse=True) and all_["total"] == 5
    assert c.get("/api/v1/predictions?risk_level=high").json()["total"] == 3
    assert c.get("/api/v1/predictions?risk_level=low").json()["total"] == 2
    assert c.get("/api/v1/predictions?risk_level=low&risk_level=high").json()["total"] == 5
    assert c.get("/api/v1/predictions?risk_level=bogus").status_code == 422
    assert c.get("/api/v1/predictions?q=RISKY").json()["total"] == 3
    assert c.get("/api/v1/predictions?predicted_class=0").json()["total"] == 2
    assert c.get("/api/v1/predictions?date_from=2999-01-01").json()["total"] == 0
    assert c.get("/api/v1/predictions?date_to=2000-01-01").json()["total"] == 0
    p2 = c.get("/api/v1/predictions?page=2&page_size=2").json()
    assert len(p2["items"]) == 2 and p2["pages"] == 3
    d = c.get("/api/v1/dashboard").json()
    assert d["total_predictions"] == 5 and d["high_risk"] == 3 and d["low_risk"] == 2
    assert d["high_risk"] + d["medium_risk"] + d["low_risk"] == d["total_predictions"]
    assert sum(a["count"] for a in d["activity"]) == 5 and len(d["recent"]) == 5
    assert 0 < d["average_probability"] < 1


def test_export_csv_and_formula_injection(make_client, customer):
    c = make_client("a@example.com")
    c.post("/api/v1/predictions", json={"input": customer, "reference": "=HYPERLINK(\"http://evil\")"})
    r = c.get("/api/v1/predictions/export.csv")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    rows = list(csv.DictReader(io.StringIO(r.text)))
    assert len(rows) == 1 and rows[0]["reference"].startswith("'=")   # neutralised
    assert rows[0]["risk_level"] in ("low", "medium", "high")


def test_report_escapes_html(make_client, customer):
    c = make_client("a@example.com")
    p = c.post("/api/v1/predictions", json={"input": customer, "reference": "<script>alert(1)</script>"}).json()
    r = c.get(f"/api/v1/predictions/{p['id']}/report")
    assert r.status_code == 200 and "<script>" not in r.text and "&lt;script&gt;" in r.text
    assert "not a guarantee" in r.text and "attachment" in r.headers["content-disposition"]


def test_delete_prediction(make_client, customer):
    c = make_client("a@example.com")
    p = c.post("/api/v1/predictions", json={"input": customer}).json()
    assert c.delete(f"/api/v1/predictions/{p['id']}").status_code == 204
    assert c.get(f"/api/v1/predictions/{p['id']}").status_code == 404


def test_new_customer_without_total_charges(make_client, customer):
    c = make_client("a@example.com")
    new = dict(customer, tenure=0, TotalCharges=None)
    r = c.post("/api/v1/predict", json=new)
    assert r.status_code == 200 and any("TotalCharges" in w for w in r.json()["warnings"])
    assert c.post("/api/v1/predict", json=dict(customer, TotalCharges=None)).status_code == 422


def test_audit_records_actions_without_customer_data(make_client, customer):
    c = make_client("a@example.com")
    c.post("/api/v1/predictions", json={"input": customer, "reference": "secret-ref"})
    c.get("/api/v1/predictions/export.csv")
    root = make_client("root@example.com", role="admin")
    logs = root.get("/api/v1/admin/audit-logs?page_size=200").json()["items"]
    actions = {entry["action"] for entry in logs}
    assert {"prediction_created", "data_export"} <= actions
    assert "secret-ref" not in str(logs) and "Month-to-month" not in str(logs)
