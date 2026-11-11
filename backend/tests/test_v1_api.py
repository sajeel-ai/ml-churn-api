from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import app
from app.model.loader import load_metadata
from app.services.risk import classify_risk

client = TestClient(app)


def test_live():
    r = client.get("/api/v1/health/live")
    assert r.status_code == 200 and r.json() == {"status": "ok"}


def test_ready():
    r = client.get("/api/v1/health/ready")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ready" and body["model_loaded"] is True


def test_model_info_is_real_and_safe():
    r = client.get("/api/v1/model")
    assert r.status_code == 200
    body = r.json()
    assert len(body["features"]) == 19
    assert body["features"][0] == "gender"
    assert body["calibration_evaluated"] is True
    assert body["calibration"]["expected_calibration_error"] < 0.05
    assert body["threshold"] == load_metadata()["threshold"]
    assert "feature_1" not in body["features"]
    assert "model_path" not in body
    assert {"accuracy", "precision", "recall", "f1", "roc_auc"} <= body["metrics"].keys()
    assert "risk_policy" in body


def test_predict_requires_login(customer):
    assert client.post("/api/v1/predict", json=customer).status_code == 401


def test_predict_v1(customer, make_client):
    client = make_client("p1@example.com")
    r = client.post("/api/v1/predict", json=customer)
    assert r.status_code == 200
    body = r.json()
    assert body["prediction"] in (0, 1)
    assert body["predicted_label"] == ("churn" if body["prediction"] else "no_churn")
    assert body["risk_level"] in ("low", "medium", "high")
    assert body["model_version"] == load_metadata()["model_version"]
    assert "not a guarantee" in body["disclaimer"]
    assert body["warnings"] == []
    assert body["predicted_at"]


def test_predict_v1_matches_legacy(customer, make_client):
    client = make_client("p2@example.com")
    legacy = client.post("/predict", json=customer).json()
    v1 = client.post("/api/v1/predict", json=customer).json()
    assert legacy["probability"] == v1["probability"]
    assert legacy["prediction"] == v1["prediction"]
    assert set(legacy) == {"prediction", "probability"}  # legacy shape unchanged


def test_predict_v1_out_of_range_warning(customer, make_client):
    client = make_client("p3@example.com")
    customer["tenure"] = 500
    body = client.post("/api/v1/predict", json=customer).json()
    assert any("tenure" in w for w in body["warnings"])


def test_invalid_category_rejected_both_endpoints(customer, make_client):
    client = make_client("p4@example.com")
    customer["Contract"] = "Banana"
    assert client.post("/predict", json=customer).status_code == 422
    assert client.post("/api/v1/predict", json=customer).status_code == 422


def test_inconsistent_services_rejected(customer, make_client):
    client = make_client("p5@example.com")
    customer["InternetService"] = "No"
    assert client.post("/api/v1/predict", json=customer).status_code == 422


def test_risk_policy():
    t, h = 0.29, 0.5  # pure function test with explicit values
    assert classify_risk(0.10, t, h) == "low"
    assert classify_risk(0.29, t, h) == "medium"
    assert classify_risk(0.49, t, h) == "medium"
    assert classify_risk(0.50, t, h) == "high"
    assert classify_risk(0.99, t, h) == "high"


def test_invalid_risk_config_rejected():
    import pytest
    with pytest.raises(ValueError):
        Settings(risk_high_threshold=1.5)
