# Production Launch Certification — Hathorn Dashboard

**Date:** 2026-08-11  
**Branch:** `cursor/production-launch-closure-c8e9`  
**Runtime under test:** PostgreSQL staging (`POSTGRES_RUNTIME_ENABLED=1`, app role `hathorn_app` NOBYPASSRLS)  
**Scope:** Close operational gaps only — no new product features.

---

## A. RELEASE VERDICT

`READY FOR CONTROLLED PILOT ONLY`

Postgres runtime, RLS, dated restore, and full proof are green on staging. Multi-firm production is blocked by honest gaps: QuickBooks has no sandbox/production Intuit credentials in this environment, Next.js high CVEs require a controlled major upgrade, and malware scanning is ClamAV-proven for clean files only (no infected-file E2E in CI). Do not soften this.

---

## B. DATABASE

`POSTGRESQL`

- Staging cutover **completed** on this host: app serves from Postgres via worker/atomics bridge (`lib/db-pg.ts`).
- Migration preserved IDs/relationships; financial verify + release counts passed during cutover.
- SQLite `data/ledger.db` retained as rollback (not destroyed).
- Production host cutover (managed Postgres + secrets rotation) is an ops step, not done here.

---

## C. RLS

`VERIFIED`

Protected domains (FORCE RLS on app role): firms, memberships, capabilities, clients, periods, period_locks, release_records, release_deliveries, pl/payroll/ar/cash/balance/budget/volume lines, passthrough/fee/channel/personal_finance, entities, goals, kpi_client_config/inputs/values, story_notes, comments, source_documents, document_extractions/requests, assets, qbo_connections, qbo_account_map, integration_*, fpa_model_runs, tax_*, reconciliations/runs, close_runs/checklist/events/policies, accounting_exceptions, accounting_research_issues, copilot_*, client portal/report/insight tables, financial_signal*, report_templates, advisory_sessions, client_reconciliation_config, audit_logs, ai_usage_events, background_jobs.

Intentionally not FORCE RLS: `users`, `login_attempts`, `oauth_states`, `rate_events`, `password_reset_tokens`, `schema_migrations` (auth bootstrap).

Proof: `npm run db:rls-proof` → **13/13** including pooled connection reuse (Firm A/B).

---

## D. RESTORE

`DATED DRILL VERIFIED` — **2026-08-11** (Postgres) and **2026-08-10** (SQLite)

Evidence: `docs/RESTORE-DRILL-LOG.md`  
Postgres: `pg_dump` → `hathorn_restore_drill` in 351 ms; firms/users/clients/releases/revenue counts matched.

---

## E. QUICKBOOKS

`INTEGRATION TESTED`

No `QBO_CLIENT_ID` / `QBO_CLIENT_SECRET` in this environment. Hub mock/file providers exercised in proof. Do **not** label SANDBOX or PRODUCTION VERIFIED.

---

## F. EXTERNAL SERVICES

| Service | Classification |
|---|---|
| Anthropic | DISABLED (no API key) — Copilot/story degrade to deterministic/tool paths |
| Resend | DISABLED (no API key) — silent no-op sends |
| Docling | DISABLED — native CSV document path verified |
| QuickBooks | INTEGRATION TESTED (credentials absent) |
| Object/file storage | VERIFIED — local writable storage on this host |
| ClamAV | IMPLEMENTED — LIVE clean scan proven when `MALWARE_SCAN_ENABLED=1` |

---

## G. MALWARE SCANNING

`IMPLEMENTED BUT NOT LIVE-PROVEN`

- Flow: upload → ClamAV `clamscan` when enabled → quarantine on infected/error → no parse/AI when `QUARANTINED`.
- Clean scan proven (`scanBytes` → clean; `clamscan` OK).
- Infected-file E2E and production definition freshness not proven in this run.
- When disabled, status is explicit `skipped` — never falsely labeled scanned.

---

## H. SECURITY

