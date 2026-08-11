# Release certification — Hathorn Dashboard

Engineering/accounting truth document. Not marketing.

**Verdict:** `READY FOR CONTROLLED PILOT ONLY` — see `docs/PRODUCTION-LAUNCH-CERTIFICATION.md` (2026-08-11).

Branch audited: `cursor/production-launch-closure-c8e9` (Postgres staging cutover + RLS).

---

## Gates (not a score)

| Gate | Result |
|---|---|
| SECURITY | **PASS** |
| FINANCIAL INTEGRITY | **PASS** |
| TENANT ISOLATION | **PASS** |
| CRITICAL UX | **PASS** |
| CORE WORKFLOW | **PASS** |
| PRODUCTION OPERATIONS | **PASS (staging Postgres)** / production host cutover pending |

---

## Subsystem matrix

| Subsystem | Status | Evidence |
|---|---|---|
| Authentication | VERIFIED | Login/MFA/reset paths; proof auth; throttle |
| Tenant isolation | VERIFIED | tenancy:test + proof Firm A/B + RLS |
| Client isolation | VERIFIED | Client IDOR + portal API probes |
| Database (SQLite) | VERIFIED | Retained as rollback |
| Postgres runtime | **VERIFIED (staging)** | Dual driver live; proof 217/217 |
| RLS | **VERIFIED** | FORCE RLS; `db:rls-proof` 13/13 pooled |
| Financial actuals | VERIFIED | Independent Apr-2026 fixture + BS balance on PG |
| Releases | VERIFIED | Checksum immutable after working mutation |
| Amendments | VERIFIED | Proof lifecycle on Postgres |
| FP&A | VERIFIED | Native engine tests; Forge off by default |
| Documents | VERIFIED | Upload/parse/auth tests |
| Tax | VERIFIED | Unit + proof sections |
| Accounting guidance | VERIFIED | Unit + proof; no unauthorized ASC corpus |
| Reconciliations | VERIFIED | Deterministic payroll/AR/debt suites |
| Integrations | PARTIAL | Hub + mock INTEGRATION TESTED; QBO not PRODUCTION VERIFIED |
| Close | VERIFIED | close:test + proof |
| Copilot | VERIFIED | Grounding + injection + cross-tenant |
| Financial intelligence | VERIFIED | intelligence:test + proof |
| Client portal | VERIFIED | Portal tests + isolation |
| Reports | VERIFIED | Snapshot freeze + portal reports |
| Background jobs | VERIFIED | ops:test + proof §21 |
| Backups / restore | **DATED DRILL VERIFIED** | 2026-08-10 SQLite + 2026-08-11 Postgres |
| Operations | VERIFIED | `/platform` + `/api/ops/*` |
| Malware scanning | IMPLEMENTED BUT NOT LIVE-PROVEN | ClamAV clean path; infected E2E pending |
| Next.js CVE patch level | PARTIAL | 14.2.35; major upgrade deferred |

---

## Security gates (detail)

| Control | Result |
|---|---|
| Authentication | PASS |
| Tenant isolation | PASS |
| Client isolation | PASS |
| RLS | PASS (pooled proof) |
| IDOR | PASS (probed) |
| File security | PASS (path/MIME); ClamAV clean proven; infected E2E not claimed |
| AI tool security | PASS |
| Prompt injection | PASS |
| Secrets in repo | PASS (no live secrets committed; `.env.local` local only) |

## Financial integrity (detail)

| Control | Result |
|---|---|
| Formulas / fixture | PASS |
| Release immutability | PASS |
| Amendments versioned | PASS (suite) |
| Reconciliation semantics | PASS |
| FP&A ≠ actuals | PASS |
| Report/portal consistency | PASS |

---

## Integration status (honest)

| Integration | Status |
|---|---|
| CSV / Excel / file | INTEGRATION TESTED |
| Mock hub provider | MOCK TESTED |
| QuickBooks Online | INTEGRATION TESTED — **not** PRODUCTION VERIFIED |
| Resend | PARTIAL |
| Anthropic | PARTIAL (optional) |
| Docling | PARTIAL (optional) |

---

## Production operations

| Item | Status |
|---|---|
| Database | **Postgres staging runtime verified**; SQLite rollback retained |
| Backups | Hourly cron + dated restore drills (SQLite + Postgres) |
| Jobs | `npm run jobs:tick` |
| Monitoring | Health live/ready + structured logs; SaaS tracker DEFERRED |
| Critical-path smoke | VERIFIED — `npm run smoke` **11/11** on Postgres |
| Full proof | VERIFIED — `npm run proof` **217/217** on Postgres |
| Error handling | Degrade matrix for AI/QBO/email/Docling |
| Performance | Prior portal batching; no new regressions observed |
| Deployment | CI workflow present; Next major upgrade tracked |

---

## Release verdict

**READY FOR CONTROLLED PILOT ONLY**

Postgres + RLS + dated restore + full Postgres proof close the prior operational gaps for a controlled pilot. Multi-firm production still requires: authorized QBO verification, controlled Next.js security upgrade, production host cutover, and infected-file malware E2E.

See `docs/PRODUCTION-LAUNCH-CERTIFICATION.md` sections A–L.
