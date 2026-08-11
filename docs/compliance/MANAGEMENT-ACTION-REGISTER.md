# Management action register

**DRAFT — MANAGEMENT / LEGAL REVIEW REQUIRED**  
**Owner:** MANAGEMENT MUST ASSIGN  
**Purpose:** Track non-engineering decisions and program adoption items. Do not mark complete without real evidence.

| ID | Action | Priority | Status | Owner | Due | Evidence pointer |
|---|---|---|---|---|---|---|
| M-01 | Determine FTC Safeguards Rule applicability to the firm/product | P0 | LEGAL REVIEW REQUIRED | MANAGEMENT MUST ASSIGN | `[SET]` | Counsel memo (not in repo yet) |
| M-02 | Appoint Qualified Individual / WISP Coordinator in writing | P0 | POLICY REQUIRED | MANAGEMENT MUST ASSIGN | `[SET]` | Signed appointment |
| M-03 | Adopt WISP (replace draft placeholders) | P0 | POLICY REQUIRED | MANAGEMENT MUST ASSIGN | `[SET]` | Adopted WISP version |
| M-04 | Approve Security Risk Assessment | P0 | POLICY REQUIRED | MANAGEMENT MUST ASSIGN | `[SET]` | Signed SRA |
| M-05 | Complete §7216 review for Anthropic, Resend, host, Docling | P0 | LEGAL REVIEW REQUIRED | MANAGEMENT MUST ASSIGN | `[SET]` | Counsel checklist in Section 7216 doc |
| M-06 | Decide client MFA product requirement | P1 | POLICY REQUIRED | MANAGEMENT MUST ASSIGN | `[SET]` | Product decision record |
| M-07 | Adopt employee security policy + training cadence | P0 | POLICY REQUIRED | MANAGEMENT MUST ASSIGN | `[SET]` | Policy + training tracker (HR) |
| M-08 | Adopt data retention schedule + legal hold process | P1 | POLICY REQUIRED | MANAGEMENT MUST ASSIGN | `[SET]` | Adopted retention policy |
| M-09 | Name production hosting provider; complete diligence | P0 | VENDOR ACTION REQUIRED | MANAGEMENT MUST ASSIGN | `[SET]` | Service provider register |
| M-10 | Execute / archive vendor DPAs (Anthropic, Resend, Intuit, host) | P0 | VENDOR ACTION REQUIRED | MANAGEMENT MUST ASSIGN | `[SET]` | Contract vault (not git) |
| M-11 | Authorize enabling `MALWARE_SCAN_ENABLED=1` in production | P0 | POLICY REQUIRED | MANAGEMENT MUST ASSIGN | `[SET]` | Ops change record |
| M-12 | Confirm volume encryption + offsite backups for DB/docs | P0 | VENDOR ACTION REQUIRED | MANAGEMENT MUST ASSIGN | `[SET]` | Host config screenshots in evidence/ |
| M-13 | Schedule tabletop for breach decision tree (incl. FTC 500+ fork) | P1 | POLICY REQUIRED | MANAGEMENT MUST ASSIGN | `[SET]` | Tabletop notes |
| M-14 | Engage external penetration test | P1 | EXTERNAL AUDIT REQUIRED | MANAGEMENT MUST ASSIGN | `[SET]` | Pentest report |
| M-15 | Decide SOC 2 timeline (or defer) | P2 | POLICY REQUIRED | MANAGEMENT MUST ASSIGN | `[SET]` | Decision record |
| M-16 | Affirm PHI prohibition in client engagement terms | P0 | LEGAL REVIEW REQUIRED | MANAGEMENT MUST ASSIGN | `[SET]` | Engagement letter language |
| M-17 | Quarterly review of this register + technical register | P1 | POLICY REQUIRED | MANAGEMENT MUST ASSIGN | Recurring | Meeting notes |

## Status vocabulary

POLICY REQUIRED · LEGAL REVIEW REQUIRED · VENDOR ACTION REQUIRED · EXTERNAL AUDIT REQUIRED · IN PROGRESS · DONE

When an item becomes DONE, link a real artifact under `docs/compliance/evidence/` or the firm’s private compliance vault. **Never invent signatures.**
