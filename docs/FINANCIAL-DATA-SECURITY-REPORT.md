# Financial data security & compliance package — executive index

**DRAFT — MANAGEMENT / LEGAL REVIEW REQUIRED**  
**Product:** Hathorn Dashboard  
**Audience:** Management, counsel, engineering  
**Technical baseline:** 2026-08-11 hardening pass  
**Owner:** MANAGEMENT MUST ASSIGN  

### Hard boundaries

This package maps controls and drafts operational documents. It does **not** certify:

- “GLBA compliant”  
- “IRS compliant”  
- “SOC 2 certified”  
- “HIPAA compliant”  

Use statuses only: **IMPLEMENTED · VERIFIED · PARTIAL · NOT IMPLEMENTED · LEGAL REVIEW REQUIRED · POLICY REQUIRED · VENDOR ACTION REQUIRED · EXTERNAL AUDIT REQUIRED**.

Sources: `docs/compliance/SOURCES.md` (FTC Safeguards 16 CFR 314; IRS Pub 5708 Rev 8-2024; Pub 4557 Rev 5-2024; ASVS 5.0.0; AISVS 1.0; NIST CSF 2.0).

---

## Document map

| # | Document | Purpose |
|---|---|---|
| 1 | [DATA-INVENTORY.md](./DATA-INVENTORY.md) | Classification model + inventory |
| 2 | [SENSITIVE-DATA-FLOWS.md](./SENSITIVE-DATA-FLOWS.md) | Real data-flow diagrams |
| 3 | [FINANCIAL-DATA-COMPLIANCE-MATRIX.md](./FINANCIAL-DATA-COMPLIANCE-MATRIX.md) | FTC 314.4 + IRS WISP control matrix |
| 4 | [compliance/WISP-DRAFT.md](./compliance/WISP-DRAFT.md) | Draft WISP (Pub 5708-aligned placeholders) |
| 5 | [compliance/SECURITY-RISK-ASSESSMENT.md](./compliance/SECURITY-RISK-ASSESSMENT.md) | Qualitative risk register |
| 6 | [compliance/SECTION-7216-DATA-FLOW-REVIEW.md](./compliance/SECTION-7216-DATA-FLOW-REVIEW.md) | Vendor tax-data exposure review |
| 7 | [compliance/SERVICE-PROVIDER-REGISTER.md](./compliance/SERVICE-PROVIDER-REGISTER.md) | Vendor inventory |
| 8 | [compliance/DATA-RETENTION-POLICY-DRAFT.md](./compliance/DATA-RETENTION-POLICY-DRAFT.md) | Retention draft |
| 9 | [compliance/EMPLOYEE-SECURITY-POLICY-DRAFT.md](./compliance/EMPLOYEE-SECURITY-POLICY-DRAFT.md) | Workforce policy draft |
| 10 | [compliance/BREACH-RESPONSE-DECISION-TREE.md](./compliance/BREACH-RESPONSE-DECISION-TREE.md) | Breach forks incl. FTC 500+ |
| 11 | [compliance/SOC2-READINESS.md](./compliance/SOC2-READINESS.md) | Readiness bands — **not certified** |
| 12 | [compliance/HIPAA-SCOPE.md](./compliance/HIPAA-SCOPE.md) | PHI not approved |
| 13 | [compliance/MANAGEMENT-ACTION-REGISTER.md](./compliance/MANAGEMENT-ACTION-REGISTER.md) | Management open actions |
| 14 | [compliance/LEGAL-REVIEW-REGISTER.md](./compliance/LEGAL-REVIEW-REGISTER.md) | Counsel queue |
| 15 | [compliance/TECHNICAL-ACTION-REGISTER.md](./compliance/TECHNICAL-ACTION-REGISTER.md) | Engineering DONE + P0/P1 |
| 16 | [compliance/evidence/README.md](./compliance/evidence/README.md) | Evidence rules (no fake artifacts) |
| 17 | [security/ASVS-MATRIX.md](./security/ASVS-MATRIX.md) | ASVS 5.0.0 L2 target mapping |
| 18 | [security/AISVS-MATRIX.md](./security/AISVS-MATRIX.md) | AISVS 1.0 for Copilot/tax AI |
| 19 | [security/SECURE-SDLC.md](./security/SECURE-SDLC.md) | Secure development practice |
| 20 | [security/PENTEST-SCOPE.md](./security/PENTEST-SCOPE.md) | External test scope |
| 21 | [SECURITY-HARDENING.md](./SECURITY-HARDENING.md) | Hardening notes (ClamAV current) |
| 22 | [AI-SECURITY.md](./AI-SECURITY.md) | AI controls + CLIENT_TOOLS + sanitize |
| 23 | [DISASTER-RECOVERY.md](./DISASTER-RECOVERY.md) | DR incl. ransomware / tax exposure |
| 24 | [INCIDENT-RESPONSE.md](./INCIDENT-RESPONSE.md) | IR + FTC notification pointer |
| 25 | [compliance/VENDOR-DUE-DILIGENCE-CHECKLIST.md](./compliance/VENDOR-DUE-DILIGENCE-CHECKLIST.md) | Per-vendor diligence |
| 26 | [compliance/NIST-CSF-2-MAPPING.md](./compliance/NIST-CSF-2-MAPPING.md) | Lightweight CSF 2.0 map |

