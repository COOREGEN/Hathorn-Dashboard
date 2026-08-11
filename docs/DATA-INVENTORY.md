# Data inventory & classification

**Status:** DRAFT — MANAGEMENT / LEGAL REVIEW REQUIRED  
**Product:** Hathorn Dashboard (working name Hathorn Ledger)  
**Owner:** MANAGEMENT MUST ASSIGN  
**Last technical refresh:** 2026-08-11 (security/compliance hardening pass)  
**Sources:** FTC Safeguards Rule 16 CFR 314; IRS Pub 5708 Rev 8-2024; IRS Pub 4557 Rev 5-2024; NIST CSF 2.0

This inventory describes categories of data the platform may store or process. It is **not** a legal determination that any particular statute applies to Hathorn Advisory Group or any client. Applicability requires counsel review.

---

## Classification model

| Class | Definition | Handling baseline |
|---|---|---|
| **PUBLIC** | Marketing copy, non-sensitive product docs | No special controls |
| **INTERNAL** | Ops runbooks, non-client configs, anonymized metrics | Staff access; no client portal |
| **CONFIDENTIAL** | Client financial statements, P&L, payroll aggregates, AR, cash, commentary, documents metadata | Firm tenancy + role walls; encryption in transit (TLS); access logged |
| **RESTRICTED — CREDENTIALS** | Passwords (hashes), JWT secrets, QBO tokens, MFA secrets, API keys | AES-256-GCM at rest where implemented; never log plaintext; production `ENCRYPTION_KEY` required |
| **RESTRICTED — TAX** | Tax research issues, estimates, analysis payloads that may include tax identifiers or return-related facts | Minimize; sanitize before AI; Section 7216 LEGAL REVIEW REQUIRED before any new disclosure |
| **RESTRICTED — IDENTITY** | Names, emails, SSNs/EINs if present in uploaded file bytes | No dedicated SSN columns in schema; treat document bytes as potentially identity-bearing |
| **PROHIBITED (not approved)** | PHI/ePHI (HIPAA), full PAN/CVV (PCI card data), unsolicited government ID scans as a product feature | See `docs/compliance/HIPAA-SCOPE.md` — PHI is **not** an approved data type |

### Direction of favour for controls

- Prefer **not collecting** over encrypting after the fact.  
- Prefer **metadata-only audits** over storing user free text that may contain identifiers.  
- Prefer **blocking quarantined files** over scanning-and-hoping.

---

## Inventory table

