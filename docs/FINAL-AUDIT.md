# Final audit — Hathorn Dashboard

Release-candidate audit of the **actual repository** after Phases 1–12.
Date: 2026-08-10. Branch: `cursor/release-candidate-audit-c8e9`.

## System inventory

| Layer | Reality |
|---|---|
| Runtime | Next.js 14 App Router (Node) |
| Database | SQLite (`better-sqlite3`); Postgres tooling only |
| Auth | JWT cookie + bcrypt + staff TOTP MFA |
| Charts | Hand SVG + ECharts (planning/intelligence) |
| Jobs | SQLite `background_jobs` |
| Docs storage | Local `DATA_DIR/documents` |
| Product name | **Hathorn Dashboard** |

## Architecture reality

Single Next.js app. Domain modules under `lib/`. Multi-firm tenancy in application code. Immutable releases via `release_records.snapshot`. Optional integrations degrade independently.

## Implemented modules

Authentication · Firm/client admin · Upload/gate/review/publish · Staff dash · Portfolio/Attention · Planning/FP&A (native) · Documents · Tax research · Accounting guidance · Reconciliations · Integration Hub · Close · Exceptions · Copilot · Financial Intelligence · Client portal · Client reports · Platform ops · Backups · Jobs

## Partial modules

| Module | Status |
|---|---|
| QuickBooks | Code + mock/hub tested; not production Intuit-verified |
| Docling worker | Optional; native CSV verified |
| Vendors dash view | Intentionally empty until QBO purchases |
| Postgres runtime / RLS | Tooling + SQL; not live driver |
| Email | Resend wired; delivery depends on key |
| Restore drill | Snapshot verify OK; dated prod drill not recorded |
| Malware scanning | Not implemented |

## Deferred modules

Temporal · Appsmith · Billing · Multi-region · Kafka · OpenFGA · Public status page · Forge (default off) · Fact Graph / RAGFlow pilots

## P0 findings

**None unresolved.** Cross-tenant probes, release immutability, and auth walls held in proof (216/0).

## P1 findings (fixed or accepted)

| Finding | Disposition |
|---|---|
| Product UI still said “Hathorn Ledger” | **FIXED** → Hathorn Dashboard |
| Firm nav pointed `/admin` vs `/firm` inconsistently | **FIXED** — Firm + Firm ops |
| Lint unconfigured (interactive prompt) | **FIXED** — ESLint 8 + next/core-web-vitals |
| Next.js 14.2.x npm audit highs (DoS/cache) | **ACCEPTED limitation** — major bump to 15/16 is out of RC harden scope; track separately |
| Malware scan absent | **DOCUMENTED** — do not claim scanned |

## P2 findings

| Finding | Disposition |
|---|---|
| Favicon 404 | **FIXED** — `/favicon.svg` |
| Staff masthead link density | **FIXED** — primary 9 links; full set on Today footer + dash rail |
| Critical-path smoke script | **ADDED** — `npm run smoke` (11/11 on RC tip after rebuild) |
| Module overlap (Intelligence / Today / Close) | Acceptable summary→drill-down; not collapsed this RC |
| CashOutlookChart explanatory stub | Honest empty — not fake chart |
| `restore-check` fails if live DB diverges after proof | Expected; re-seed + backup before check |

## P3 findings

| Finding | Disposition |
|---|---|
| react-hooks/exhaustive-deps warnings | Non-blocking lint warnings |
| AGENTS.md / CLAUDE.md still say Ledger historically | Intentional archive language; README/PRODUCTION updated |

## Fixes applied (this RC)

- Branding across layout, login, brand mark, dash rail, emails, MFA issuer, staff subtitles
- Nav: Firm `/firm`, Firm ops `/admin`, Today footer + rail
- Vendors empty copy clarified
- ESLint toolchain
- NaN/Infinity guards on money/percent/KPI formatters
- Favicon

## Remaining risks

1. Postgres cutover not done — SQLite concurrency ceiling remains  
2. Next security advisories without major upgrade  
3. QBO/email/Docling not live-production verified  
4. No malware quarantine pipeline  
5. Full restore drill evidence still staging-operator action  

## Integration verification

| Integration | Classification |
|---|---|
| CSV / file import | INTEGRATION TESTED |
| Mock provider | MOCK TESTED |
| QuickBooks | INTEGRATION TESTED (adapter); not PRODUCTION VERIFIED |
| Resend email | PARTIAL (code path; key-dependent) |
| Anthropic AI | PARTIAL (degrades without key; Copilot tools UNIT/E2E tested) |
| Docling | PARTIAL / optional |

## Security verification

Proof § cross-tenant + tenancy:test + copilot adversarial + ops permission walls. See RELEASE-CERTIFICATION.md gates.

## Financial integrity verification

Independent SQLite probe (April 2026 Northbridge seed):

| Metric | Value ($K) |
|---|---:|
| Revenue | 190.9 |
| Direct cost | 150.4 |
| Gross profit | 40.5 |
| Opex | 15.4 |
| Net income | 25.1 |
| Assets | 410.2 |
| Liabilities | 261.3 |
| Equity | 148.9 |
| A − (L+E) | 0.0 |

Release checksum unchanged after working P&L +$50K mutation (**immutability confirmed**).

## Testing evidence

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS (4 warnings) |
| `npm run build` | PASS |
| `npm run ops:test` | 15 passed |
| `npm run tenancy:test` | 10 passed |
| `npm run copilot:test` | 20 passed |
| `npm run client-portal:test` | 8 passed |
| `npm run proof` | **216 passed, 0 failed** |
| `npm run smoke` | **11 passed, 0 failed** |
| `npm run restore-check` | OK (fresh backup) |
| Browser visual QA | PASS (login, today, dash, portal desktop/mobile) |
