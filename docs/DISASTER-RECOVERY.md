# Disaster recovery — Hathorn Dashboard

Executable procedures for the **current** SQLite + local document storage deployment.
Postgres cutover DR will supersede DB sections when runtime moves.

## RPO / RTO (realistic)

| Target | Value | Basis |
|---|---|---|
| RPO | ≤ 1 hour | Hourly `npm run backup` cron |
| RTO | 1–4 hours | Restore snapshot + verify + restart Node process |

These are operational targets, **not** a customer SLA.

## Assets

| Asset | Location | Backup |
|---|---|---|
| Database | `DATA_DIR/ledger.db` | Online SQLite backup → `BACKUP_DIR` |
| Documents | `DATA_DIR/documents/` | Must be backed up with DB (filesystem / volume snapshot) |
| Release snapshots | Inside DB `release_records.snapshot` | Covered by DB backup — never regenerate |
| Encryption / auth secrets | Host secret store | Out-of-band; required to decrypt QBO/MFA material |
| App code | Git | Redeploy known good commit |

## Scenario runbooks

### Database loss

**Symptoms:** `/api/health/ready` → database down; app 503.  
**Impact:** All tenants unavailable.  
**Confirm:** `SELECT 1` fails; disk missing/corrupt.  
**Immediate:** Stop writers; do not invent a new empty DB on the production volume.  
**Recovery:**

```bash
# 1. List verified snapshots
ls -lt "$BACKUP_DIR"

# 2. Verify candidate
npm run restore-check

# 3. Restore (creates safety copy of current file first)
# Use admin Storage UI or programmatic restoreBackup(name)
```

**Verification:** schema version matches; firm/client counts; spot-check a known release checksum; login as platform admin.  
**Escalation:** If no verified snapshot → restore from volume/offsite copy; treat as SEV1.

**RESTORE PROCEDURE DOCUMENTED — verify with `npm run restore-check` after every backup. Full production restore drills should be logged in PRODUCTION-READINESS.**

### Storage loss (documents)

**Symptoms:** Integrity reports `storageReferenceBroken`; downloads 404.  
**Impact:** Source PDFs/CSVs missing; published releases (DB snapshots) still readable.  
**Confirm:** `npm run jobs:tick` integrity / platform integrity check.  
**Immediate:** Stop document deletes; restore `DATA_DIR/documents` from volume backup.  
**Recovery:** Restore files; re-run integrity; do **not** regenerate release snapshots.  
**Verification:** Sample document download for one client; broken count → 0.

### Deployment failure

**Symptoms:** Bad release after deploy; errors spike.  
**Impact:** App behaviour wrong; data may be fine.  
**Confirm:** `appVersion` / `gitCommit` on `/api/health`; error logs.  
**Immediate:** Roll back application to previous git deploy.  
**Recovery:** If migration was expand-only, rollback app is safe. If destructive contract migration shipped — **do not** roll back schema casually; restore DB from pre-migrate backup.  
**Verification:** Health ok; proof suite on staging; spot-check publish path.

### Credential compromise

**Symptoms:** Suspected leak of `AUTH_SECRET`, `ENCRYPTION_KEY`, QBO, or AI keys.  
**Impact:** Session forgery and/or provider access.  
**Confirm:** Access logs / provider audit.  
**Immediate:** Rotate secrets (see OPERATIONS.md); disconnect QBO connections that show AUTH errors; bump sessions via secret rotation.  
**Recovery:** Rotate → restart → force reconnects → review audit_logs.  
**Verification:** Old tokens fail; new logins work; MFA still enrolled.

### Provider outage (AI / QBO / email / Docling)

| Provider | User impact | Ops action |
|---|---|---|
| AI | Copilot/story degraded; financials OK | Confirm kill switch not needed; watch `ai_usage_events` |
| QBO | Sync unavailable; releases OK | Jobs show FAILED/AUTH; retry after provider recovery |
| Email | Notify fails; publish OK | Check Resend; do not unpublish |
| Docling | Parse pending; uploads OK | Retry DOCUMENT_PARSE when worker returns |

### Document worker outage

Same as Docling row — uploads retained; parsing jobs retry/fail visibly on `/platform`.

## Backup policy (SQLite)

| Item | Value |
|---|---|
| Frequency | Hourly (cron) + manual |
| Retention | Grandfather-father-son prune in `lib/backup.ts` |
| Encryption | Rely on volume/disk encryption + access control |
| Storage location | `BACKUP_DIR` off live DB disk |
| Verify | Every snapshot opened + integrity-checked; `npm run restore-check` daily |

## Object storage

Not used. When introduced: enable versioning + retention; DB backup alone is insufficient.

## Multi-region / HA

**Not implemented.** Single Node process + SQLite. Horizontal scale requires Postgres cutover first.
