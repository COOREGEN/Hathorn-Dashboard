# Legacy demo data sweep — final result

**Date:** 2026-08-11  
**Follow-up:** Test fixture isolation (`docs/ENVIRONMENT-DATA-SEPARATION.md`)

---

## ACTIVE DATABASE DEMO RECORDS

### Postgres `hathorn_staging` (after purge)

| Kind | Remaining |
|---|---|
| Firms | **Hathorn Advisory Group** only |
| Clients | **Staging Pilot Empty LLC** (intentionally created empty pilot client) |
| Users | `regen@`, `jeremiah@`, `books@` (@hathornadvisorygroup.com) |
| Seed fixtures (Northbridge, Example CPA, …) | **0** |

### Postgres `hathorn_test` (isolated fixtures)

Full seed book: Northbridge, Lakeside, Bright Path, Impact 5, Harbor Dental, Example CPA Firm, `.example` / `.test` users. Used only by automated smoke/proof/RLS/financial proofs.

---

## REMOVED FROM STAGING

Proven seed/fixture families (lineage: `lib/seed.ts`, `lib/seed-verticals.ts`, `lib/seed-management.ts`):

- Clients: northbridge, lakeside-stays, bright-path, impact-5, harbor-dental (+ periods, lines, releases, docs, …)
- Firm: example-cpa (Example CPA Firm)
- Users: `owner@northbridge.example`, `admin@example-cpa.test`, `owner@harbor-dental.test`, `ops-*@test.local`

---

## RETAINED

| What | Where | Why |
|---|---|---|
| Hathorn Advisory Group + staff | staging | Legitimate firm identity for pilot evaluation |
| Staging Pilot Empty LLC | staging | Intentional empty client for empty-state proof |
| Full seed book | **hathorn_test only** | Smoke / proof / RLS / financial known-numbers |
| `samples/*.csv` | repo | Upload fixtures; not auto-attached to accounts |
| Mock integration provider | code | Hidden on STAGING/PRODUCTION unless `ENABLE_MOCK_INTEGRATION=1` |

---

## HARDCODED DEMO DATA

No user-facing fabricated financial fallbacks when data is missing.

---

## EMPTY CLIENT TEST (staging)

**Staging Pilot Empty LLC** on cleaned `hathorn_staging`:

| Surface | Result |
|---|---|
| `/dash?client=<id>` | **No statements yet** — no `$…K` / 190.9 figures |
| Documents | **No documents yet for this client.** |
| Portfolio | **No close on record** / em dashes |
| Client list / portfolio | No Northbridge / Example CPA / Harbor / vertical demos |
| Integrations UI | No Mock Provider |
| Firm staff list | Hathorn emails only — no `.example` / `.test` |

---

## PRODUCTION SEED SAFETY

- `APP_ENV=PRODUCTION` → `npm run seed` exit 1 always
- `ALLOW_DEMO_SEED=1` + `LEDGER_ALLOW_LOCAL_PROD=1` **still refused** on PRODUCTION
- Fixture load / migrate against `*prod*` DB names refused (`lib/ops/db-target.ts`)
- Staging migrate/fixture wipe require explicit confirm flags

---

## TEST ISOLATION

| Suite | Database | Result |
|---|---|---|
| smoke | hathorn_test | 11/11 |
| proof | hathorn_test | 217/217 |
| db:rls-proof | hathorn_test | 13/13 |
| db:financial-proof | hathorn_test | 16/16 |
| ops:test | temp SQLite | 17/17 |
| tenancy / copilot / client-portal | temp SQLite | green |
| typecheck / lint / build | — | green |

Staging is **not** reseeded to make tests pass.

---

## FINAL VERDICT

**CLEAN — TEST FIXTURES ARE ISOLATED AND CANNOT SURFACE IN STAGING/PRODUCTION**
