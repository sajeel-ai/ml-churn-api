# Model card: churn model v1.1.0

> Generated from `backend/models/metadata.json` (written by `backend/scripts/train_model.py` / `evaluate_model.py`).
> Do not edit numbers by hand. Re-run the scripts, and CI fails if the file is stale.

## Summary
- **Task:** binary classification, will a telecom customer churn (target `Churn`).
- **Model:** XGBClassifier inside a scikit-learn Pipeline. Selected by 5-fold CV ROC-AUC on the training split (logistic 0.8461 vs tuned XGBoost 0.8510).
- **Preprocessing:** Numeric: median imputation + StandardScaler. Categorical: most-frequent imputation + OneHotEncoder (handle_unknown='ignore').
- **Inputs:** 19 features (see `GET /api/v1/model` for accepted values).
- **Training data:** IBM Telco Customer Churn, 7,043 customers, churn rate 26.5%.
- **Classification threshold:** 0.32 (Threshold chosen by maximizing F1 on 5-fold out-of-fold predictions from the training split only; the hold-out test set was scored once.)
- **Intended use:** Rank and flag telecom customers by estimated churn likelihood to support retention decision-making by a human.

## Evaluation (offline only)
Split: stratified hold-out, test_size=0.2, random_state=42; 1,409 test customers. offline only; no production validation.

| Metric | Value |
|---|---|
| ROC-AUC | 0.8486 |
| Recall | 0.7513 |
| Precision | 0.5488 |
| F1 | 0.6343 |
| Accuracy | 0.77 |
| Brier score | 0.1344 |

Confusion matrix at the threshold: TN 804, FP 231, FN 93, TP 281.

## Calibration
Expected calibration error **0.0184** (10 equal-frequency bins on the hold-out set). Measured on a single hold-out of 1,409 customers; indicates approximate calibration on this dataset only.

| Mean predicted | Observed churn rate | Customers |
|---|---|---|
| 1.2% | 1.4% | 141 |
| 2.4% | 0.0% | 141 |
| 4.6% | 5.7% | 141 |
| 8.2% | 7.8% | 141 |
| 13.8% | 19.9% | 141 |
| 22.7% | 22.9% | 140 |
| 33.8% | 31.2% | 141 |
| 45.4% | 41.1% | 141 |
| 57.9% | 58.9% | 141 |
| 76.3% | 76.6% | 141 |

## Risk levels (business policy, not model-derived)
Low: probability below the model threshold. Medium: from the threshold up to the high-risk line. High: at or above the
high-risk line (`RISK_HIGH_THRESHOLD`, default 0.50). **This policy needs business approval.**

## Explanations
Per-prediction factors use TreeSHAP (XGBoost `pred_contribs`), aggregated from encoded columns back to the original
features. Contributions sum exactly to the model's log-odds (verified in tests). They describe how the model scored an
input; they are **not** causal explanations.

## Limitations
- Trained on a single public telecom dataset (7,043 customers); may not generalize to other businesses, regions or time periods.
- Calibration was checked on one hold-out set only and was not re-fitted; probabilities are approximate estimates.
- Metrics come from a single 80/20 hold-out split; no production validation has been performed.
- Predictions show association, not causation.
- Inputs outside the training ranges may be less reliable.

## History
- v1.0.0: original model. Threshold and reported metrics were tuned on the same test split, and the stored metrics did
  not match the saved artifact. Archived in `backend/models/archive/`.
- v1.1.0: retrained with hyper-parameters and threshold chosen using training data only; test set scored once.
