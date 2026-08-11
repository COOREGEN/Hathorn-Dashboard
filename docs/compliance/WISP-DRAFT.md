# Written Information Security Plan (WISP) — DRAFT

**DRAFT — MANAGEMENT / LEGAL REVIEW REQUIRED**

This document is structured to align with themes in **IRS Publication 5708 (Rev. 8-2024)** and supporting guidance in **IRS Publication 4557 (Rev. 5-2024)**. It is a **draft template** for Hathorn Advisory Group’s use of Hathorn Dashboard and related practice systems.

**This is not an adopted policy.** Placeholders must be completed by management and counsel. Do not represent this file as a finalized WISP to the IRS, clients, or auditors.

| Field | Value |
|---|---|
| Organization | `[LEGAL NAME — MANAGEMENT MUST ASSIGN]` |
| EIN | `[PLACEHOLDER — DO NOT COMMIT REAL EIN TO PUBLIC FORKS]` |
| Primary office address | `[PLACEHOLDER]` |
| Plan owner / Coordinator | MANAGEMENT MUST ASSIGN |
| Qualified Individual (if FTC Safeguards applies) | MANAGEMENT MUST ASSIGN — LEGAL REVIEW REQUIRED |
| Effective date | `[NOT ADOPTED]` |
| Next review date | `[NOT SET]` |
| Related systems | Hathorn Dashboard; email; workstation endpoints; hosting; vendors in Service Provider Register |

---

## 1. Objectives

1. Protect the confidentiality, integrity, and availability of customer and taxpayer-related information.  
2. Limit access to those with a business need.  
3. Detect and respond to security events.  
4. Meet applicable legal and professional obligations as determined by counsel — **without claiming certification**.

---

## 2. Scope

**In scope (draft):**

- Hathorn Dashboard production and staging environments  
- User endpoints used by firm personnel to access the Dashboard  
- Backups of the Dashboard database and document storage  
- Service providers listed in `SERVICE-PROVIDER-REGISTER.md` that may process CONFIDENTIAL or RESTRICTED data  

**Out of scope until separately documented:**

- Client-owned systems not operated by the firm  
- Personal devices not used for firm work (still addressed by acceptable use if used)

---

## 3. Information inventory

See `docs/DATA-INVENTORY.md` and `docs/SENSITIVE-DATA-FLOWS.md`.

Summary classes: CONFIDENTIAL financials; RESTRICTED credentials; RESTRICTED tax; RESTRICTED identity (including PII that may appear in uploaded document bytes); PROHIBITED PHI.

---

## 4. Risk assessment

See `docs/compliance/SECURITY-RISK-ASSESSMENT.md` (draft). Management must review and accept residual risk or fund remediation.

Cadence: at least annually, and upon material system changes (new AI vendor, Postgres cutover, new document pipelines).

---

## 5. Safeguards (summary — details in compliance matrix)

| Area | Current technical state (factual) | Policy gap |
|---|---|---|
| Access control | Roles, firm membership, `requireClientAccess`, published-only client portal | Formal joiner/mover/leaver POLICY REQUIRED |
| Authentication | bcrypt 12, password policy, throttle, JWT 8h httpOnly, staff TOTP MFA | Client MFA NOT IMPLEMENTED; recovery UX POLICY |
| Encryption | AES-256-GCM for QBO + MFA secrets; ENCRYPTION_KEY required in PRODUCTION; TLS/HSTS at edge | Documents/backups rely on volume encryption — confirm in hosting POLICY |
| Malware / uploads | MIME/size/path checks; optional ClamAV; quarantine blocks parse/AI/download | Enable scan in production — OPERATIONS decision |
| Monitoring | Audit logs, health endpoints, structured logs | SIEM / on-call POLICY REQUIRED |
| Backup | Online SQLite backup + verify + prune | Offsite + dated drill evidence |
| AI | Kill switches, tool auth, sanitize layer, metadata-only Copilot audit | §7216 LEGAL REVIEW REQUIRED |
| Development | Secure-SDLC draft, automated tests | Pentest EXTERNAL AUDIT REQUIRED |

Full mapping: `docs/FINANCIAL-DATA-COMPLIANCE-MATRIX.md`.

---

## 6. Employee management & training

See `EMPLOYEE-SECURITY-POLICY-DRAFT.md`.

**Training records:** none are stored in this repository. Do not invent completion dates. When training occurs, retain evidence in the firm’s HR/compliance system and optionally place a **redacted** index file under `docs/compliance/evidence/` per the evidence README.

---

## 7. Service providers

See `SERVICE-PROVIDER-REGISTER.md` and `VENDOR-DUE-DILIGENCE-CHECKLIST.md`.

Contractual safeguard language: **LEGAL REVIEW REQUIRED** before reliance.

---

## 8. Detection, response, and notification

See `docs/INCIDENT-RESPONSE.md` and `BREACH-RESPONSE-DECISION-TREE.md`.

**FTC Safeguards breach notification:** if the FTC Rule applies and a notification event involving customer information of **500 or more consumers** occurs, notification to the FTC may be required under the FTC’s breach notice requirements (effective May 2024). Exact triggers, timelines, and content are **LEGAL REVIEW REQUIRED** — do not treat engineering docs as legal advice.

---

## 9. Data retention & disposal

See `DATA-RETENTION-POLICY-DRAFT.md`. Secure disposal procedures for media and cloud volumes: POLICY REQUIRED.

---

## 10. Roles & responsibilities

| Role | Responsibility | Named person |
|---|---|---|
| Plan Coordinator | Maintain this WISP | MANAGEMENT MUST ASSIGN |
| Qualified Individual | Oversee program if FTC applies | MANAGEMENT MUST ASSIGN |
| Engineering lead | Technical controls | MANAGEMENT MUST ASSIGN |
| Firm admin (product) | User provisioning in Dashboard | MANAGEMENT MUST ASSIGN |
| Counsel | Legal applicability, §7216, notices | MANAGEMENT MUST ASSIGN |

---

## 11. Program evaluation

Quarterly review of open items in `MANAGEMENT-ACTION-REGISTER.md` and `TECHNICAL-ACTION-REGISTER.md`. Annual re-approval of this WISP after adoption.

---

## 12. Document control

| Version | Date | Author | Notes |
|---|---|---|---|
| 0.1-DRAFT | 2026-08-11 | Engineering (documentation pass) | Initial draft from technical audit — **not adopted** |

**Adoption signature block (do not sign inside git unless intentional):**

- Management: _______________________ Date: _______  
- Counsel (reviewed): ________________ Date: _______  
