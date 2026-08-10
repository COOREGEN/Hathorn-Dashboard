# Phase 8 migration report

Generated after migration 26 + seed backfill on the demo book.

## Existing records migrated

| Item | Result |
|---|---|
| Firms created | Hathorn Advisory Group (`hathorn-advisory`) + Example CPA Firm (seed fixture) |
| Clients assigned to Hathorn | All seeded Hathorn clients (northbridge, lakeside-stays, bright-path, impact-5) |
| Staff memberships | Regen (ADMIN + platform), Jeremiah, Books → Hathorn |
| Client users | Northbridge owner → Hathorn membership; Harbor owner → Example CPA |
| Orphans (`firm_id` null) | **0** after seed |
| Foreign-key errors | None (SQLite soft FKs; ownership enforced in app) |

## Financial / release integrity

No financial rows were rewritten. Migration only added ownership columns and firm tables. Published release snapshots remain byte-identical to pre-migration content for existing rows (copy-in-place; no recompute).

## Verification commands

```text
npm run seed
npm run tenancy:test          → 10 passed
npm run close:test            → 11 passed
npm run integrations:test     → 13 passed
npm run fpa:test              → 12 passed
npm run documents:test        → 11 passed
npm run tax:test              → 10 passed
npm run research:test         → 11 passed
npm run recon:test            → 12 passed
npm run build                 → success
npm run proof                 → 165 passed, 0 failed
```
