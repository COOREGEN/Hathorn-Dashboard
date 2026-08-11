# Background jobs — Hathorn Dashboard

## Decision

| Option | Status |
|---|---|
| Simple SQLite queue (`background_jobs`) | **ADOPTED** |
| Temporal | **DEFERRED** |
| Kafka / Redis queues | **NOT NEEDED** |

### Why not Temporal (yet)

Current workloads are short (integration sync, maintenance, close reeval hooks, notify bookkeeping). Concurrency is already guarded per connection/resource. Lost-job pain has not demonstrated multi-step workflow orchestration need. Temporal remains an option if month-end orchestration grows multi-hour durable sagas.

## Model

```
background_jobs
  id, firm_id, client_id, job_type, resource_id,
  concurrency_key, idempotency_key,
  status, attempt, max_attempts,
  scheduled_at, started_at, completed_at, heartbeat_at,
  error_code, error_message, params_json, result_json,
  app_version, created_by, created_at
```

States: `QUEUED` → `RUNNING` → `SUCCEEDED` | `FAILED` | `RETRYING` | `CANCELLED` | `STUCK`

## Job types

| Type | Purpose | Idempotency |
|---|---|---|
| `INTEGRATION_SYNC` | Hub sync via `syncConnection` | `idempotency_key` + connection concurrency |
| `DOCUMENT_PARSE` | Reserved / handler-registered | per document id |
| `EMAIL_NOTIFY` | Ops visibility for notify attempts | per logical send key |
| `CLOSE_REEVAL` | Refresh close checks (never auto-publish) | per period |
| `AI_DRAFT` | Async draft only — never publish | per draft resource |
| `REPORT_GENERATE` | Retry-safe report build | per release/version |
| `MAINTENANCE` | Stuck sweep | hourly key |
| `INTEGRITY_CHECK` | Orphan / storage / release checks | manual or scheduled |

## Concurrency

`concurrency_key` prevents parallel RUNNING jobs for the same resource (e.g. one QBO sync per connection).

## Retries

- Transient failures → `RETRYING` with exponential backoff (cap 1h)
- Auth / validation / permanent → `FAILED` immediately
- Max attempts then dead-letter as `FAILED`
- Manual retry: platform admin, **original params only**, audited as `JOB_RETRIED`

## Stuck jobs

RUNNING without heartbeat beyond 30 minutes → `STUCK` (ops can retry).

## Runner

```bash
npm run jobs:tick
```

Schedule with cron. Also callable from `/api/ops/jobs` (`action: tick`) for platform admins.

## What must not happen

- Retry forever
- Duplicate financial imports without intention
- Auto-publish / auto-approve on job success
- Store secrets or full P&L payloads in `params_json`
