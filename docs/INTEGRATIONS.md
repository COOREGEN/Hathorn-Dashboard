# Integration Hub

Connect once. Normalize once. Use everywhere.

Hathorn Dashboard does **not** become QuickBooks, payroll, or a bank. Source systems
remain sources. Hathorn’s job is:

```text
CONNECT → INGEST → NORMALIZE → VALIDATE → MONITOR → USE
```

QuickBooks Online is the first reference provider. Its existing OAuth, token encryption,
and report sync are preserved. The hub wraps them; it does not rewrite them for aesthetics.

---

## Architecture

```text
External systems (QBO, CSV/Excel, mock, …)
        ↓
Connector layer (provider adapters)
        ↓
Ingestion + sync runs (durable history)
        ↓
Raw staging (optional, retention-aware)
        ↓
Canonical Hathorn records + working ledger writes
        ↓
Accounting / FP&A / Reconciliation / AI
```

Provider quirks stop at the adapter boundary. Downstream features should consume hub
readiness and canonical/ledger facts — not Intuit field names.

---

## Providers (this phase)

| Provider | Status | Auth | Capabilities |
|---|---|---|---|
| **quickbooks** | LIVE (reference) | OAuth (existing `lib/qbo.ts`) | P&L, AR, GL-shaped reports |
| **file** | LIVE | File upload / import payload | FILE_IMPORT, P&L/AR/Payroll *via files* |
| **mock** | MOCKED | None | Synthetic P&L / AR / metrics for hub tests |

Deferred (not built): NetSuite, Sage, Xero, ADP, Gusto, Stripe, Plaid, Salesforce, etc.

### DLT

**DLT = DEFERRED.** Native TypeScript adapters cover QBO + file + mock without a second
runtime. Revisit when multi-provider incremental ETL and Postgres staging are the bottleneck.

### Nango

**NANGO = EVALUATED ONLY / DEFERRED.** Useful as managed OAuth plumbing later; do not treat
as a code donor. Hathorn keeps server-side OAuth + encrypted tokens for QBO today.

---

## QuickBooks capability matrix

Evidence-based — do not claim more than this.

| Capability | Classification |
|---|---|
| OAuth authorization | IMPLEMENTED |
| OAuth callback | IMPLEMENTED |
| State validation (single-use, TTL) | IMPLEMENTED · TESTED (suite claims; sandbox not exercised here) |
| Realm / company ID | IMPLEMENTED |
| Client association | IMPLEMENTED |
| Access / refresh token storage | IMPLEMENTED (encrypted at rest) |
| Refresh-token rotation | IMPLEMENTED |
| Expiry tracking (`refresh_expires_at`) | PARTIAL (stored; not actively gated in all paths) |
| Reconnect flow | IMPLEMENTED (re-auth URL) |
| Disconnect flow | IMPLEMENTED (local delete; Intuit revoke NOT IMPLEMENTED) |
| P&L by class | IMPLEMENTED |
| AR aging | IMPLEMENTED |
| Balance sheet / AP / transactions | NOT IMPLEMENTED |
| Sync status / timestamps | IMPLEMENTED |
| Rate limits (app-side) | IMPLEMENTED |
| Sandbox support | IMPLEMENTED (config) · SANDBOX VERIFIED: not in this environment |
| Production verified against live Intuit | NOT VERIFIED |

Payroll remains CSV by design (partner-gated APIs).

---

## Data model

### `integration_connections`

Public connection metadata (no secrets). Unique `(client_id, provider)`.

### `integration_credentials`

Optional encrypted payload for non-QBO providers. **QBO tokens stay in `qbo_connections`.**

### `integration_sync_runs`

Append-only history. Connection status is current; runs answer “when did it last work?”.

Statuses: `PENDING` · `RUNNING` · `SUCCESS` · `PARTIAL` · `FAILED` · `CANCELLED`

### `integration_raw_records` / `integration_canonical_records`

Idempotent upsert on `(connection, record_type, external_record_id)` (+ content hash for raw).
Canonical rows carry `sync_run_id`, currency, period key, `synced_at`.

---

## Sync behavior

- **Service boundary:** `syncConnection()` — callable without a browser.
- **Concurrent sync:** one active `PENDING`/`RUNNING` run per connection.
- **Idempotency:** stable external IDs; duplicate content → skip.
- **Partial failure (mock):** invalid rows skipped → run status `PARTIAL`, connection `DEGRADED`.
- **Auth failure:** error class `AUTH` → connection `RECONNECT_REQUIRED` (no infinite retry).
- **QBO writes:** working period P&L/AR only via `applySyncToPeriod` / `syncPeriodIntoLedger`.
  Published release snapshots are never mutated by sync.
- **Legacy `/api/qbo/sync`:** still the Intuit pull; records hub history via
  `recordCompletedQboSync` (no double-pull).

Error classes: `TRANSIENT` · `AUTH` · `RATE_LIMIT` · `VALIDATION` · `PERMANENT` · `UNKNOWN`.

---

## Health & readiness

Connection health: `HEALTHY` · `STALE` (>72h since last success) · `DEGRADED` ·
`RECONNECT_REQUIRED` · `DISCONNECTED`.

Capability readiness (per client): `CURRENT` · `STALE` · `NOT_AVAILABLE` · `ERROR`
for P&L, AR, Payroll, File import — more useful than one green icon.

---

## Security

- Browser never calls provider APIs; all traffic is Hathorn API → service → provider.
- Tokens/secrets never returned in JSON (public DTOs strip token-like metadata keys).
- Staff-only: ADMIN / ADVISOR / BOOKKEEPER. Clients cannot open `/integrations`.
- QBO: AES-256-GCM encryption, OAuth state single-use, rate limits, sanitized errors.
- Disconnect removes credentials/connection; historical imported data is not auto-deleted.
- Webhooks: **not built** until a provider requires them.

---

## Staff UI

- `/integrations` — hub dashboard (connections, readiness, sync now, recent runs)
- `/integrations/[id]` — connection detail + sync history (no tokens)
- Existing client-manage QBO panel remains for OAuth connect/disconnect

---

## Checklist: adding a provider

1. **Adapter** in `lib/integrations/providers/<key>.ts` implementing `IntegrationProvider`
2. **Declare capabilities** honestly — do not fake unsupported ones
3. **Authentication** — OAuth / API key / file; encrypt secrets; never log them
4. **Sync** — idempotent upsert; classify errors; support FULL only when intentional
5. **Normalize** into canonical types or existing ledger writers
6. **Rate limits / retries** — provider-specific; no `while (error) retry`
7. **Webhooks** — only if the provider needs them; verify signatures; idempotent events
8. **Security review** — tenancy, IDOR, redirect URI, secret rotation, logging
9. **Tests** — connect, sync twice (no dupes), fail, auth fail, secret non-exposure
10. **Register** in `lib/integrations/registry.ts`
11. **Sandbox → production** readiness notes in this file

Desired workflow stays boring. Do not redesign Hathorn for every API.

---

## Scheduling

Manual sync is supported now. Daily/hourly policies are **Phase 7** unless simple cron
already exists in the deploy environment (`npm run` jobs). Temporal is future, not now.
