"""Retrain the churn model with a leakage-free protocol.

Protocol
  * Outer split: stratified 80/20, random_state=42 (same hold-out rows as v1.0.0,
    so results are directly comparable).
  * Model selection and hyperparameter search: 5-fold CV on the TRAIN part only.
  * Classification threshold: chosen from out-of-fold predictions on TRAIN only.
  * The hold-out test set is scored exactly once, at the end.

Usage:  python scripts/train_model.py
"""
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from scipy.stats import loguniform, randint, uniform
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, roc_auc_score
from sklearn.model_selection import (RandomizedSearchCV, StratifiedKFold,
                                     cross_val_predict, cross_val_score,
                                     train_test_split)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from xgboost import XGBClassifier

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

import evaluate_model  # noqa: E402

SEED = 42
DATA = ROOT / "data" / "WA_Fn-UseC_-Telco-Customer-Churn.csv"
NUM = ["SeniorCitizen", "tenure", "MonthlyCharges", "TotalCharges"]


def make_pipeline(clf, cat_cols):
    pre = ColumnTransformer([
        ("numerical", Pipeline([("imputer", SimpleImputer(strategy="median")),
                                ("scaler", StandardScaler())]), NUM),
        ("categorical", Pipeline([("imputer", SimpleImputer(strategy="most_frequent")),
                                  ("onehot", OneHotEncoder(handle_unknown="ignore"))]),
         cat_cols),
    ])
    return Pipeline([("preprocessor", pre), ("classifier", clf)])


def main():
    df = pd.read_csv(DATA)
    df["TotalCharges"] = pd.to_numeric(df["TotalCharges"], errors="coerce")
    df = df.drop(columns=["customerID"])
    y = df["Churn"].map({"Yes": 1, "No": 0})
    x = df.drop(columns=["Churn"])
    cat_cols = [c for c in x.columns if c not in NUM]
    # keep the column order the API contract (and v1.0.0) uses
    order = list(joblib.load(ROOT / "models/archive/churn_model_v1.0.0.joblib").feature_names_in_)
    x = x[order]

    xtr, xte, ytr, yte = train_test_split(
        x, y, random_state=SEED, test_size=0.2, stratify=y)
    cv = StratifiedKFold(5, shuffle=True, random_state=SEED)

    lr = make_pipeline(LogisticRegression(max_iter=2000, random_state=SEED), cat_cols)
    lr_auc = cross_val_score(lr, xtr, ytr, cv=cv, scoring="roc_auc").mean()

    xgb = make_pipeline(XGBClassifier(random_state=SEED, eval_metric="logloss",
                                      n_jobs=-1), cat_cols)
    search = RandomizedSearchCV(
        xgb, {
            "classifier__n_estimators": randint(100, 500),
            "classifier__learning_rate": loguniform(0.01, 0.2),
            "classifier__max_depth": randint(2, 6),
            "classifier__min_child_weight": randint(1, 12),
            "classifier__subsample": uniform(0.6, 0.4),
            "classifier__colsample_bytree": uniform(0.5, 0.5),
            "classifier__reg_lambda": loguniform(0.5, 20),
        }, n_iter=60, scoring="roc_auc", cv=cv, random_state=SEED, n_jobs=-1)
    search.fit(xtr, ytr)
    xgb_auc = search.best_score_
    print(f"CV ROC-AUC  logistic={lr_auc:.4f}  xgboost(tuned)={xgb_auc:.4f}")

    # choose by CV only
    best = search.best_estimator_ if xgb_auc >= lr_auc else lr
    chosen = "xgboost" if best is search.best_estimator_ else "logistic"
    print("selected:", chosen)

    oof = cross_val_predict(best, xtr, ytr, cv=cv, method="predict_proba")[:, 1]
    grid = np.round(np.arange(0.10, 0.71, 0.01), 2)
    f1s = [f1_score(ytr, oof >= t) for t in grid]
    threshold = float(grid[int(np.argmax(f1s))])
    print(f"threshold from out-of-fold TRAIN predictions (max F1): {threshold} "
          f"(oof F1={max(f1s):.4f}, oof AUC={roc_auc_score(ytr, oof):.4f})")

    best.fit(xtr, ytr)
    joblib.dump(best, ROOT / "models/churn_model.joblib")

    meta = evaluate_model.build(
        threshold=threshold,
        version="1.1.0",
        threshold_selection=(
            "Threshold chosen by maximizing F1 on 5-fold out-of-fold predictions "
            "from the training split only; the hold-out test set was scored once."),
        algorithm_note=f"Selected by 5-fold CV ROC-AUC on the training split "
                       f"(logistic {lr_auc:.4f} vs tuned XGBoost {xgb_auc:.4f}).",
    )
    evaluate_model.META.write_text(json.dumps(meta, indent=4) + "\n", encoding="utf-8")
    print(json.dumps(meta["metrics"], indent=2))
    print("calibration:", json.dumps(meta["calibration"], indent=2))


if __name__ == "__main__":
    main()
