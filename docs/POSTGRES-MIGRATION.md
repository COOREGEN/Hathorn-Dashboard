# Postgres migration — Hathorn Dashboard

## Status: WORKING IN TEST/DEV (tooling) — not production-cutover

Runtime today remains **SQLite** via `better-sqlite3` (`lib/db.ts`). Postgres support is offline tooling:

- `lib/postgres.ts` — schema translation, `TRANSFER_ORDER`, transfer + count verify  
- `scripts/migrate-to-postgres.ts` / `scripts/verify-postgres.ts`  
- `npm run db:migrate-postgres` / `npm run db:verify`

This environment has **not** executed against a live Postgres server. Do not claim production-ready until the checklist below is green.

## Current schema notes

| Topic | SQLite today | Postgres target |
|---|---|---|
| Placeholders | `?` | `$1…` via `translateQuery` |
| Booleans | INTEGER 0/1 | BOOLEAN (partial rewrite in `translateSchema`) |
| Timestamps | TEXT `datetime('now')` | `TIMESTAMPTZ` / `NOW()` |
| JSON | TEXT | JSONB (future hardening) |
| Upserts | `ON CONFLICT` | same |
| FTS | not used | n/a |
| Backups | SQLite online backup API (`lib/backup.ts`) | managed provider + PITR (required before cutover) |
| Firms | migration 26 | included before clients in `TRANSFER_ORDER` |

## Staged plan

| Phase | Goal | State |
|---|---|---|
| A Schema compatibility | firms + firm_id; transfer order | **Done** (SQLite migration 26 + TRANSFER_ORDER) |
| B Data migration tooling | `transfer()` + row counts | **Exists** (untested live) |
| C Shadow verification | financial totals + release checksums | **Scripted** — run on staging |
| D Postgres test runtime | dual-run optional flag | **Deferred** |
| E Production cutover | feature flag + freeze window | **Deferred** |
| F SQLite retirement | remove dual paths | **Deferred** — keep SQLite for local/dev |

## Financial integrity checks (required on cutover)

For representative clients, compare BEFORE vs AFTER:

- Revenue, expenses, net income, cash, AR  
- Published release count + snapshot length/checksum  
- `release_records` must be **copied**, never recomputed from live lines  

## RLS

SQL policies for high-risk tables live in `docs/postgres-rls.sql`. They are **defense in depth**, not a replacement for `requireClientAccess`. Apply only on Postgres with `SET LOCAL app.current_firm_id` per transaction (never a pooled global).

## Rollback

1. Keep SQLite primary until cutover proven.  
2. On failed cutover: point `DATABASE_URL` off, resume SQLite file + last verified backup.  
3. Do not delete SQLite snapshots until Postgres restore is tested.

## Flags (rollout)

- `POSTGRES_RUNTIME_ENABLED` — reserved; unused until adapter wires into `db()`.  
- Multi-tenant app auth is live on SQLite without a flag (required for isolation).
