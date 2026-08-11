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

**Also treat as credential incidents:**

- Compromised staff TOTP seed backup or password-reset mailbox takeover  
- Accidental commit or log of production secrets (treat repo history as hostile until rotated)  
- Suspected decryption of QBO refresh tokens → disconnect **all** affected connections, rotate `ENCRYPTION_KEY` (keep `ENCRYPTION_KEY_PREVIOUS` only long enough to re-encrypt), force OAuth reconnects  

### Ransomware / destructive encryption

**Symptoms:** DB or `documents/` unreadable; ransom note; mass file extension changes; backup volume also encrypted.  
**Impact:** All tenants; possible permanent loss if backups share the blast radius.  
**Confirm:** Integrity check fails; host AV/EDR; whether `BACKUP_DIR` is writable by the same account as the app.  
**Immediate:** Isolate host/network; do **not** pay as an engineering decision; preserve forensic image if required by counsel; stop writers.  
**Recovery:** Restore DB from **verified offsite** snapshot per restore procedure; restore `documents/` (including `documents/quarantine/` only if needed for forensics — do not re-serve quarantined malware); redeploy known-good git commit; rotate all secrets (assume credential theft accompanied ransomware).  
**Verification:** `npm run restore-check` / health ready; spot-check release checksums; sample portal publish path.  
**Escalation:** SEV1; follow `docs/compliance/BREACH-RESPONSE-DECISION-TREE.md` (**LEGAL REVIEW REQUIRED** for notification, including FTC 500+ consumer information events when applicable).  
**Gap (honest):** App does not app-encrypt backups; offsite/immutable copies are **POLICY / VENDOR ACTION REQUIRED**.

### Tax / taxpayer data exposure

**Symptoms:** Unauthorized access to tax module issues, organizer PDFs, or AI logs containing tax identifiers; cross-tenant read of tax docs.  
**Impact:** Confidentiality of tax return information; potential §7216 and state breach issues.  
**Confirm:** Audit logs, document access paths, Copilot/tool traces (metadata), vendor notices.  
**Immediate:** Contain accounts; disable AI provider if exfil path; quarantine affected documents; notify counsel before client/regulator messages.  
**Recovery:** Per IR + legal instruction; rotate keys if credentials involved; do not “fix” exposure by deleting audit evidence.  
**Verification:** Tenancy probes green; affected users re-authenticated with MFA.  
**Escalation:** SEV1 when confirmed; **LEGAL REVIEW REQUIRED** (`SECTION-7216-DATA-FLOW-REVIEW.md`).

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
