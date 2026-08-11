# Compliance evidence folder

**Purpose:** Index where *real* evidence lives.  
**Rule:** Do **not** invent certificates, screenshots, signatures, training rosters, or vendor SOC reports.

## What belongs here

| Artifact type | Example filename pattern | Notes |
|---|---|---|
| Redacted index of counsel memo | `YYYY-MM-DD-counsel-7216-index.md` | No privileged full memo in public git unless intentional |
| Restore drill log excerpt | pointer to `docs/RESTORE-DRILL-LOG.md` | Date + operator + result |
| Pentest report hash / ticket | `YYYY-MM-DD-pentest-index.md` | Store full report in private vault |
| Vendor diligence checklist completed | `YYYY-MM-DD-vendor-anthropic.md` | No secrets |
| MFA / access review export | Prefer private vault | If committed, redact emails |
| Host encryption attestation | `YYYY-MM-DD-volume-encryption.md` | Screenshot refs offline |

## What does **not** belong here

- Production secrets, API keys, connection strings  
- Live client financial extracts  
- Fake “SOC 2 Type II” PDFs  
- Invented training completion lists  

## Already available technical evidence (in repo, not duplicated)

| Evidence | Location |
|---|---|
| Auth / tenancy / gate / backup tests | `test.sh`, `stress.sh`, unit scripts under `scripts/` |
| AI sanitize unit checks | `scripts/security-unit.ts` |
| Copilot adversarial tests | `scripts/copilot-unit.ts` / `npm run copilot:test` |
| RLS SQL | `docs/postgres-rls.sql` |
| Security headers config | `next.config.mjs` |
| Production config guards | `lib/config.ts` `assertProductionReady` |
| Source list for frameworks | `docs/compliance/SOURCES.md` |

## Current contents

As of the documentation pass that created this README, **no management-signed artifacts are claimed**. An empty or sparse directory is honest.

When adding evidence, update the relevant row in `MANAGEMENT-ACTION-REGISTER.md` or `TECHNICAL-ACTION-REGISTER.md` with a relative link.
