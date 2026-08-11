# Environment data separation

Automated fixtures, staging/pilot books, and production must not share a database.

| Environment | Database | Demo seed | Mock integrations | Contents |
|---|---|---|---|---|
| **LOCAL** (dev) | SQLite `DATA_DIR/ledger.db` | Allowed | Allowed (default on) | Developer book; may seed |
| **TEST / CI** | Postgres `hathorn_test` (or `*_test`) | Allowed | Allowed when `ENABLE_MOCK_INTEGRATION=1` | Northbridge, Example CPA, Firm A/B fixtures |
| **STAGING / PILOT** | Postgres `hathorn_staging` | Refused unless `ALLOW_DEMO_SEED=1` (SQLite only; do not migrate into pilot) | Off unless explicit flag | Intentionally provisioned firms/clients only |
| **PRODUCTION** | Real host DB | **Always refused** | Off | Authorized real data only |
| **DEMO** (optional) | Separate host/DB | Explicit demo classification | N/A | Not created by default |

## Who can seed

| `APP_ENV` | `npm run seed` / `db:prepare-test` |
|---|---|
| LOCAL | Yes |
| TEST | Yes |
| STAGING | Only with `ALLOW_DEMO_SEED=1` (prefer not to; use `hathorn_test`) |
| PRODUCTION | **Never** — `ALLOW_DEMO_SEED` and `LEDGER_ALLOW_LOCAL_PROD` do not unlock seed |

`LEDGER_ALLOW_LOCAL_PROD` remains for local production-mode cookie/URL relaxations only.

## Database targets

| Name | Role |
|---|---|
| `hathorn_test` | Disposable fixture DB for smoke / proof / RLS / financial proofs |
| `hathorn_staging` | Production-like pilot evaluation — no permanent seed clients |
| production DB names (`*prod*`) | Guarded; fixture load/migrate refused |

Safety helpers live in `lib/ops/db-target.ts` (used by migrate, prepare-test, purge).

## Commands

```bash
# Build / refresh the isolated test database (wipes hathorn_test only)
APP_ENV=TEST npm run db:prepare-test

# Point the app at the test DB for automated proofs
export POSTGRES_RUNTIME_ENABLED=1
export DATABASE_URL=postgres://hathorn_app:…@127.0.0.1:5432/hathorn_test
export DATABASE_MIGRATOR_URL=postgres://hathorn:…@127.0.0.1:5432/hathorn_test
export APP_ENV=TEST ENABLE_MOCK_INTEGRATION=1
npm run start &
npm run smoke && npm run proof && npm run db:rls-proof && npm run db:financial-proof

# Purge proven seed fixtures from staging (keeps Hathorn Advisory Group)
APP_ENV=STAGING CONFIRM_STAGING_FIXTURE_PURGE=1 \
  DATABASE_MIGRATOR_URL=postgres://…/hathorn_staging \
  npm run db:purge-staging-fixtures          # dry-run
APPLY=1 … npm run db:purge-staging-fixtures  # execute
```

## Fixture rules

- Northbridge, Lakeside, Bright Path, Impact 5, Example CPA, Harbor Dental, `.example` / `.test` users → **TEST only**.
- `samples/*.csv` stay in the repo; they are never auto-attached to firm accounts.
- Mock hub provider is hidden on STAGING/PRODUCTION unless `ENABLE_MOCK_INTEGRATION=1` (CI/test only).

## Reset rules

- Resetting `hathorn_test` is normal and expected (`db:prepare-test`).
- Resetting `hathorn_staging` with seed+migrate is refused without `CONFIRM_STAGING_MIGRATE=1`.
- Production migrate/seed/purge paths fail closed.
