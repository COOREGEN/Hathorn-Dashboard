# Data retention policy — DRAFT

**DRAFT — MANAGEMENT / LEGAL REVIEW REQUIRED**  
**Owner:** MANAGEMENT MUST ASSIGN  
**Related systems:** Hathorn Dashboard DB, document storage, backups, logs, vendor copies

This draft proposes retention classes for discussion. It is **not** an adopted schedule. Legal holds, engagement letters, and state/federal recordkeeping rules for CPA firms may require longer retention than engineering defaults.

---

## Principles

1. Retain what professional standards and contracts require.  
2. Do not retain unrestricted AI prompt logs containing identifiers (Copilot audit is metadata-only — IMPLEMENTED).  
3. Published release snapshots are **accounting records** — prefer amend/supersede over delete.  
4. Secure disposal must cover DB rows, files, backups, and vendor copies.

---

## Proposed schedule (for counsel/management edit)

| Data class | Proposed retention | Technical reality today | Disposal notes |
|---|---|---|---|
| Published releases & amendments | Permanent (or firm professional minimum — often 7+ years) | Kept; supersede model | Do not silent-delete |
| Working (unpublished) period data | Until published/amended + `[X years]` | Indefinite until manual delete | POLICY REQUIRED |
| Source documents | Match engagement file retention `[X years]` | Files on volume; quarantine subtree | Secure delete + backup lag |
| Copilot conversations | `[90 days / 1 year — DECIDE]` | Stored in DB | Purge job NOT IMPLEMENTED |
| Audit logs | `[1–7 years — DECIDE]` | Stored in DB | Purge NOT IMPLEMENTED |
| Auth logs / login attempts | `[90 days]` | Ephemeral tables exist for throttle | Align with security needs |
| Backups | GFS in `lib/backup.ts` (week/day/month) | IMPLEMENTED prune | Confirm offsite copies follow same or longer |
| Email at Resend | Vendor default | Unknown — VENDOR ACTION REQUIRED | Configure vendor retention |
| AI provider logs | Vendor default | Unknown — VENDOR ACTION REQUIRED | Require no-training / retention terms |
| Quarantined malware files | Until security review + `[30 days]` | Under `documents/quarantine/` | Manual review process POLICY REQUIRED |
| Tax module issues | Match tax file retention | DB | LEGAL REVIEW |
| Disabled user accounts | `[1 year]` then anonymize | Soft patterns vary | POLICY REQUIRED |

---

## Legal hold

When litigation or investigation is reasonably anticipated, suspension of deletion is **POLICY REQUIRED**. Product has no dedicated legal-hold flag today — **NOT IMPLEMENTED**.

---

## Client offboarding

| Step | Status |
|---|---|
| Export engagement deliverables | PARTIAL (portal/PDF print; server PDF backlog) |
| Delete/anonymize client in app | Confirm actual delete paths before promising — verify in code at time of use |
| Purge documents + quarantine | Manual/ops |
| Backup lag awareness | Backups may retain data until pruned |
| Vendor purge requests | VENDOR ACTION REQUIRED |

---

## Adoption

| Role | Signature | Date |
|---|---|---|
| Management | MANAGEMENT MUST ASSIGN | `[NOT ADOPTED]` |
| Counsel review | MANAGEMENT MUST ASSIGN | `[NOT ADOPTED]` |
