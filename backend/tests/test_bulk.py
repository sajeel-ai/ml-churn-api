import csv
import io

from app.core.config import settings
from tests.conftest import VALID_CUSTOMER

COLS = list(VALID_CUSTOMER)


def make_csv(rows, cols=COLS, extra=None):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cols + list((extra or {}).keys()))
    for r in rows:
        w.writerow([r.get(c, "") for c in cols] + list((extra or {}).values()))
    return buf.getvalue()


def upload(client, content, path="/api/v1/predictions/bulk", name="data.csv"):
    return client.post(path, files={"file": (name, content, "text/csv")})


def rows_of(client, job_id):
    r = client.get(f"/api/v1/jobs/{job_id}/result.csv")
    assert r.status_code == 200
    return list(csv.DictReader(io.StringIO(r.text)))


def test_validate_reports_everything(make_client):
    c = make_client("a@example.com")
    good = dict(VALID_CUSTOMER)
    bad_cat = dict(VALID_CUSTOMER, Contract="Banana")
    bad_num = dict(VALID_CUSTOMER, tenure="abc")
    missing = dict(VALID_CUSTOMER, gender="")
    neg = dict(VALID_CUSTOMER, MonthlyCharges="-4")
    content = make_csv([good, bad_cat, bad_num, missing, neg], extra={"Churn": "No"})
    rep = upload(c, content, "/api/v1/predictions/bulk/validate").json()
    assert rep["total_rows"] == 5 and rep["valid_rows"] == 1 and rep["invalid_rows"] == 4
    assert rep["missing_columns"] == [] and rep["ignored_columns"] == ["Churn"]
    by_row = {e["row"]: " ".join(e["errors"]) for e in rep["errors"]}
    assert "Contract" in by_row[3] and "tenure" in by_row[4]
    assert "gender: missing value" in by_row[5] and "MonthlyCharges" in by_row[6]
    assert len(rep["preview"]) == 5 and rep["can_process"] is True


def test_validate_missing_columns_blocks_processing(make_client):
    c = make_client("a@example.com")
    content = make_csv([VALID_CUSTOMER], cols=[x for x in COLS if x != "tenure"])
    rep = upload(c, content, "/api/v1/predictions/bulk/validate").json()
    assert rep["missing_columns"] == ["tenure"] and rep["can_process"] is False
    assert upload(c, content).status_code == 422


def test_bulk_job_end_to_end_never_drops_rows(make_client):
    c = make_client("a@example.com")
    ok1 = dict(VALID_CUSTOMER, Contract="Two year", tenure=60, TotalCharges=4000)
    ok2 = dict(VALID_CUSTOMER)
    bad = dict(VALID_CUSTOMER, Contract="Banana")
    content = make_csv([ok1, bad, ok2], extra={"customerID": "X-1"})
    r = upload(c, content)
    assert r.status_code == 202
    job = c.get(f"/api/v1/jobs/{r.json()['id']}").json()    # background task already ran
    assert job["status"] == "completed" and job["total_rows"] == 3
    assert job["processed_rows"] == 3 and job["invalid_rows"] == 1
    out = rows_of(c, job["id"])
    assert len(out) == 3                                     # every input row is present
    assert [o["row_status"] for o in out] == ["ok", "invalid", "ok"]
    assert "Contract" in out[1]["error"] and out[1]["churn_probability"] == ""
    assert out[0]["customerID"] == "X-1" and out[0]["predicted_label"] in ("churn", "no_churn")
    # same model result as the single-prediction path
    single = c.post("/api/v1/predict", json=ok2).json()
    assert abs(float(out[2]["churn_probability"]) - single["probability"]) < 5e-5
    hist = c.get("/api/v1/predictions?source=bulk").json()
    assert hist["total"] == 2                                # only valid rows are saved
    assert {i["reference"] for i in hist["items"]} <= {"X-1", "row 4"}
    assert c.get("/api/v1/dashboard").json()["total_predictions"] == 2
    assert [j["id"] for j in c.get("/api/v1/jobs").json()] == [job["id"]]


def test_bulk_new_customer_blank_total_charges(make_client):
    c = make_client("a@example.com")
    new = dict(VALID_CUSTOMER, tenure=0, TotalCharges="")
    job = upload(c, make_csv([new])).json()
    assert c.get(f"/api/v1/jobs/{job['id']}").json()["status"] == "completed"
    assert rows_of(c, job["id"])[0]["row_status"] == "ok"
    bad = dict(VALID_CUSTOMER, TotalCharges="")                # blank but tenure 12
    job2 = upload(c, make_csv([bad])).json()
    assert rows_of(c, job2["id"])[0]["row_status"] == "invalid"


def test_limits(make_client, monkeypatch):
    c = make_client("a@example.com")
    monkeypatch.setattr(settings, "bulk_max_rows", 3)
    assert upload(c, make_csv([VALID_CUSTOMER] * 4)).status_code == 422
    assert upload(c, make_csv([VALID_CUSTOMER] * 3)).status_code == 202
    assert upload(c, "").status_code == 422
    assert upload(c, ",".join(COLS) + "\n").status_code == 422   # header only
    monkeypatch.setattr(settings, "bulk_max_upload_bytes", 100)
    assert upload(c, make_csv([VALID_CUSTOMER])).status_code == 413


def test_non_utf8_rejected(make_client):
    c = make_client("a@example.com")
    r = c.post("/api/v1/predictions/bulk", files={"file": ("x.csv", b"\xff\xfe\x00bad", "text/csv")})
    assert r.status_code == 422


def test_output_neutralises_formula_injection(make_client):
    c = make_client("a@example.com")
    evil = dict(VALID_CUSTOMER, Contract='=cmd|" /C calc"!A0')
    job = upload(c, make_csv([evil])).json()
    out = rows_of(c, job["id"])[0]
    assert out["Contract"].startswith("'=") and out["row_status"] == "invalid"


def test_result_not_ready_and_unknown_job(make_client):
    c = make_client("a@example.com")
    assert c.get("/api/v1/jobs/00000000-0000-0000-0000-000000000000").status_code == 404


def test_failed_job_saves_nothing(make_client, monkeypatch):
    c = make_client("a@example.com")
    from app.services.deps import get_prediction_service
    svc = get_prediction_service()
    monkeypatch.setattr(type(svc), "predict_many", lambda self, r: (_ for _ in ()).throw(RuntimeError("boom")))
    job = upload(c, make_csv([VALID_CUSTOMER])).json()
    j = c.get(f"/api/v1/jobs/{job['id']}").json()
    assert j["status"] == "failed" and "boom" not in (j["error"] or "")
    assert c.get("/api/v1/predictions").json()["total"] == 0
    assert c.get(f"/api/v1/jobs/{job['id']}/result.csv").status_code == 409
