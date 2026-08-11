# Legacy demo data sweep

Targeted audit: demo/sample content must not leak into real application use.
Test fixtures may remain when isolated to LOCAL/TEST (or explicit staging reset flags).

**Checked:** codebase + active Postgres staging DB (`hathorn_staging`) + local SQLite `data/ledger.db`.
**Date:** 2026-08-11

---

## ACTIVE DATABASE DEMO RECORDS

### Postgres (`hathorn_staging`) — active runtime when `POSTGRES_RUNTIME_ENABLED=1`

| Kind | Records |
|---|---|
| Firms | **Hathorn Advisory Group** (`hathorn-advisory`), **Example CPA Firm** (`example-cpa`) |
| Clients | **Northbridge Home Care**, **Lakeside Stays LLC**, **Bright Path Early Learning**, **Impact 5 Property Management**, **Harbor Dental Group** |
| Users | `regen@` / `jeremiah@` / `books@` (Hathorn staff), `owner@northbridge.example`, `admin@example-cpa.test`, `owner@harbor-dental.test` |
| Periods | 21 (20 PUBLISHED, 1 IN_REVIEW) |
| Release records | 32 |
| Source documents | 21 |
| Client reports | 1 |

These rows are the **`npm run seed`** advisory book (plus vertical / multi-firm isolation fixtures). They appear in staff portfolio, client pickers, portal, and dash when this database is the live book.

### SQLite (`data/ledger.db`)

| Kind | Records |
|---|---|
| Clients | **Northbridge Home Care** only |
| Users | regen / jeremiah / books / `owner@northbridge.example` |

Local file leftover from seed; not the Postgres staging runtime above.

---

## REMOVED

**No database rows deleted.** Seeded clients are required by `rc-smoke.sh`, `workflow-proof.sh`, `financial-pg-proof.ts`, and RLS / tenancy proofs. Deleting them would break CI and staging proof harnesses.

**Code / UX leak paths closed in this sweep:**

1. **New-client form placeholder** — was `Northbridge Home Care`; now `Client legal name` (`components/new-client-button.tsx`).
2. **Mock integration provider** — no longer listed or selectable on STAGING/PRODUCTION unless `ENABLE_MOCK_INTEGRATION=1` (`lib/integrations/registry.ts`).
3. **Seed refuse on STAGING** — `lib/seed.ts` and `scripts/seed-demo-book.ts` use `allowDemoSeed()` so STAGING without `ALLOW_DEMO_SEED=1` exits 1 (same family as PRODUCTION).
4. **Config / `.env.example`** — document `ENABLE_MOCK_INTEGRATION` and reinforce that mock is not ambient on staging/production.
5. **Ops unit coverage** — STAGING seed denial + mock gating assertions in `scripts/ops-unit.ts`.

**Transient empty-client probe** — `Empty Sweep Audit LLC` was created for empty-state verification and deleted afterward (no residual row).

---

## RETAINED TEST FIXTURES

| Fixture | Where | Why retained | Why it cannot reach a clean production book |
|---|---|---|---|
| Northbridge + vertical clients (Lakeside, Bright Path, Impact 5) | `lib/seed.ts`, `lib/seed-verticals.ts`, `lib/seed-management.ts` | Smoke / proof / financial known-number fixture | Seed refused on PRODUCTION (and on STAGING without `ALLOW_DEMO_SEED=1`). `npm start` / `npm run dev` never call seed. |
| Example CPA Firm + Harbor Dental | `lib/seed.ts` | Cross-firm isolation probes | Same seed gate; only exists after deliberate seed. |
| `owner@northbridge.example`, `*.test` users | seed | Role / portal / firm-B login proofs | Demo passwords; never auto-created at boot. |
| Mock integration provider | `lib/integrations/providers/mock.ts` | Hub connect/sync/idempotency tests | Hidden unless `ENABLE_MOCK_INTEGRATION=1` on STAGING/PRODUCTION. |
| Synthetic research / lease training source | `lib/research/model.ts` | Accounting guidance unit tests | Not a client, period, or chart series. |
| `samples/*.csv` | repo | Upload / E2E gate demos | File fixtures only; not loaded into DB at runtime. |
| `scripts/seed-demo-book.ts` (20 synthetic portfolio names) | opt-in script | Density testing | Same `allowDemoSeed()` refuse; not part of `npm run seed`. |

