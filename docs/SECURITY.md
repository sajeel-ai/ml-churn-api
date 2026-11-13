# Security

## Controls and where they are tested
| Control | Implementation | Tests |
|---|---|---|
| Password hashing | Argon2id (OWASP-minimum parameters, configurable), rehash on login, constant-time dummy verify for unknown emails | `test_auth.py` |
| Password policy | 10+ chars, letter + number, not common, not containing name/email; same rules in UI and API | `test_auth.py`, `schemas.test.ts` |
| Sessions | Opaque random token in an `HttpOnly`, `Secure` (prod), `SameSite=Lax` cookie; only its SHA-256 is stored; revocable; expiry; idle `last_seen` | `test_auth.py` |
| CSRF | Double-submit token bound to the session + `Origin` allow-list on every state-changing request | `test_auth.py` |
| Rate limiting | DB-backed: failed logins per email and per IP, registrations per IP, reset requests per email; `429` + `Retry-After` | `test_auth.py` |
| Authorization | Server-side role dependency on every route; ownership checks on every record lookup (returns 404, never reveals existence) | `test_access.py` (IDOR, escalation, viewer scope, admin boundary) |
| Account enumeration | Identical login errors; password reset always answers the same | `test_auth.py` |
| Password reset / verification | Single-use, expiring, hashed tokens; reset revokes all sessions | `test_auth.py` |
| Injection | SQLAlchemy parameterised queries only; strict Pydantic enums/ranges on all inputs | `test_schema.py`, `test_records.py` |
| XSS | React escaping; strict CSP (`frame-ancestors 'none'`, no remote scripts); downloaded HTML report escapes all values | `test_records.py` |
| CSV/formula injection | Exports and bulk results neutralise cells starting with `= + - @` | `test_records.py`, `test_bulk.py` |
| Audit trail | Login, failed login, role/status changes, creations, deletions, bulk uploads, exports; never stores passwords, tokens or customer data | `test_auth.py`, `test_records.py` |
| Secrets | Backend API key does not exist; the browser only talks to the Next.js origin; `BACKEND_URL` is server-side only; `.env` is git-ignored | `smoke_test.py` |
| Production lock-down | Refuses to start with insecure cookies or SQLite; `/docs` and the unauthenticated legacy `/predict` are off; trusted hosts | `test_config.py` |
| Data minimisation | Customers are identified by an internal ID; deleting an account deletes all its data; audit rows keep no identity | `test_auth.py` |

## Known gaps (decide before handling real customer data)
- **No CAPTCHA / bot challenge** on registration (rate limiting only). Add one if the site is public.
- **No MFA** for any account, including admins.
- **Rate limits are per-IP behind a proxy.** Set `TRUST_PROXY_HEADERS=true` only when a trusted proxy sets `X-Forwarded-For` (Render, Railway and Caddy do). Otherwise every user appears to share one IP.
- **Registration is open** to anyone who finds the URL. If this should be invite-only, say so and it is a small change.
- **Email** must be configured (SMTP) for password reset and invitations to work.
- **Browser-level E2E tests (Playwright) are not included**; API-level E2E and component tests are.
- **Dependency and container scanning** are not set up. Enable GitHub Dependabot and a scanner such as Trivy.
- **Backups and retention**: configure database backups with your host. `AUDIT_RETENTION_DAYS` (default 365) prunes audit logs at startup.
- The data in the model's training set is public sample data. Handling real customer data may trigger legal obligations (privacy law, contracts) that this repository does not address.
