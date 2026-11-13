import json
from pathlib import Path

from app.model.loader import MODEL_PATH, file_sha256, load_model

META = json.loads(
    (Path(__file__).resolve().parents[1] / "models" / "metadata.json")
    .read_text(encoding="utf-8")
)


def test_features_are_real_not_placeholders():
    assert META["features"] == list(load_model().feature_names_in_)
    assert not any(f.startswith("feature_") for f in META["features"])


def test_artifact_checksum_matches():
    assert META["artifact_sha256"] == file_sha256(MODEL_PATH)


def test_categorical_values_match_encoder():
    assert META["categorical_values"]["Contract"] == [
        "Month-to-month", "One year", "Two year"]


def test_metrics_are_in_valid_range():
    for name, value in META["metrics"].items():
        assert 0 <= value <= 1, name


def test_limitations_documented():
    assert META["calibration_evaluated"] is True
    assert META["limitations"]
