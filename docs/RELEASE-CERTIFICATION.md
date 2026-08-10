# Release certification — Hathorn Dashboard

Engineering/accounting truth document. Not marketing.

**Verdict:** see bottom and agent final response.

Branch audited: `cursor/release-candidate-audit-c8e9` (from Phase 12 tip).

---

## Gates (not a score)

| Gate | Result |
|---|---|
| SECURITY | **PASS** |
| FINANCIAL INTEGRITY | **PASS** |
| TENANT ISOLATION | **PASS** |
| CRITICAL UX | **PASS** |
| CORE WORKFLOW | **PASS** |
| PRODUCTION OPERATIONS | **PARTIAL** |

---

## Subsystem matrix

| Subsystem | Status | Evidence |
|---|---|---|
| Authentication | VERIFIED | Login/MFA/reset paths; proof auth; throttle |
| Tenant isolation | VERIFIED | tenancy:test + proof Firm A/B |
| Client isolation | VERIFIED | Client IDOR + portal API probes |
| Database (SQLite) | VERIFIED | Schema 30; integrity checks |
| Postgres runtime | DEFERRED | Tooling only |
| RLS | PARTIAL | SQL present; not runtime-enforced on SQLite |
| Financial actuals | VERIFIED | Independent Apr-2026 fixture + BS balance |
| Releases | VERIFIED | Checksum immutable after working mutation |
| Amendments | VERIFIED | Prior proof lifecycle |
| FP&A | VERIFIED | Native engine tests; Forge off by default |
| Documents | VERIFIED | Upload/parse/auth tests |
| Tax | VERIFIED | Unit + proof sections |
| Accounting guidance | VERIFIED | Unit + proof; no unauthorized ASC corpus |
| Reconciliations | VERIFIED | Deterministic payroll/AR/debt suites |
| Integrations | PARTIAL | Hub + mock INTEGRATION TESTED; QBO not PRODUCTION VERIFIED |
| Close | VERIFIED | close:test + proof |
| Copilot | VERIFIED | Grounding + injection + cross-tenant |
| Financial intelligence | VERIFIED | intelligence:test + proof |
| Client portal | VERIFIED | Portal tests + visual QA + isolation |
| Reports | VERIFIED | Snapshot freeze + portal reports |
| Background jobs | VERIFIED | ops:test + proof §21 |
| Backups | VERIFIED | create + restore-check OK |
| Operations | VERIFIED | `/platform` + `/api/ops/*` |
| Malware scanning | BLOCKED / NOT READY | Documented gap |
| Next.js CVE patch level | PARTIAL | 14.2.35; major upgrade deferred |

---

## Security gates (detail)

| Control | Result |
|---|---|
| Authentication | PASS |
| Tenant isolation | PASS |
| Client isolation | PASS |
| RLS | PARTIAL (not live) |
| IDOR | PASS (probed) |
| File security | PASS (path/MIME); malware NOT claimed |
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
| Database | SQLite production path supported |
| Backups | Hourly cron documented; verify OK |
| Jobs | `npm run jobs:tick` |
| Monitoring | Health live/ready + structured logs |
| Error handling | Degrade matrix for AI/QBO/email/Docling |
| Performance | Prior portal batching; no new regressions observed |
| Deployment | CI workflow present; Next major upgrade tracked |

---

## Release verdict

**READY WITH KNOWN NON-BLOCKING LIMITATIONS**

Core security, tenancy, financial integrity, publish/portal, and critical UX gates pass with evidence.

Limitations that do **not** block a controlled firm pilot, but must stay visible:

1. QuickBooks not production-Intuit verified  
2. Postgres/RLS runtime not cut over  
3. Malware scanning not implemented  
4. Next.js 14.x advisory backlog (upgrade project)  
5. Email/Docling optional and environment-dependent  
6. Restore **snapshot verify** OK; full disaster drill still an operator calendar item  

Any unresolved **P0** would force NOT READY — none found.
