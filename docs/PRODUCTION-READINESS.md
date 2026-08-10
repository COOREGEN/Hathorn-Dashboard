# Production readiness matrix — Hathorn Dashboard

Evidence-based. Update when drills run.

| Capability | Status | Evidence |
|---|---|---|
| Authentication | VERIFIED | Auth unit/proof; throttle; token_version |
| Staff MFA | VERIFIED | MFA flows + production default |
| Tenant isolation | VERIFIED | tenancy:test + proof Firm A/B probes |
| Release integrity | VERIFIED | release engine + proof publish/amend |
| Gate / accounting integrity | VERIFIED | gate + proof financial fixtures |
| Database backup (SQLite) | VERIFIED | `npm run backup` + verify on create |
| Restore | PARTIAL | `npm run restore-check` verifies snapshots; **full prod drill — DOCUMENT date when run** |
| Postgres runtime | NOT READY | Tooling only; dual driver not shipped |
| RLS | PARTIAL | SQL + docs; not runtime-enforced on SQLite |
| QBO production | PARTIAL | Code complete; live Intuit not proven here |
| Document worker | PARTIAL | Native CSV verified; Docling optional |
| AI / Copilot | PARTIAL | Works with key; degrades without; adversarial tests in proof |
| Background jobs | VERIFIED | ops-unit + jobs table + tick script |
| Job idempotency / retry | VERIFIED | ops-unit |
| Health live/ready | VERIFIED | `/api/health/live`, `/ready` |
| Observability (structured logs) | VERIFIED | `log()` + redaction + correlation header |
| Error tracking (SaaS) | DEFERRED | Host logs first |
| Platform ops console | VERIFIED | `/platform` + `/api/ops/*` |
| Appsmith | NOT NEEDED | First-party ops console |
| Temporal | DEFERRED | Simple queue sufficient |
| Incident runbooks | DOCUMENTED | `docs/INCIDENT-RESPONSE.md` |
| Disaster recovery | DOCUMENTED | `docs/DISASTER-RECOVERY.md` |
| Load test | PARTIAL | Historical portal concurrency notes; Phase 12 targeted ops tests only |
| Email | PARTIAL | Integration present; delivery unexercised without key |
| Malware scanning | NOT READY | Documented gap |
| Billing | NOT READY | Intentionally out of scope |

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

## Scale gates (observe, then act)

| Signal | Next evaluation |
|---|---|
| SQLite concurrency pain / multi-instance need | Postgres runtime + dual driver |
| Jobs >> current tick capacity | Dedicated worker process / more tick frequency |
| Document corpus search limits | Dedicated search (not automatic) |
| Multi-region latency/availability demand | Only after single-region HA on Postgres |

## Restore drill log

| Date | Environment | Result | Notes |
|---|---|---|---|
| 2026-08-10 | Local/STAGING (RC audit) | SNAPSHOT VERIFY OK | `npm run backup` then `npm run restore-check` after fresh seed — integrity ok, 428 rows / 14 tables counted. Full file-swap restore to a separate DATA_DIR not yet operated in this drill. |

## CI gates

PRs / main should not deploy when critical suites fail: build, tenancy, release/proof accounting paths, auth, migration apply (clean checkout / schema version).