| Control | Status |
|---|---|
| Authentication | VERIFIED (login, forgot-password under RLS, MFA available; staff MFA off for staging proof) |
| Tenant isolation | VERIFIED (proof §17 + RLS 13/13 + smoke Firm B block) |
| Client isolation | VERIFIED (proof §6/§20 + portal probes) |
| RLS | VERIFIED (pooled) |
| IDOR | VERIFIED via proof cross-tenant API blocks |
| Upload security | PARTIAL — type/size validation + optional ClamAV; infected path not E2E proven |
| Prompt injection | VERIFIED in prior Copilot proof sections (still green on Postgres) |
| AI tool authorization | VERIFIED (client refused internal tools; Firm B blocked) |
| Secrets | VERIFIED — QBO tokens not in hub JSON; redaction in logs |
| Rate limiting | VERIFIED — password_reset / metered routes |

---

## I. FINANCIAL INTEGRITY

| Check | Result |
|---|---|
| Known-number fixture (Apr 2026 Northbridge) | Rev 190.9 / GP 40.5 / NI 25.1 — PASS (`financial-pg-proof`) |
| Balance sheet equation | Assets ≈ Liabilities + Equity — PASS |
| Release immutability | Checksum + snapshot unchanged after +50K working mutation — PASS |
| Amendment versioning | Proof §7 — PASS on Postgres |
| Reconciliation | Proof §14 — PASS |
| FP&A separation | Forecast does not mutate actuals/releases — PASS |
| Portal published-data consistency | Proof §5/§20 — PASS |

---

## J. UX/UI REGRESSION

Infrastructure changes did **not** break critical routes in HTTP smoke (2026-08-11):

Staff 200: `/today`, `/dash`, `/documents`, `/planning`, `/reconciliations`, `/close`, `/intelligence`, `/ask`, `/platform`  
Client 200: `/portal`, `/portal/insights`, `/portal/reports`, `/portal/statement`  
Login 200; no Application error / hydration failure markers in sampled HTML.

No redesign performed.

---

## K. EXACT TEST RESULTS (Postgres runtime)

```
npm run typecheck          → exit 0
npm run lint               → exit 0 (1 pre-existing font warning)
npm run build              → exit 0
npm run smoke              → 11 passed, 0 failed
npm run proof              → 217 passed, 0 failed
npm run db:rls-proof       → 13 passed, 0 failed
npx tsx scripts/financial-pg-proof.ts → 16 passed, 0 failed
npm run restore:drill      → DATED DRILL VERIFIED (Postgres, 351 ms)
```

Proof log: `/tmp/proof-pg3.txt` (`Result: 217 passed, 0 failed`).

---

## L. REMAINING P0/P1

### P0

1. **QuickBooks real verification** — obtain authorized sandbox (or prod) Intuit credentials; OAuth → sync → idempotency → disconnect; keep label honest until then.
2. **Next.js security closure** — `npm audit` reports high issues on Next 14.2.35; fix path is breaking Next 16. Controlled upgrade PR required before broad multi-firm production internet exposure.
3. **Production Postgres cutover runbook execution** — staging proven; production needs managed DB, migrator vs app roles, backup volume, and rollback rehearsal on the real host.

### P1

4. **Malware infected-file E2E** — prove quarantine blocks parse/AI with a safe EICAR (or equivalent) fixture in CI.
5. **Error monitoring decision** — structured host logs + redaction are primary; dedicated SaaS tracker still DEFERRED (acceptable for controlled pilot; revisit for multi-firm on-call).
6. **Email / Anthropic live verification** — when keys exist, classify SANDBOX/PRODUCTION honestly after one real send/completion.
7. **Close policy multi-firm model** — firm-default `close_policies.client_id IS NULL` is a shared catalog row; acceptable under current RLS but should become per-firm before many firms customize defaults.

---

## Chain status

```
APPLICATION WORKS          ✓ (smoke 11/11, proof 217/217)
POSTGRES WORKS             ✓ (staging runtime)
RLS WORKS                  ✓ (13/13 pooled)
TENANTS ARE ISOLATED       ✓ (API + RLS)
BACKUP RESTORES            ✓ (dated drills)
FINANCIAL HISTORY SURVIVES ✓ (financial-pg-proof + release checksums)
INTEGRATIONS HONEST        ✓ (QBO = INTEGRATION TESTED only)
UPLOADS SAFELY HANDLED     ◐ (ClamAV clean proven; infected E2E pending)
EXTERNAL FAILURES DEGRADE  ✓ (AI/email/QBO off)
FULL REGRESSION PASSES     ✓ (new Postgres certification — not reused SQLite result)
```
