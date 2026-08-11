# Production readiness matrix — Hathorn Dashboard

Evidence-based. Updated 2026-08-11 after Postgres staging cutover.

| Capability | Status | Evidence |
|---|---|---|
| Authentication | VERIFIED | Auth + proof; forgot-password under RLS; token_version |
| Staff MFA | VERIFIED | MFA flows + production default (off only for staging proof) |
| Tenant isolation | VERIFIED | tenancy:test + proof Firm A/B + RLS pooled proof |
| Release integrity | VERIFIED | release engine + proof publish/amend on Postgres |
| Gate / accounting integrity | VERIFIED | gate + financial-pg-proof known numbers |
| Database (Postgres staging) | VERIFIED | `POSTGRES_RUNTIME_ENABLED=1`; smoke/proof/RLS green |
| Database (SQLite) | VERIFIED | Retained as rollback; not destroyed |
| Restore | **DATED DRILL VERIFIED** | `docs/RESTORE-DRILL-LOG.md` — 2026-08-10 SQLite + 2026-08-11 Postgres |
| RLS | **VERIFIED** | FORCE RLS + `npm run db:rls-proof` 13/13 |
| QBO production | PARTIAL | INTEGRATION TESTED; no Intuit credentials here |
| Document worker | PARTIAL | Native CSV verified; Docling optional/off |
| AI / Copilot | PARTIAL | Works with key; degrades without; proof green without key |
| Background jobs | VERIFIED | ops-unit + proof §21 on Postgres |
| Job idempotency / retry | VERIFIED | ops-unit |
| Health live/ready | VERIFIED | `/api/health/live`, `/ready` |
| Observability (structured logs) | VERIFIED | `log()` + redaction + correlation header |
| Error tracking (SaaS) | DEFERRED | Host logs sufficient for controlled pilot |
| Platform ops console | VERIFIED | `/platform` + `/api/ops/*` |
| Appsmith | NOT NEEDED | First-party ops console |
| Temporal | DEFERRED | Simple queue sufficient |
| Incident runbooks | DOCUMENTED | `docs/INCIDENT-RESPONSE.md` |
| Disaster recovery | DOCUMENTED | `docs/DISASTER-RECOVERY.md` + dated drills |
| Load test | PARTIAL | Historical portal concurrency notes |
| Email | DISABLED / PARTIAL | No RESEND key in this env |
| Malware scanning | IMPLEMENTED BUT NOT LIVE-PROVEN | ClamAV clean path proven; infected E2E pending |
| Billing | NOT READY | Intentionally out of scope |
| Next.js CVE level | PARTIAL | 14.2.35; Next 16 upgrade deferred (breaking) |

## Critical path (minimum useful product)

Must work even when optional systems fail:

1. Authentication  
2. Database  
3. Tenant isolation  
4. Released financials  
5. Client portal read of published releases  

## Feature degradation

| If down | Still works |
|---|---|
| AI | Financials, releases, portal |
| Docling | Uploads; parsing unavailable |
| QBO | Released/historical data; sync unavailable |
| Email | App + publish; notifications fail separately |
| Jobs tick paused | Interactive paths; background retries delay |
| Malware scanner unavailable | Uploads error/quarantine path — never claim clean |

## Restore drill log

| Date | Environment | Result | Notes |
|---|---|---|---|
| 2026-08-10 | STAGING | DATED DRILL VERIFIED | SQLite file-swap + verify |
| 2026-08-11 | STAGING Postgres | DATED DRILL VERIFIED | `pg_dump` → `hathorn_restore_drill`, 351 ms, counts match |

## CI gates

PRs / main should not deploy when critical suites fail: build, typecheck, lint, smoke, proof, tenancy, RLS proof (when Postgres), financial-pg-proof (when Postgres), migration apply.
