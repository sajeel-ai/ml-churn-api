# Customer Churn Intelligence Platform

A full-stack web application around a trained churn model: register, score single customers (live, with
explanations), manage customers, run bulk CSV predictions, browse and export history, and administer users.

```
Browser ──► Next.js (UI + same-origin /api proxy) ──► FastAPI ──► trained model (in-process)
                                                          └────► PostgreSQL
```

| Part | Tech |
|---|---|
| `frontend/` | Next.js 16, React 19, TypeScript, Tailwind 4, shadcn-style components (Radix), React Hook Form + Zod, TanStack Query, Recharts |
| `backend/` | FastAPI, Pydantic, SQLAlchemy 2, Alembic, Argon2id, scikit-learn + XGBoost |
| Data | PostgreSQL (SQLite for local development and fast tests only) |

## Run locally
```bash
# 1. backend  (Python 3.12)
cd backend
python -m venv .venv && source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env
alembic upgrade head                                      # creates ./churn_dev.db (SQLite)
python -m app.cli create-admin --email you@example.com --name "Your Name"   # prompts for a password
uvicorn app.main:app --reload --port 8000

# 2. frontend  (Node 22)   in another terminal
cd frontend
cp .env.example .env.local
npm ci && npm run dev                                     # http://localhost:3000
```
Or everything in containers: `cp .env.example .env`, set `POSTGRES_PASSWORD`, then `docker compose up --build`.

## Test
```bash
cd backend  && ruff check . && pytest                                   # SQLite
cd backend  && TEST_DATABASE_URL=postgresql://user:pass@localhost/db pytest   # PostgreSQL via migrations
cd frontend && npm run lint && npm run typecheck && npm test && npm run build
BASE_URL=http://localhost:3000 python scripts/smoke_test.py             # full journey against a running stack
```

## Roles
| Role | Can |
|---|---|
| **analyst** (default on sign-up) | Create predictions, manage *their own* customers, bulk upload, export |
| **viewer** | Read-only access to the records of the one analyst an admin assigned them to |
| **admin** | Manage users and roles, audit log, system health, aggregate statistics. Admins do **not** see other users' customer records |

Roles are enforced on the server for every endpoint; the UI only hides what you cannot use.

## Documentation
- [Deployment guide](docs/DEPLOYMENT.md): hosting options, exact steps, rollback
- [Security](docs/SECURITY.md): controls, how they are tested, known gaps
- [Model card](docs/MODEL_CARD.md): metrics, calibration, limitations
- [Architecture & plan](docs/IMPLEMENTATION_PLAN.md), [Phase reports](docs/)

Predictions are model estimates, not guarantees.
