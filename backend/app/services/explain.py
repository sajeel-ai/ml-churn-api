"""Per-prediction model explanation using TreeSHAP (XGBoost pred_contribs).

Contributions are on the log-odds scale and are aggregated from the
one-hot/scaled columns back to the 19 original input features. This
describes how the *model* arrived at a score for this input. It is not a
causal statement about why a customer churns.
"""
import logging
import math

import pandas as pd

from app.model.predictor import _clean

logger = logging.getLogger(__name__)

NOTE = ("Model explanation (TreeSHAP), not causal reasoning. Each factor shows how much "
        "this input moved the model's score up or down relative to the average customer.")


def _group_names(names, features):
    """Map each transformed column name to its original feature."""
    ordered = sorted(features, key=len, reverse=True)
    mapping = {}
    for n in names:
        local = n.split("__", 1)[1] if "__" in n else n
        for f in ordered:
            if local == f or local.startswith(f + "_"):
                mapping[n] = f
                break
    return mapping


def explain(model, record: dict, top_n: int = 6) -> dict | None:
    try:
        import xgboost as xgb

        pre = model.named_steps["preprocessor"]
        booster = model.named_steps["classifier"].get_booster()
        features = list(model.feature_names_in_)

        row = _clean(record)
        x = pre.transform(pd.DataFrame([row])[features])
        contribs = booster.predict(xgb.DMatrix(x), pred_contribs=True)[0]
        names = list(pre.get_feature_names_out())
        if len(contribs) != len(names) + 1:
            return None

        mapping = _group_names(names, features)
        agg = {f: 0.0 for f in features}
        for n, c in zip(names, contribs[:-1]):
            if n in mapping:
                agg[mapping[n]] += float(c)

        biggest = max((abs(v) for v in agg.values()), default=0.0) or 1.0
        factors = []
        for f, v in sorted(agg.items(), key=lambda kv: abs(kv[1]), reverse=True)[:top_n]:
            if abs(v) < 1e-6:
                continue
            value = row.get(f)
            factors.append({
                "feature": f,
                "value": None if value is None or (isinstance(value, float) and math.isnan(value)) else value,
                "effect": "increases" if v > 0 else "decreases",
                "contribution": round(v, 4),
                "relative_strength": round(abs(v) / biggest, 3),
            })
        bias = float(contribs[-1])
        return {
            "method": "TreeSHAP (XGBoost pred_contribs)",
            "scale": "log-odds",
            "base_probability": round(1 / (1 + math.exp(-bias)), 4),
            "factors": factors,
            "note": NOTE,
        }
    except Exception:
        logger.exception("Explanation failed")
        return None