---

## Technical snapshot (facts from audit)

| Area | State |
|---|---|
| Auth | bcrypt 12, password policy, login throttle, JWT httpOnly 8h SameSite=lax, `token_version` on reset, staff TOTP MFA (`REQUIRE_STAFF_MFA`), roles + platform admin; client MFA **NOT IMPLEMENTED**; middleware does not re-check `token_version` |
| Encryption | AES-256-GCM for QBO + MFA secrets; `ENCRYPTION_KEY` **required** in PRODUCTION; documents/backups **not** app-encrypted; transit = host TLS + HSTS |
| Tenancy | `requireClientAccess`, firm membership, Firm A/B proofs; Postgres RLS when enabled; SQLite app-only |
| Documents | MIME/size/path checks; ClamAV when `MALWARE_SCAN_ENABLED=1` (default OFF); quarantine blocks parse/AI/download; path `documents/quarantine/`; no signed URLs |
| AI | Kill switches, tool auth, hostile refusals, sanitize layer, Copilot audit metadata-only; tax facts reject SSN keys; tool JSON may still go to model after sanitize |
| Secrets hygiene | No localStorage secrets; `.env` gitignored; demo password blocked as weak; reset URL not logged with token |
| Headers | CSP, HSTS, nosniff, etc. in `next.config.mjs` |
| Vendors | Resend, Anthropic, Intuit QBO, ClamAV, optional Docling/Forge; Postgres optional |
| SSN | No SSN DB fields; tax module rejects; document bytes may contain PII |

**Fixes just shipped (see TECHNICAL-ACTION-REGISTER DONE):** AI sanitize; quarantine download block + path; ENCRYPTION_KEY prod require; reset URL logging; Copilot audit metadata-only.

---

## Final gates table

| Gate | Status | Notes |
|---|---|---|
| Production refuses to start without `AUTH_SECRET` + `ENCRYPTION_KEY` + base URL | VERIFIED (code guard) | `assertProductionReady` |
| Staff MFA available / required in prod flag | IMPLEMENTED | Client MFA NOT IMPLEMENTED |
| Password hashing & policy | VERIFIED | bcrypt 12 |
| Session cookie flags | IMPLEMENTED | httpOnly, secure in prod, SameSite=lax |
| Session revoke on password reset | PARTIAL | `token_version` in `getSession`; not middleware |
| Tenant / firm isolation (app layer) | VERIFIED | Automated Firm A/B probes |
| Postgres RLS defense-in-depth | PARTIAL | Scripts exist; default runtime SQLite |
| Gate + immutable publish | VERIFIED | `lib/gate.ts` / `lib/release.ts` |
| QBO/MFA secret encryption | IMPLEMENTED | AES-256-GCM |
| Document path/MIME safety | VERIFIED | |
| Malware scanning | PARTIAL | Optional ClamAV; enable in prod = management decision |
| Quarantine enforcement | IMPLEMENTED | Parse/AI/download blocked |
| AI kill switches + tool auth | IMPLEMENTED | |
| AI sanitize before provider | IMPLEMENTED | Unit-tested patterns — not legal anonymization |
| Copilot question text excluded from audit | IMPLEMENTED | |
| Security headers | IMPLEMENTED | |
| Backup create/verify/restore procedures | IMPLEMENTED | Dated prod drill may be missing |
| Offsite / ransomware-resistant backups | PARTIAL / VENDOR ACTION REQUIRED | |
| Written WISP adopted | POLICY REQUIRED | Draft only |
| FTC QI designated | POLICY REQUIRED / LEGAL REVIEW REQUIRED | |
| §7216 vendor disclosures cleared | LEGAL REVIEW REQUIRED | |
| Service provider contracts on file | VENDOR ACTION REQUIRED | |
| Employee training evidenced | POLICY REQUIRED | None invented |
| External penetration test | EXTERNAL AUDIT REQUIRED | Scope drafted |
| SOC 2 certification | NOT IMPLEMENTED | Readiness doc only — **not certified** |
| HIPAA program | NOT IMPLEMENTED | PHI prohibited |
| GLBA / IRS “compliant” claim | Forbidden | Do not use |

---

## What management should do next

1. Work `MANAGEMENT-ACTION-REGISTER.md` P0 rows (QI, WISP, vendors, malware-on, offsite backups).  
2. Counsel clears `LEGAL-REVIEW-REGISTER.md` (especially §7216 + FTC 500+).  
3. Engineering closes `TECHNICAL-ACTION-REGISTER.md` P0/P1.  
4. Place only **real** artifacts under `compliance/evidence/`.  

Until those complete, treat residual program risk as **HIGH** even where technical controls are strong.