| Category | Examples in product | Storage location | Classification | Encryption at rest | Who can access | Retention (current) | AI / vendor exposure | Status of controls |
|---|---|---|---|---|---|---|---|---|
| Client master | Name, slug, brand colours, vertical, goals | DB `clients` | CONFIDENTIAL | Volume / host (SQLite file or Postgres); not app-field encrypted | Firm staff (membership); CLIENT users for own client | Until client deleted; POLICY REQUIRED | Brand/name may appear in AI tool JSON after sanitize | IMPLEMENTED (tenancy) |
| Users & auth | Email, role, `client_id`, `token_version`, password hash | DB `users` | RESTRICTED — CREDENTIALS (hash); CONFIDENTIAL (PII) | bcrypt cost 12 for passwords; no plaintext password storage | Self + firm/platform admins per role walls | Until account removed; POLICY REQUIRED | Not sent to AI | IMPLEMENTED |
| Sessions | JWT in httpOnly cookie | Browser cookie + server verify | RESTRICTED — CREDENTIALS | N/A (signed, not encrypted payload relied upon) | Bearer of cookie; 8h TTL; SameSite=lax; `secure` in prod | Session lifetime | None | IMPLEMENTED; middleware does **not** re-check `token_version` (handlers via `getSession` do) — PARTIAL |
| Staff MFA | TOTP secret, backup codes | DB (encrypted) | RESTRICTED — CREDENTIALS | AES-256-GCM (`enc:v1:`) | Enrolling user / reset paths | Until MFA reset | None | IMPLEMENTED (`REQUIRE_STAFF_MFA` default on in production); client MFA **NOT IMPLEMENTED** |
| Period financials | P&L lines, payroll, AR aging, cash, volume | DB period tables | CONFIDENTIAL | Volume/host | Firm staff; CLIENT sees **published** releases only | Indefinite until purge policy; POLICY REQUIRED | Tool JSON to Anthropic after `sanitizeAiPayload` | IMPLEMENTED / VERIFIED (gate + portal tests) |
| Published releases | Immutable snapshot JSON + branding | DB `release_records` | CONFIDENTIAL | Volume/host | Firm staff; CLIENT for own published | Kept forever (amendments supersede; do not delete) — aligns with accounting practice; POLICY REQUIRED to formalize | Published figures may enter Copilot tools | IMPLEMENTED |
| Commentary / notes | What Changed, Action notes | DB notes / story fields | CONFIDENTIAL | Volume/host | Staff edit; clients read published | With period | May enter story agent / Copilot after sanitize | IMPLEMENTED |
| Source documents | Uploaded PDFs/CSVs/images | `DATA_DIR/documents/…`; quarantined under `documents/quarantine/` | CONFIDENTIAL / may contain RESTRICTED — IDENTITY or TAX in **file bytes** | **Not** app-encrypted; volume encryption expected | Firm staff with client access; download blocked if `QUARANTINED` | POLICY REQUIRED | Parse/AI blocked when quarantined; ClamAV when `MALWARE_SCAN_ENABLED=1` (default OFF) | PARTIAL (scan optional; no signed URLs) |
| Document extractions text | Parser / Docling output | DB / worker artifacts | CONFIDENTIAL | Volume/host | Staff with access | POLICY REQUIRED | May be retrieved into AI context after sanitize | PARTIAL (optional worker) |
| QuickBooks tokens | Access + refresh tokens | DB integration rows | RESTRICTED — CREDENTIALS | AES-256-GCM; `ENCRYPTION_KEY` **required** in PRODUCTION | Staff managing integrations; system refresh | Until disconnect | Sent only to Intuit APIs | IMPLEMENTED |
| QBO synced reports | P&L by class, AR aging | Period tables after sync | CONFIDENTIAL | Volume/host | Firm staff | With period | Not sent to QBO outbound as customer tax return | IMPLEMENTED (sandbox live use VENDOR ACTION REQUIRED) |
| Tax module | Issues, analysis, facts | DB tax tables | RESTRICTED — TAX | Volume/host | Firm staff; client-scoped when set | POLICY REQUIRED | Anthropic after sanitize; SSN keys rejected in tax facts | PARTIAL + LEGAL REVIEW REQUIRED (§7216) |
| Copilot conversations | Messages, tool traces, citations | DB copilot tables | CONFIDENTIAL (may include TAX) | Volume/host | Conversation owner + firm scope | POLICY REQUIRED | Anthropic; audit `COPILOT_QUERY` stores **metadata only** (no question text) | IMPLEMENTED (sanitize layer VERIFIED by unit tests) |
| Audit logs | Action, actor, resource ids, truncated detail | DB `audit_logs` | INTERNAL / CONFIDENTIAL metadata | Volume/host | Firm admin / platform | POLICY REQUIRED | None to AI | IMPLEMENTED |
| Email notifications | Publish/reply notices | Resend API (transient) | CONFIDENTIAL (names, links) | Vendor | Recipients | Vendor retention — VENDOR ACTION REQUIRED | Resend | PARTIAL (opt-in; silent no-op without key) |
| Backups | Full DB snapshots | `BACKUP_DIR` | CONFIDENTIAL + CREDENTIALS ciphertext | **Not** app-encrypted; rely on volume + access control | Ops with backup access | GFS prune in `lib/backup.ts` | None | IMPLEMENTED (verify/restore paths); offsite POLICY REQUIRED |
| Logs | Structured app logs | Host log sink | INTERNAL; must not contain secrets | Host | Ops | Host policy — POLICY REQUIRED | Redaction helpers present | PARTIAL |
| Demo / seed data | Criterion & other demos | Local `ledger.db` when seeded | CONFIDENTIAL (synthetic) | Local | Dev | Ephemeral | None in prod if seed refused | IMPLEMENTED (seed refused in PRODUCTION) |

---

## Explicit non-inventory (not product features)

| Item | Status |
|---|---|
| Dedicated SSN / ITIN database columns | **NOT IMPLEMENTED** — tax module rejects SSN-shaped keys; documents may still contain PII in bytes |
| Cardholder data (PAN/CVV) as a payment product | **NOT IMPLEMENTED** — sanitize layer redacts card-shaped strings before AI; do not accept card data as a product input |
| PHI / medical records | **PROHIBITED** — see HIPAA-SCOPE |
| Client MFA | **NOT IMPLEMENTED** |
| Application-level encryption of document files or backup files | **NOT IMPLEMENTED** |

---

## Review cadence

| Trigger | Action |
|---|---|
| New integration or AI tool | Update this inventory + Section 7216 register before enablement |
| New DB table with client data | Classify + tenancy/RLS review |
| Annual | MANAGEMENT MUST ASSIGN owner re-approves inventory |

**Evidence:** schema (`lib/schema.sql` + migrations), `lib/ai/sanitize-context.ts`, `lib/documents/malware.ts`, `lib/security.ts`, `lib/config.ts` (`assertProductionReady`). Do not invent contracts or training records here.
