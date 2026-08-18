# Section 7216 data-flow review

**DRAFT — LEGAL REVIEW REQUIRED**  
**Owner:** MANAGEMENT MUST ASSIGN (Counsel + management)  
**Statute:** 26 U.S.C. §7216 and applicable Treasury regulations  
**Purpose:** Identify every vendor/system that **may** receive tax return information or taxpayer identity in connection with Hathorn Dashboard, so counsel can determine consent, exception, or prohibition.

Engineering **cannot** conclude that a flow is “7216 compliant.” This document only describes technical reality.

---

## How to read this document

| Column | Meaning |
|---|---|
| May receive tax-related data? | Based on product capability, not on whether a particular firm enables the feature |
| Sanitization | Technical redaction before send, if any |
| Legal status | Always starts as LEGAL REVIEW REQUIRED until counsel updates |

---

## Vendor / recipient inventory

### 1. Anthropic (Claude API) — Copilot & tax analysis

| | |
|---|---|
| Data that may flow | Staff/client questions (transient to API); structured tool JSON (financials, tax issue fields, document snippets); model outputs returned to app |
| Controls | Kill switches; tool auth; `sanitizeAiPayload` / `sanitizeAiContext` (SSN/EIN/bank/secrets/card-shaped); tax facts reject SSN keys; Copilot audit stores metadata only (no question text) |
| Residual | Full tool JSON after sanitize can still describe taxpayer finances; free-text may evade regex |
| May receive tax-related data? | **YES — possible** |
| Legal status | **LEGAL REVIEW REQUIRED** |
| Contract / DPA on file in repo? | No — VENDOR ACTION REQUIRED |
| Recommended counsel questions | Is use “disclosure” under §7216? Is provider a permitted recipient? Is consent required? Retention at Anthropic? Training opt-out? |

### 2. Intuit QuickBooks Online

| | |
|---|---|
| Data that may flow | OAuth tokens; P&L/AR report pulls **into** Hathorn; not a tax e-file channel in this product |
| Controls | Encrypted tokens; single-use OAuth state; gate after sync |
| May receive tax-related data? | **UNCERTAIN** — books data may underlie tax prep elsewhere; outbound from Hathorn is API calls for accounting reports |
| Legal status | **LEGAL REVIEW REQUIRED** (interaction with tax prep workflows) |
| Contract | Intuit developer / QBO terms — VENDOR ACTION REQUIRED to archive |

### 3. Resend (email)

| | |
|---|---|
| Data that may flow | Names, emails, period labels, portal links; comment notification context |
| Controls | Fire-and-forget; optional (no-op without key); should not attach full returns |
| May receive tax-related data? | **POSSIBLE** if notice content references tax matters |
| Legal status | **LEGAL REVIEW REQUIRED** |
| Contract | VENDOR ACTION REQUIRED |

### 4. Hosting / infrastructure provider (compute, volumes, TLS)

| | |
|---|---|
| Data that may flow | Entire DB + documents at rest on volume; TLS termination; logs |
| Controls | Host-dependent encryption; access control; app does not app-encrypt documents/backups |
| May receive tax-related data? | **YES** if tax docs/financials stored |
| Legal status | **LEGAL REVIEW REQUIRED** |
| Contract | VENDOR ACTION REQUIRED — name host in Service Provider Register when selected |

### 5. ClamAV (optional local/scanner process)

| | |
|---|---|
| Data that may flow | File bytes submitted to `clamscan` when `MALWARE_SCAN_ENABLED=1` |
| Controls | Optional; quarantine on infected/error |
| May receive tax-related data? | **YES** if scanned files contain tax docs |
| Legal status | **LEGAL REVIEW REQUIRED** (usually local subprocess — confirm deployment topology: local vs remote scanning service) |
| Contract | If using a hosted malware API instead of local ClamAV — treat as new vendor |

### 6. Docling / document intelligence worker (optional)

| | |
|---|---|
| Data that may flow | Document bytes / extracted text |
| Controls | Feature flags; quarantined docs blocked from parse |
| May receive tax-related data? | **YES — possible** |
| Legal status | **LEGAL REVIEW REQUIRED** |
| Contract | VENDOR ACTION REQUIRED if third-party hosted |

### 7. Forge / experimental research tools (optional)

| | |
|---|---|
| Data that may flow | Research prompts / guidance queries if enabled |
| Controls | Experimental warnings; kill switches |
| May receive tax-related data? | **POSSIBLE** if enabled with taxpayer facts |
| Legal status | **LEGAL REVIEW REQUIRED** — prefer keep disabled for tax return information until counsel approves |

### 8. Postgres managed service (optional)

| | |
|---|---|
| Data that may flow | Full relational dataset including tax module tables |
| Controls | RLS scripts when enabled; TLS to DB typical of managed providers |
| May receive tax-related data? | **YES** |
| Legal status | **LEGAL REVIEW REQUIRED** |
| Contract | VENDOR ACTION REQUIRED |

### 9. Browser / end-user device

| | |
|---|---|
| Data that may flow | Rendered statements, downloads, Copilot answers |
| Controls | httpOnly cookies (no token in localStorage); client portal read-only |
| May receive tax-related data? | **YES** for authorized users |
| Legal status | Firm acceptable use / engagement letter — **LEGAL REVIEW REQUIRED** |

### 10. Backup storage location (`BACKUP_DIR` / offsite)

| | |
|---|---|
| Data that may flow | Full DB snapshots (all classes) |
| Controls | Access control; verify; not app-encrypted |
| May receive tax-related data? | **YES** |
| Legal status | **LEGAL REVIEW REQUIRED** |

---

## Product paths that elevate §7216 sensitivity

1. Tax module analysis calling Anthropic  
2. Copilot `getTaxIssue` / document search retrieving return-related PDFs  
3. Uploaded organizer / prior-year return PDFs in documents  
4. Email mentioning tax deliverables  

---

## Technical mitigations (do not substitute for legal consent)

| Mitigation | Status |
|---|---|
| No SSN columns in DB | IMPLEMENTED |
| Tax facts reject SSN keys | IMPLEMENTED |
| AI sanitize layer | IMPLEMENTED |
| Copilot audit without question text | IMPLEMENTED |
| AI kill switches | IMPLEMENTED |
| Explicit taxpayer consent capture UX | **NOT IMPLEMENTED** — LEGAL/PRODUCT |

---

## Counsel checklist (placeholder)

- [ ] Determine whether firm is a “tax return preparer” for §7216 purposes for each service line  
- [ ] Map each row above to permitted disclosure / consent / exception  
- [ ] Approve or forbid Anthropic for tax return information  
- [ ] Approve engagement letter / portal terms language  
- [ ] Archive vendor agreements  

**Sign-off:** MANAGEMENT MUST ASSIGN / Counsel — Date _______
