# Incident response — Hathorn Dashboard

Lightweight process. Not a regulatory notification playbook.

## Severity

| Sev | Examples |
|---|---|
| SEV1 | Cross-tenant data exposure; data corruption; authentication bypass |
| SEV2 | Major outage; all integrations down; client portal unavailable |
| SEV3 | Single optional feature degraded (AI, Docling, email) |

## Lifecycle

1. **Identify** — health endpoints, structured logs (`correlationId`), `/platform` jobs/usage  
2. **Contain** — kill switches (`AI_PROVIDER_ENABLED=0`, etc.), disable memberships, rotate secrets, stop bad deploy  
3. **Preserve evidence** — do not overwrite DB; take backup; export relevant `audit_logs` metadata  
4. **Rotate credentials** — as needed (OPERATIONS.md)  
5. **Restore service** — rollback app or restore DB per DISASTER-RECOVERY.md  
6. **Assess tenants** — which firms/clients touched (metadata only in ops tools)  
7. **Document timeline** — open/close `ops_incidents` or external note; include `appVersion` / `gitCommit`

## Data corruption

If accounting data may be wrong:

- Do **not** auto-overwrite historical releases
- Preserve backup, release snapshots, audit logs, source documents
- Investigate before mutation; prefer amendment workflow for published months

## Runbooks (quick)

### QuickBooks reconnect required

**Symptoms:** Connection health `RECONNECT_REQUIRED`; sync jobs FAIL with AUTH.  
**Impact:** New sync unavailable; released data OK.  
**Confirm:** `/platform` client diagnostics → integrations.  
**Immediate:** Do not retry forever. Ask firm admin to reconnect OAuth.  
**Recovery:** Reconnect → manual sync → job SUCCEEDED.  
**Verification:** `last_successful_sync_at` fresh; no AUTH errors.  
**Escalation:** SEV3 unless many tenants.

### Document parser down

**Symptoms:** DOCUMENT_PARSE / extractions FAILED; Docling flag on but worker errors.  
**Impact:** Uploads OK; parsing unavailable.  
**Confirm:** health `document_worker`; job error_code.  
**Immediate:** Leave originals on disk; optional `DOCUMENT_INTELLIGENCE_ENABLED=0`.  
**Recovery:** Fix worker → retry job from `/platform`.  
**Verification:** New extraction draft appears; original hash unchanged.  
**Escalation:** SEV3.

### AI provider unavailable

**Symptoms:** Copilot 503 / warning; `ai_usage_events` error_class `rate_limit` / `provider_5xx`.  
**Impact:** AI features only.  
**Confirm:** `/api/health` integrations.ai; Anthropic status.  
**Immediate:** Financials stay up; optional `AI_PROVIDER_ENABLED=0` for clean degrade.  
**Recovery:** Provider returns → re-enable. Never auto-publish drafts.  
**Verification:** Copilot answers again; releases untouched.  
**Escalation:** SEV3.

### Failed DB migration

**Symptoms:** Ready degraded `schema applied != expected`; deploy abort.  
**Impact:** App may refuse or misbehave.  
**Confirm:** `/api/health` schema block; migrate logs.  
**Immediate:** Stop rollout; restore pre-migrate backup if mid-apply.  
**Recovery:** Expand/contract — fix forward preferred; destructive rollback only with backup.  
**Verification:** schema match; `npm run proof` on staging.  
**Escalation:** SEV1/2.

### Failed report generation

**Symptoms:** REPORT_GENERATE FAILED; client missing PDF.  
**Impact:** Delivery only — release snapshot remains.  
**Confirm:** job detail; release still ACTIVE.  
**Immediate:** Do not create duplicate published versions; retry job.  
**Recovery:** Retry → verify checksum tie to release.  
**Verification:** Download matches release.  
**Escalation:** SEV3.

### Database restore

See DISASTER-RECOVERY.md.  
**RESTORE PROCEDURE DOCUMENTED — NOT YET CLAIMED AS PRODUCTION-DRILL VERIFIED until dated evidence is recorded in PRODUCTION-READINESS.md.**

### Object storage unavailable

Today: local disk. If volume full/unmounted — free space or remount; integrity check for broken refs.

## Access offboarding (engineers)

Revoke: GitHub, host admin, `BACKUP_DIR`/DB volume, Resend, Anthropic, Intuit developer, DNS.  
Rotate any shared secrets the person could access. Prefer individual accounts — no shared platform admin login.

## Security events (high value)

Watch audit / logs for: MFA disabled, admin created, role elevated, integration credentials changed, repeated auth failures. No fake “AI security score”.
