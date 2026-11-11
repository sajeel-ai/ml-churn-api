import pytest

from app.model.loader import get_bundle, load_metadata, load_model
from app.model.predictor import predict_churn


def test_model_and_metadata_load():
    assert load_model() is not None
    assert 0 < load_metadata()["threshold"] < 1


def test_predict_churn_output(customer):
    metadata = load_metadata()
    result = predict_churn(load_model(), customer, metadata["threshold"])

    assert result["prediction"] in (0, 1)
    assert 0 <= result["probability"] <= 1
    assert result["prediction"] == int(result["probability"] >= metadata["threshold"])


def test_prediction_is_deterministic(customer):
    model, t = load_model(), load_metadata()["threshold"]
    assert predict_churn(model, customer, t) == predict_churn(model, customer, t)


def test_threshold_changes_class_not_probability(customer):
    model = load_model()
    low = predict_churn(model, customer, 0.0)
    high = predict_churn(model, customer, 1.0)
    assert low["probability"] == high["probability"]
    assert low["prediction"] == 1 and high["prediction"] == 0


def test_bundle_feature_contract():
    bundle = get_bundle()
    assert bundle.feature_names == list(bundle.model.feature_names_in_)
    assert len(bundle.feature_names) == 19


def test_contract_mismatch_is_rejected():
    from app.model.loader import _validate_contract
    bundle = get_bundle()
    with pytest.raises(ValueError):
        _validate_contract(bundle.model, {"features": ["feature_1"]})
