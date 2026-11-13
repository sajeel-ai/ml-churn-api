# Deployment guide

Pricing and free-tier terms below were checked in November 2026 and **change often**. Confirm on each provider's
pricing page before you commit. Sizing facts are measured: the API uses about **200 MB RAM**, the web app roughly
100-150 MB, so a 512 MB instance each is enough for light use.

## 1. Choosing where to host

| Option | Approx. monthly cost | Good for | Watch out for |
|---|---|---|---|
| **A. Render, free plans** (2 web services + free Postgres) | $0 | A demo to show people | Free web services sleep after ~15 min idle (about a minute to wake). The free database **expires** (reported as 30 days plus a grace period; confirm). Not for real users or data. |
| **B. Render, paid** (2 web services ~$7 each + paid Postgres) | roughly $20-35 | A small real deployment with minimal ops | Per-service pricing adds up. Backups and plan limits depend on the database plan. |
| **C. One VPS + Docker Compose + Caddy** | roughly $5-12 | Cheapest always-on option, full control, persistent database | You operate it: OS updates, firewall, backups, monitoring. |
| D. Azure / AWS | higher | When you already have a cloud estate or compliance needs | Overkill and more setup for this size. |
| Vercel (frontend) + other backend | varies | Not needed | Adds a third vendor; the app already proxies the API itself. |

**Recommendation.** Use **A** to validate the product with a few people this week. Move to **B** (least effort) or **C**
(cheapest) before anyone relies on it or you load real customer data. **This is your decision; tell me which and I will
tailor the steps.**

## 2. Accounts and things only you can do
- A GitHub account with this repository pushed to it.
- A hosting account (Render, or a VPS provider) and a payment method for paid plans.
- Optional: a domain name (needed for option C; recommended for B).
- An SMTP email provider (any: Brevo, Mailgun, SendGrid, Postmark, your own) for password-reset and invitation emails.
  Without it, those emails are only written to the server log and **will not be delivered**.
- Choose the secrets yourself on your own machine. **Never paste passwords or keys into chat.**

## 3. Environment variables
| Variable | Where | Meaning |
|---|---|---|
| `DATABASE_URL` | backend | PostgreSQL URL (`postgres://` and `postgresql://` both work) |
| `ENVIRONMENT` | backend | `production` enforces Secure cookies, PostgreSQL, hides `/docs`, disables the unauthenticated legacy `/predict` |
| `COOKIE_SECURE` | backend | `true` on HTTPS (required in production) |
| `ALLOWED_ORIGINS` | backend | Public URL of the web app, e.g. `https://churn.example.com` |
| `ALLOWED_HOSTS` | backend | Host names the API answers to (its own host name) |
| `FRONTEND_BASE_URL` | backend | Public URL of the web app (used in email links) |
| `TRUST_PROXY_HEADERS`, `TRUSTED_PROXY_HOPS` | backend | `true` and `1` behind Render/Caddy. **Only** when that proxy is the sole way in, otherwise clients can spoof their IP |
| `RUN_MIGRATIONS` | backend | `true` applies Alembic migrations on start |
| `RISK_HIGH_THRESHOLD` | backend | High-risk probability line (default 0.50, needs your approval) |
| `EMAIL_BACKEND`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | backend | Email delivery (`smtp` in production) |
| `BACKEND_URL` | frontend | URL of the API as seen from the web server. Read at runtime |

## 4A. Render (options A and B)
1. Push the repository to GitHub.
2. Render dashboard > **New > Blueprint**, pick the repository. It reads `render.yaml` (a starting point I have not been
   able to test on Render; review each setting in the dashboard).
3. After the first deploy you know both URLs. Set on **churn-api**: `ALLOWED_ORIGINS` and `FRONTEND_BASE_URL` (the web
   URL), `ALLOWED_HOSTS` (the API host name, no `https://`), SMTP settings and `EMAIL_BACKEND=smtp`.
   Set on **churn-web**: `BACKEND_URL` (the API URL). Redeploy both.
4. Create the first admin **from your own computer** (free instances have no shell). Use the database's *external*
   connection string from the Render dashboard:
   ```bash
   cd backend
   export DATABASE_URL='<external connection string>'        # keep it out of shell history if you can
   python -m app.cli create-admin --email you@example.com --name "Your Name"   # prompts for the password
   ```
5. Upgrade `plan:` to paid on both services and the database for anything beyond a demo.

## 4B. VPS with Docker Compose and HTTPS (option C)
1. Create a small Linux server (2 GB RAM is comfortable), point a DNS `A` record for your domain at it.
2. Install Docker, then `git clone` the repository.
3. `cp .env.example .env` and set at least: `ENVIRONMENT=production`, `COOKIE_SECURE=true`,
   `PUBLIC_URL=https://churn.yourdomain.com`, `DOMAIN=churn.yourdomain.com`, a strong `POSTGRES_PASSWORD`
   (`openssl rand -base64 24`), and SMTP settings.
4. Start: `docker compose -f docker-compose.yml -f deploy/docker-compose.https.yml up -d --build`.
   Migrations run automatically. Caddy obtains the certificate.
5. Create the admin: `docker compose exec backend python -m app.cli create-admin --email you@example.com --name "Your Name"`.
6. Firewall: allow only 22, 80 and 443. The web app listens on `127.0.0.1` only; the API and database are never published.
7. **Backups** (do this before real data): `docker compose exec -T db pg_dump -U churn churn > backup-$(date +%F).sql`
   on a schedule, copied off the server.

## 5. Database migrations
- Apply: `alembic upgrade head` (run in `backend/`, or automatic with `RUN_MIGRATIONS=true`).
- The initial migration only creates tables. **Review any future migration that drops or alters columns before applying it**
  and take a backup first.
- Check the models match migrations: `alembic check` (CI also enforces this).

## 6. Smoke test after every deploy
```bash
pip install httpx
BASE_URL=https://your-app.example python scripts/smoke_test.py
# add SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD (environment variables) to also check admin features
```
It registers throw-away users with synthetic data, walks the whole journey (register, customers, predictions, bulk,
history, export, authorization checks, logout) and deletes them. Then open the site in a browser and check the
pages yourself: sign-up, a prediction, the dashboard, and (as admin) the admin area.

## 7. Rollback
- **App:** redeploy the previous commit/image (Render: *Rollbacks*; Compose: `git checkout <previous>` then
  `docker compose up -d --build`).
- **Database:** migrations are forward-only. Restore from the backup taken before the migration
  (`psql ... < backup.sql`) if one must be undone.
- **Model:** the active model is whichever artifact is in `backend/models/`. Roll back by deploying the previous commit.
  Previous versions are archived in `backend/models/archive/`.

## 8. Operating notes
- Free/cheap instances restart: sessions persist (they live in PostgreSQL).
- Logs: the API logs actions (not customer data); admin > Audit log shows security-relevant events.
- Update dependencies regularly; enable GitHub Dependabot.
- Admin > System shows live API, database and model status. Monitoring/alerting (e.g. Sentry, uptime checks) is not set up yet.