---

## HARDCODED DEMO DATA

**User-facing financial figures:** none found that substitute for missing client data.

Empty / missing data paths use honest copy, e.g.:

- Dash / portal: **“No statements yet”**
- Documents: **“No documents yet for this client.”**
- Charts (`EChart`): **“No data yet”** / planning-specific empty labels
- Cash outlook: refuses to invent a forecast

**Brand studio** still draws unlabeled geometric bars with copy **“Specimen — not this client's figures”** and KPI glyphs `——`. That is a layout specimen, not fabricated client metrics.

**Staff with a seeded staging DB** will still *see* Northbridge etc. — those are real rows in that database, not UI fallbacks.

---

## EMPTY CLIENT TEST

Created client **Empty Sweep Audit LLC** (slug `empty-sweep-audit-llc`) on the live staging book, then inspected staff surfaces (client id required on `/dash?client=`):

| Surface | Observed |
|---|---|
| `/dash?client=<id>` | **No statements yet** twice in HTML; no `$…K` financial figures for the empty book |
| Documents (`?client=<slug>`) | Library: **No documents yet for this client.** |
| Portfolio row | Trend/Revenue/Margin/Cover = **—**; why = **No close on record**; score 25 (urgency from missing close only) |
| Known seed figures (190.9 / 96.1 / …) on empty dash | **Absent** |

Client row deleted after each probe (`DELETE /api/admin/clients/<id>`). Seeded demo clients remain visible in the same portfolio list — that is the active DB, not an empty-client fallback.

**Post-change verification (2026-08-11):** `npm run typecheck` · `npm run build` · `npm run smoke` **11/11** · `npm run proof` **217/217** · `npm run ops:test` **16/16** (SQLite / `APP_ENV=LOCAL`).

---

## PRODUCTION SEED SAFETY

| Path | Auto-loads demo data? |
|---|---|
| `npm start` / `npm run dev` | **No** — never invokes seed |
| `APP_ENV=PRODUCTION` `npm run seed` | **Refused** (exit 1), even with `ALLOW_DEMO_SEED=1` unless `LEDGER_ALLOW_LOCAL_PROD=1` |
| `APP_ENV=STAGING` `npm run seed` | **Refused** unless `ALLOW_DEMO_SEED=1` |
| `APP_ENV=LOCAL` / `TEST` | Seed allowed (developer / CI only) |
| Mock hub provider on STAGING/PRODUCTION | Off unless `ENABLE_MOCK_INTEGRATION=1` |

Verified this run: STAGING seed without flag → exit 1; PRODUCTION + `ALLOW_DEMO_SEED=1` without `LEDGER_ALLOW_LOCAL_PROD` → exit 1; STAGING mock list → `quickbooks`, `file` only.

**Ops note:** Shipping a database file that was previously seeded *will* show demo clients. Production hosts must start from an empty migrated schema, not a copied seed DB.

---

## FINAL VERDICT

**PARTIAL — TEST/DEMO DATA COULD STILL SURFACE**

- Code paths and empty-client UI do **not** invent financials when data is missing.
- Production/staging cannot **automatically** seed demo data.
- The **active staging database still contains the full seed book**, so any staff session against this DB still lists Northbridge, Example CPA Firm, and related demo users/periods. That is intentional for proof harnesses; it is not a clean production book.

A greenfield production database (migrate schema, never seed, never copy a seed file) with `APP_ENV=PRODUCTION` and no `ALLOW_DEMO_SEED` / `ENABLE_MOCK_INTEGRATION` would not surface these fixtures.
