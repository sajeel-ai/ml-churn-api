# Phase 1 Report: Backend Stabilization

## Changes
- Strict request schema with allowed categorical values and cross-field rules.
- Model/metadata contract validated at startup (fails fast on mismatch or checksum change).
- Versioned API under `/api/v1` with risk level, model version, timestamp and range warnings.
- `models/metadata.json` regenerated from the real model by `scripts/evaluate_model.py`.
- Legacy endpoints and response shapes unchanged.

## Verified results
- 43 tests pass (4 original + 39 new). `ruff` passes.
- Runtime-only install smoke test returns the same probability as the original model.
- Docker image NOT built (no Docker in the build environment).

## Corrected metrics (threshold 0.29, hold-out n=1409)
| Metric | Previously stored | Verified |
|---|---|---|
| Accuracy | 0.8055 | 0.7594 |
| Precision | 0.6123 | 0.5323 |
| Recall | 0.6478 | 0.7701 |
| F1 | 0.6295 | 0.6295 |
| ROC-AUC | 0.8421 | 0.8476 |
