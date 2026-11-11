"""Regenerate models/metadata.json from the trained model and the dataset.

Reproduces the evaluation used in the training notebook
(train_test_split, test_size=0.2, random_state=42, stratified) and writes
verified metrics, the feature contract and the model checksum.

Usage (from the repo root):
    python scripts/evaluate_model.py            # write models/metadata.json
    python scripts/evaluate_model.py --check    # exit 1 if metadata is stale
"""
import argparse
import json
import sys
from datetime import date
from pathlib import Path

import joblib
import pandas as pd
from sklearn.metrics import (
    accuracy_score, brier_score_loss, confusion_matrix, f1_score,
    precision_score, recall_score, roc_auc_score,
)
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.model.loader import file_sha256  # noqa: E402

MODEL = ROOT / "models" / "churn_model.joblib"
META = ROOT / "models" / "metadata.json"
DATA = ROOT / "data" / "WA_Fn-UseC_-Telco-Customer-Churn.csv"
THRESHOLD = 0.29  # selected in the notebook (best F1 on the test split)
NUMERIC = ["tenure", "MonthlyCharges", "TotalCharges"]


def build() -> dict:
    df = pd.read_csv(DATA)
    df["TotalCharges"] = pd.to_numeric(df["TotalCharges"], errors="coerce")
    df = df.drop(columns=["customerID"])
    y = df["Churn"].map({"Yes": 1, "No": 0})
    x = df.drop(columns=["Churn"])

    _, x_test, _, y_test = train_test_split(
        x, y, random_state=42, test_size=0.2, stratify=y
    )

    model = joblib.load(MODEL)
    features = list(model.feature_names_in_)
    prob = model.predict_proba(x_test)[:, 1]
    pred = (prob >= THRESHOLD).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_test, pred).ravel()

    cat_pre = model.named_steps["preprocessor"].named_transformers_["categorical"]
    cat_cols = list(model.named_steps["preprocessor"].transformers_[1][2])
    cats = cat_pre.named_steps["onehot"].categories_

    return {
        "model_version": "1.0.0",
        "model_type": type(model.named_steps["classifier"]).__name__,
        "algorithm": "XGBoost classifier inside a scikit-learn Pipeline",
        "preprocessing": (
            "Numeric: median imputation + StandardScaler. "
            "Categorical: most-frequent imputation + OneHotEncoder "
            "(handle_unknown='ignore')."
        ),
        "threshold": THRESHOLD,
        "target": "Churn",
        "positive_class": 1,
        "negative_class": 0,
        "features": features,
        "categorical_values": {c: [str(v) for v in vals]
                               for c, vals in zip(cat_cols, cats)},
        "training_ranges": {
            c: {"min": float(x[c].min()), "max": float(x[c].max())}
            for c in NUMERIC
        },
        "training_dataset": {
            "name": "IBM Telco Customer Churn",
            "file": "data/WA_Fn-UseC_-Telco-Customer-Churn.csv",
            "rows": int(len(df)),
            "churn_rate": round(float(y.mean()), 4),
        },
        "evaluation": {
            "split": "stratified hold-out, test_size=0.2, random_state=42",
            "n_test": int(len(y_test)),
            "threshold_selection": (
                "Threshold chosen by maximizing F1 on this same test split, "
                "so these metrics are optimistic estimates."
            ),
            "confusion_matrix": {"tn": int(tn), "fp": int(fp),
                                 "fn": int(fn), "tp": int(tp)},
            "validation_type": "offline only; no production validation",
        },
        "metrics": {
            "accuracy": round(accuracy_score(y_test, pred), 4),
            "precision": round(precision_score(y_test, pred), 4),
            "recall": round(recall_score(y_test, pred), 4),
            "f1": round(f1_score(y_test, pred), 4),
            "roc_auc": round(roc_auc_score(y_test, prob), 4),
            "brier_score": round(brier_score_loss(y_test, prob), 4),
        },
        "calibration_evaluated": False,
        "intended_use": (
            "Rank and flag telecom customers by estimated churn likelihood "
            "to support retention decision-making by a human."
        ),
        "limitations": [
            "Trained on a single public telecom dataset (7,043 customers); "
            "may not generalize to other businesses, regions or time periods.",
            "Probabilities have not been formally calibrated.",
            "Threshold and metrics were derived on the same hold-out set.",
            "Predictions show association, not causation.",
            "Inputs outside the training ranges may be less reliable.",
        ],
        "artifact_sha256": file_sha256(MODEL),
        "last_updated": date.today().isoformat(),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    new = build()
    if args.check:
        old = json.loads(META.read_text(encoding="utf-8"))
        stale = {k for k in new if k != "last_updated" and old.get(k) != new[k]}
        if stale:
            print("metadata.json is stale for:", sorted(stale))
            return 1
        print("metadata.json is up to date.")
        return 0

    META.write_text(json.dumps(new, indent=4) + "\n", encoding="utf-8")
    print("Wrote", META)
    print(json.dumps(new["metrics"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
