# Operations — Hathorn Dashboard

Honest inventory of **what runs today**, not a target architecture.

Last reviewed: Phase 12 (platform operations).

---

## Production architecture (current)

| Layer | Actual |
|---|---|
| Application runtime | Next.js 14 (Node) — `npm run start` / `npm run dev` |
| Database | **SQLite** (`DATA_DIR/ledger.db`) via `better-sqlite3`. Postgres is **tooling only** (`DATABASE_URL` + migrate scripts); app does not read Postgres at runtime yet. |
| File / object storage | Local filesystem under `DATA_DIR/documents` (and logos). No S3/GCS wired. |
| Email | Resend (`RESEND_API_KEY`) — fire-and-forget; silent no-op if unset |
| AI provider | Anthropic Messages API (`ANTHROPIC_API_KEY`) — optional; kill switch `AI_PROVIDER_ENABLED` |
| QuickBooks | OAuth + sync (`QBO_*`) — optional; sandbox vs production via `QBO_ENVIRONMENT` |
| Other integrations | File import + mock provider in Integration Hub |
| Document worker | Optional Python/Docling path (`DOCUMENT_INTELLIGENCE_ENABLED`); native CSV always works |
| Scheduled jobs | Cron-oriented npm scripts: `npm run backup`, `npm run restore-check`, `npm run jobs:tick` |
| Background jobs | **Simple SQLite queue** (`background_jobs`) — not Temporal |
| Hosting | Operator-chosen Node host (no Kubernetes in-repo) |
| Domain / DNS | Operator-managed; `NEXT_PUBLIC_BASE_URL` must be the public origin |
| Secrets | Host env / `.env.local` — never committed. See secret rotation below. |
| Backups | SQLite online backup API → `BACKUP_DIR` (required in production) |
| Monitoring | Structured JSON logs + `/api/health` (+ `/live`, `/ready`). No Datadog/Sentry bundled. |
| Logging | `lib/db.ts` `log()` — JSON with redaction + correlation id when present |
| Deployment pipeline | GitHub Actions CI (`.github/workflows/ci.yml`) — install, typecheck, lint, unit suites, build |
| Environments | Explicit `APP_ENV`: `LOCAL` \| `TEST` \| `STAGING` \| `PRODUCTION` |

---

## Environments

| `APP_ENV` | Intent |
|---|---|
| LOCAL | Developer laptop; soft defaults; seed allowed |
| TEST | Automated suites |
| STAGING | Production-like guards; sandbox providers; seed only with `ALLOW_DEMO_SEED=1` |
| PRODUCTION | Fail-closed config; seed refused even with `ALLOW_DEMO_SEED` unless `LEDGER_ALLOW_LOCAL_PROD=1` (never on a real host) |

If `APP_ENV` is unset: `NODE_ENV=production` → PRODUCTION, `test` → TEST, else LOCAL.

---

## Environment safety

Production/staging must not allow:

- Demo seed/reset without explicit staging hatch
- Published `AUTH_SECRET` default
- Localhost `NEXT_PUBLIC_BASE_URL` (production)
- Backups next to the live DB disk without `BACKUP_DIR`
- AI/email/QBO mock behaviour silently pretending to be live (disabled = no-op, not fake success to clients)

`assertProductionReady()` runs from the root layout on first request.

---

## Configuration validation

| Variable | Required when |
|---|---|
| `AUTH_SECRET` | PRODUCTION / production Node |
| `NEXT_PUBLIC_BASE_URL` | PRODUCTION |
| `BACKUP_DIR` | PRODUCTION |
| `ENCRYPTION_KEY` | Optional; falls back to `AUTH_SECRET` |
| `RESEND_*` | Only if email desired |
| `QBO_*` | Only if QuickBooks desired |
| `ANTHROPIC_*` | Only if AI desired |
| `DATABASE_URL` | Only for Postgres migration tooling |

Kill switches (optional features off without taking down financials):

```
AI_PROVIDER_ENABLED=0
COPILOT_ENABLED=0
DOCUMENT_INTELLIGENCE_ENABLED=0
FORGE_ENABLED=0
TAX_INTELLIGENCE_ENABLED=0
ACCOUNTING_GUIDANCE_ENABLED=0
INTEGRATION_HUB_ENABLED=0
CLOSE_AUTOMATION_ENABLED=0
```

---

## Secrets

Must not appear in git, frontend bundles, logs, error pages, or client env vars:

- OAuth client secrets / refresh tokens (encrypted at rest `enc:v1:`)
- AI keys, Resend keys, DB credentials, encryption keys

### Rotation

| Secret | Procedure |
|---|---|
| `AUTH_SECRET` | Generate new → deploy → all sessions invalidate |
| `ENCRYPTION_KEY` | Set new key as `ENCRYPTION_KEY`, keep old as `ENCRYPTION_KEY_PREVIOUS` → decrypt tries both → rewrite credentials on next sync/write → remove previous |
| Provider API keys | Rotate at provider → update host secrets → restart |
| OAuth client secret | Rotate at Intuit → update env → reconnect connections that fail AUTH |
| Database / host access | Rotate at host; no app-level shared admin login |

Do **not** rotate encryption keys without `ENCRYPTION_KEY_PREVIOUS` or ciphertext becomes unreadable.

---

## Jobs

See `docs/JOBS.md`. Engine: **SIMPLE QUEUE** (SQLite). Temporal: **DEFERRED**. Appsmith: **NOT NEEDED** (first-party `/platform` ops console).

```bash
npm run jobs:tick   # claim + process due jobs
```

---

## Health

| Endpoint | Meaning |
|---|---|
| `GET /api/health/live` | Process alive |
| `GET /api/health/ready` | Core deps usable (DB, auth config, storage) |
| `GET /api/health` | Combined ops view + degradation matrix (no secrets / tenant data) |

Optional dependency outages (AI, QBO, email, Docling) do **not** mark readiness failed.

---

## Platform ops console

`/platform` (platform admin only):

- Firm provisioning
- System health / usage (no financial aggregates)
- Failed job list + safe retry
- Firm search + client metadata diagnostics

Support actions audit: `JOB_RETRIED`, `CONNECTION_DIAGNOSTIC_VIEWED`, `PLATFORM_FIRM_PROVISIONED`, etc.

**No** arbitrary SQL, shell, impersonation, or bulk financial export.

---

## Cron (recommended)

```cron
0 * * * * cd /srv/ledger && npm run backup >> /var/log/ledger-backup.log 2>&1
15 3 * * * cd /srv/ledger && npm run restore-check >> /var/log/ledger-backup.log 2>&1
* * * * * cd /srv/ledger && npm run jobs:tick >> /var/log/ledger-jobs.log 2>&1
```

---

## Related docs

- `docs/DISASTER-RECOVERY.md`
- `docs/INCIDENT-RESPONSE.md`
- `docs/SECURITY-HARDENING.md`
- `docs/JOBS.md`
- `docs/PRODUCTION-READINESS.md`
- `PRODUCTION.md` (host checklist)
