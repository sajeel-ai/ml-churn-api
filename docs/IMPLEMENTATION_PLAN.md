# Customer Churn Intelligence Platform: Implementation Plan

Status: Phase 1 complete. Phases 2 to 6 not started.

## 1. Current architecture assessment (verified against the repo)
- FastAPI + Pydantic app, scikit-learn Pipeline with XGBClassifier, joblib artifact.
- Model contract verified: 19 input features, 4 numeric and 15 categorical.
- **No authentication exists.** There is no `security.py` and no API key. Every endpoint is public.
- No database, users, persistence, versioning or CORS configuration.
- Pre-Phase-1 defects (all fixed in Phase 1 unless noted):
  - metadata features were placeholders (`feature_1..3`)
  - stored metrics did not match the saved model
  - schema accepted any string and the encoder silently ignores unknown categories
  - requirements.txt was UTF-16 and mixed runtime and test packages
  - `test_model.py` was a script, not a test
  - the container ran as root with no healthcheck
  - the threshold was tuned on the test set (**still open**, documented as a limitation)

## 2. Proposed architecture
Monorepo: `backend/` (FastAPI) and `frontend/` (Next.js), moved with `git mv` in Phase 2.
Browser -> Next.js (same-origin `/api/*` rewrite to FastAPI) -> FastAPI -> PostgreSQL, with the model loaded in-process.
Same-origin proxying means no CORS and no API key in the browser.

## 3. Database schema (Phase 2)
users, sessions, customers, predictions, model_versions, audit_logs, password_reset_tokens, jobs (only if bulk needs async).
Every private row carries `owner_id`. Indexes on (owner_id, created_at) and (owner_id, risk_level).
Predictions store an `input_snapshot` (JSONB) plus model_version and threshold.

## 4. Authentication and authorization (Phase 2 and 5)
- Server-side sessions in PostgreSQL, opaque token in an HttpOnly, Secure, SameSite=Lax cookie. This enables session listing and revocation.
- Argon2id password hashing, login rate limiting, CSRF header check on state-changing requests.
- Roles: admin, analyst, viewer, enforced by a FastAPI dependency on every route.
- Row ownership checks on every record lookup (IDOR). Admins get aggregates, not private customer records.

## 5. Frontend pages
Landing, register, login, dashboard, predict, result, history, customers, bulk, model info, settings, admin (overview, users, models, audit, health).

## 6. API contract
Implemented now: `GET /api/v1/health/live`, `GET /api/v1/health/ready`, `GET /api/v1/model`, `POST /api/v1/predict` (stateless).
Legacy `/`, `/health` and `/predict` are kept.
Planned: auth, predictions, customers, bulk and jobs, admin, as listed in the master prompt.

## 7. Deployment recommendation (provisional)
Managed platform with managed PostgreSQL (Render or Railway for both services). Vercel is optional for the frontend.
Pricing and free-tier limits must be re-checked at Phase 6; free tiers often sleep or expire databases.
Decision needed from the owner.

## 8. Backlog
P2 DB, auth, roles. P3 frontend core. P4 history, customers, bulk, reports. P5 admin, audit, security tests. P6 e2e, Docker, CI, deploy.

## 9. Decisions needed from the owner
1. Risk policy: confirm or change `RISK_HIGH_THRESHOLD` (placeholder 0.50).
2. Customer data retention and account-deletion rules.
3. Hosting provider and budget.
4. Email provider for verification and password reset.
5. Include bulk prediction in release 1?
6. Approve the `backend/` and `frontend/` monorepo restructure.
7. Python version: tested on 3.12, Docker uses 3.12 (your notes said 3.14).
8. Whether to retrain with a proper validation/test split (the current threshold was tuned on the test set).
