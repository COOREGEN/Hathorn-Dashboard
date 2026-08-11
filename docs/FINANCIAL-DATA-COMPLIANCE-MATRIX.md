# Financial data compliance control matrix

**Status:** DRAFT — MANAGEMENT / LEGAL REVIEW REQUIRED  
**Not a certification.** This matrix maps technical and operational controls to themes in the FTC Safeguards Rule (16 CFR 314) and IRS WISP guidance (Pub 5708 Rev 8-2024; Pub 4557 Rev 5-2024). It does **not** claim “GLBA compliant,” “IRS compliant,” or “SOC 2 certified.”

**Owner:** MANAGEMENT MUST ASSIGN  
**Review frequency (suggested):** Quarterly technical; annual legal  
**Sources:** see `docs/compliance/SOURCES.md`

### Status vocabulary

IMPLEMENTED · VERIFIED · PARTIAL · NOT IMPLEMENTED · LEGAL REVIEW REQUIRED · POLICY REQUIRED · VENDOR ACTION REQUIRED · EXTERNAL AUDIT REQUIRED

---

## FTC Safeguards Rule — 16 CFR 314.4 elements

### FTC-314.4-a — Designate Qualified Individual

| Field | Content |
|---|---|
| Control ID | FTC-314.4-a |
| Framework | FTC Safeguards Rule 16 CFR 314.4(a) |
| Summary | Designate a Qualified Individual responsible for overseeing the information security program |
| Applicable | UNCERTAIN — depends on whether Hathorn Advisory Group is a “financial institution” under the Rule for the services offered; LEGAL REVIEW REQUIRED |
| Why | FTC requires a named QI if the Rule applies |
| Control Type | Administrative |
| Current Implementation | No Qualified Individual named in repository artifacts |
| Evidence | None on file in `docs/compliance/evidence/` |
| Test | N/A technical |
| Status | POLICY REQUIRED / LEGAL REVIEW REQUIRED |
| Gap | No named QI, no charter |
| Required Action | Counsel determines applicability; management appoints QI in writing |
| Owner | MANAGEMENT MUST ASSIGN |
| Review Frequency | Annual or on org change |

### FTC-314.4-b — Risk assessment

| Field | Content |
|---|---|
| Control ID | FTC-314.4-b |
| Framework | 16 CFR 314.4(b) |
| Summary | Written risk assessment identifying reasonably foreseeable internal/external risks |
| Applicable | UNCERTAIN (same as above) |
| Why | Baseline for selecting safeguards |
| Control Type | Administrative |
| Current Implementation | Draft risk assessment exists: `docs/compliance/SECURITY-RISK-ASSESSMENT.md` |
| Evidence | Draft document only — not management-approved |
| Test | Review that HIGH-RISK areas are covered |
| Status | PARTIAL / POLICY REQUIRED |
| Gap | Needs management sign-off and periodic update cycle |
| Required Action | Approve draft; schedule re-assessment |
| Owner | MANAGEMENT MUST ASSIGN |
| Review Frequency | At least annually; after material changes |

### FTC-314.4-c-1 — Access controls

| Field | Content |
|---|---|
| Control ID | FTC-314.4-c-1 |
| Framework | 16 CFR 314.4(c)(1) |
| Summary | Authenticate and authorize users; limit access to customer information |
| Applicable | YES (if Rule applies); good practice regardless |
| Why | Multi-tenant financial data |
| Control Type | Technical |
| Current Implementation | bcrypt 12; password policy; login throttle; JWT httpOnly 8h; roles ADMIN/ADVISOR/BOOKKEEPER/CLIENT + platform admin; `requireClientAccess` / firm membership; staff TOTP MFA (`REQUIRE_STAFF_MFA`); Postgres RLS when enabled |
| Evidence | `lib/auth.ts`, `middleware.ts`, `lib/tenancy.ts`, tenancy/proof tests, Firm A/B probes |
| Test | `./test.sh` role walls + cross-tenant probes; `npm run tenancy:test` |
| Status | VERIFIED (app-layer); PARTIAL (middleware does not re-check `token_version`; client MFA NOT IMPLEMENTED; RLS not active on default SQLite runtime) |
| Gap | Client MFA; middleware token_version; SQLite lacks DB-enforced RLS |
| Required Action | Decide client MFA; consider middleware session revoke check; Postgres cutover for RLS |
| Owner | MANAGEMENT MUST ASSIGN (product); engineering executes |
| Review Frequency | Per release affecting auth |

### FTC-314.4-c-2 — Encryption / data in transit and at rest

| Field | Content |
|---|---|
| Control ID | FTC-314.4-c-2 |
| Framework | 16 CFR 314.4(c)(2)–(3) themes (encryption / secure development) |
| Summary | Protect customer information in transit and at rest as appropriate |
| Applicable | YES if Rule applies |
| Why | Credentials and financials |
| Control Type | Technical |
| Current Implementation | Transit: host TLS + HSTS headers. At rest: AES-256-GCM for QBO tokens + MFA secrets; `ENCRYPTION_KEY` required in PRODUCTION via `assertProductionReady`. Documents/backups **not** app-encrypted (volume encryption expected). |
| Evidence | `lib/security.ts`, `lib/config.ts`, `next.config.mjs` |
| Test | Unit tests for encrypt/decrypt + key rotation previous-key path; production config guard |
| Status | PARTIAL |
| Gap | Document/backup app encryption absent; TLS termination is host responsibility (VENDOR/ops) |
| Required Action | Confirm volume encryption in production hosting; document TLS cert ownership |
| Owner | MANAGEMENT MUST ASSIGN |
| Review Frequency | Semiannual |

### FTC-314.4-c — Secure development & change

| Field | Content |
|---|---|
| Control ID | FTC-314.4-c-dev |
| Framework | 16 CFR 314.4(c) (information systems / secure development practices) |
| Summary | Develop applications securely; assess change risk |
| Applicable | YES if Rule applies |
| Why | Custom Next.js financial app |
| Control Type | Technical / Administrative |
| Current Implementation | Secure-SDLC draft; CI unit/build; regression + stress suites; validate-on-write; no eval in formulas |
| Evidence | `test.sh`, `stress.sh`, `docs/security/SECURE-SDLC.md`, GitHub Actions CI |
| Test | Suites must stay green; CLEAN CHECKOUT seed section |
| Status | PARTIAL |
| Gap | No formal change CAB; EXTERNAL AUDIT / pentest not completed |
| Required Action | Adopt SDLC doc; schedule pentest (`docs/security/PENTEST-SCOPE.md`) |
| Owner | MANAGEMENT MUST ASSIGN |
| Review Frequency | Per major release |

### FTC-314.4-c — MFA

| Field | Content |
|---|---|
| Control ID | FTC-314.4-c-mfa |
| Framework | 16 CFR 314.4(c)(5) MFA requirement themes (FTC guidance) |
| Summary | Multi-factor authentication for individuals accessing customer information |
| Applicable | UNCERTAIN / likely YES if Rule applies to staff access |
| Why | Staff access full books; clients access published statements |
| Control Type | Technical |
| Current Implementation | Staff TOTP MFA; `REQUIRE_STAFF_MFA` defaults on in production. Client MFA not offered. |
| Evidence | MFA module + config flags |
| Test | MFA enrollment/verify unit/API coverage (as present in suite) |
| Status | PARTIAL |
| Gap | Client MFA; recovery UX beyond email reset |
| Required Action | Legal/product decision on client MFA; improve recovery |
| Owner | MANAGEMENT MUST ASSIGN |
| Review Frequency | Annual |

### FTC-314.4-c — Audit logging / monitoring

| Field | Content |
|---|---|
| Control ID | FTC-314.4-c-audit |
| Framework | 16 CFR 314.4(c) monitoring themes |
| Summary | Detect unauthorized access / use |
| Applicable | YES if Rule applies |
| Why | Tenancy breaches, MFA disable, role elevation |
| Control Type | Technical |
| Current Implementation | `audit_logs`; Copilot metadata-only audits; structured logs with redaction helpers; `/api/health` |
| Evidence | Audit event names in code; ops docs |
| Test | Audit assertions in suites where present |
| Status | PARTIAL |
| Gap | No centralized SIEM; no 24/7 monitoring contract |
| Required Action | Define log retention + alert owners |
| Owner | MANAGEMENT MUST ASSIGN |
| Review Frequency | Quarterly |

### FTC-314.4-d — Continuous monitoring / annual pen test / vulnerability

| Field | Content |
|---|---|
| Control ID | FTC-314.4-d |
| Framework | 16 CFR 314.4(d) |
| Summary | Continuous monitoring **or** annual penetration testing + biannual vulnerability assessment |
| Applicable | UNCERTAIN |
| Why | FTC program element |
| Control Type | Administrative / Technical |
| Current Implementation | Internal adversarial suites; `npm audit` manual; pentest scope drafted — **no external pentest evidence on file** |
| Evidence | `docs/security/PENTEST-SCOPE.md` only |
| Test | N/A until vendor engaged |
| Status | NOT IMPLEMENTED (external) / PARTIAL (internal tests) |
| Gap | EXTERNAL AUDIT REQUIRED |
| Required Action | Engage qualified tester; track findings |
| Owner | MANAGEMENT MUST ASSIGN |
| Review Frequency | Annual (pentest) / continuous (monitoring choice) |

### FTC-314.4-e — Training

| Field | Content |
|---|---|
| Control ID | FTC-314.4-e |
| Framework | 16 CFR 314.4(e) |
| Summary | Security awareness training for personnel |
| Applicable | UNCERTAIN |
| Why | Human error / phishing |
| Control Type | Administrative |
| Current Implementation | Draft employee policy only — **no training completion records invented or on file** |
| Evidence | `docs/compliance/EMPLOYEE-SECURITY-POLICY-DRAFT.md` |
| Test | None |
| Status | POLICY REQUIRED |
| Gap | No curriculum, cadence, or attendance evidence |
| Required Action | Adopt policy; deliver training; retain records outside git if PII |
| Owner | MANAGEMENT MUST ASSIGN |
| Review Frequency | Annual |

### FTC-314.4-f — Service providers

| Field | Content |
|---|---|
| Control ID | FTC-314.4-f |
| Framework | 16 CFR 314.4(f) |
| Summary | Oversee service providers; contractual safeguards; periodic assessment |
| Applicable | YES if Rule applies (vendors process customer information) |
| Why | Resend, Anthropic, Intuit, hosting, optional ClamAV/Docling |
| Control Type | Administrative |
| Current Implementation | Register + diligence checklist drafted; **no signed DPAs/contracts stored in repo** |
| Evidence | `SERVICE-PROVIDER-REGISTER.md`, `VENDOR-DUE-DILIGENCE-CHECKLIST.md` |
| Test | N/A |
| Status | PARTIAL / VENDOR ACTION REQUIRED / LEGAL REVIEW REQUIRED |
| Gap | Missing executed agreements evidence |
| Required Action | Complete diligence; execute agreements; revisit annually |
| Owner | MANAGEMENT MUST ASSIGN |
| Review Frequency | Annual + on new vendor |

### FTC-314.4-g — Program evaluation

| Field | Content |
|---|---|
| Control ID | FTC-314.4-g |
| Framework | 16 CFR 314.4(g) |
| Summary | Evaluate and adjust the information security program |
| Applicable | UNCERTAIN |
| Why | Continuous improvement |
| Control Type | Administrative |
| Current Implementation | Management action register drafted |
| Evidence | `MANAGEMENT-ACTION-REGISTER.md` |
| Test | Review open actions |
| Status | POLICY REQUIRED |
| Gap | No scheduled board/management review minutes on file |
| Required Action | Calendar quarterly program review |
| Owner | MANAGEMENT MUST ASSIGN |
| Review Frequency | At least annually |

### FTC-314.4-h — Incident response

| Field | Content |
|---|---|
| Control ID | FTC-314.4-h |
| Framework | 16 CFR 314.4(h); FTC breach notification (customer information of 500+ consumers — effective May 2024 guidance) |
| Summary | Written incident response plan; notify FTC when threshold event occurs (LEGAL REVIEW for timing/content) |
| Applicable | UNCERTAIN |
| Why | Ransomware / credential / cross-tenant events |
| Control Type | Administrative |
| Current Implementation | `docs/INCIDENT-RESPONSE.md` + `BREACH-RESPONSE-DECISION-TREE.md` (draft) |
| Evidence | Draft docs only |
| Test | Tabletop — NOT YET EVIDENCED |
| Status | PARTIAL / LEGAL REVIEW REQUIRED |
| Gap | No counsel-approved notification templates; no tabletop records |
| Required Action | Legal review of FTC 500+ event path; run tabletop |
| Owner | MANAGEMENT MUST ASSIGN |
| Review Frequency | Annual tabletop |

### FTC-314.4 — Encryption of customer information (program theme)

Covered under FTC-314.4-c-2. Documents/backups remain volume-dependent — PARTIAL.

---

## IRS WISP / Pub 5708 & Pub 4557 — key themes

### IRS-WISP-1 — Written Information Security Plan

| Field | Content |
|---|---|
| Control ID | IRS-WISP-1 |
| Framework | IRS Pub 5708 Rev 8-2024 |
| Summary | Maintain a written information security plan appropriate to the practice |
| Applicable | UNCERTAIN — whether and how Pub 5708 applies to this SaaS + CPA firm use case needs LEGAL REVIEW |
| Why | Tax professional security baseline |
| Control Type | Administrative |
| Current Implementation | `docs/compliance/WISP-DRAFT.md` placeholders |
| Evidence | Draft only |
| Test | N/A |
| Status | POLICY REQUIRED / LEGAL REVIEW REQUIRED |
| Gap | Not adopted; placeholders for people/locations |
| Required Action | Counsel + management complete and adopt |
| Owner | MANAGEMENT MUST ASSIGN |
| Review Frequency | Annual |

### IRS-WISP-2 — Employee / contractor management

| Field | Content |
|---|---|
| Control ID | IRS-WISP-2 |
| Framework | Pub 5708 / Pub 4557 |
| Summary | Background, access on/off boarding, acceptable use |
| Applicable | UNCERTAIN |
| Why | Insider risk to taxpayer data |
| Control Type | Administrative |
| Current Implementation | Draft employee security policy; technical offboarding notes in IR doc |
| Evidence | Drafts only — **no HR records in repo** |
| Test | N/A |
| Status | POLICY REQUIRED |
| Gap | No attested onboarding checklist evidence |
| Required Action | Adopt HR procedures outside the application repo |
| Owner | MANAGEMENT MUST ASSIGN |
| Review Frequency | Per hire/termination |

### IRS-WISP-3 — Access / authentication

| Field | Content |
|---|---|
| Control ID | IRS-WISP-3 |
| Framework | Pub 4557 / Pub 5708 |
| Summary | Strong passwords, MFA, least privilege |
| Applicable | YES for platform operators and firm staff using the product |
| Why | Tax and financial data concentration |
| Control Type | Technical |
| Current Implementation | Password policy + throttle + staff MFA; role model; firm tenancy |
| Evidence | Auth modules + tests |
| Test | Auth hardening sections in `test.sh` / `stress.sh` |
| Status | PARTIAL (client MFA absent; QI/admin procedures POLICY) |
| Gap | Same as FTC MFA |
| Required Action | Product decision + policy |
| Owner | MANAGEMENT MUST ASSIGN |
| Review Frequency | Semiannual |

### IRS-WISP-4 — Media / device / remote work

| Field | Content |
|---|---|
| Control ID | IRS-WISP-4 |
| Framework | Pub 4557 |
| Summary | Protect endpoints that access taxpayer info |
| Applicable | YES for firm personnel |
| Why | Browser access to portal/admin |
| Control Type | Administrative |
| Current Implementation | **NOT IMPLEMENTED** in product (endpoint MDM is out of band) |
| Evidence | None |
| Test | None |
| Status | POLICY REQUIRED |
| Gap | No MDM/disk-encryption attestation process documented as adopted |
| Required Action | Write and enforce endpoint standards for staff |
| Owner | MANAGEMENT MUST ASSIGN |
| Review Frequency | Annual |

### IRS-WISP-5 — Data backup & recovery

| Field | Content |
|---|---|
| Control ID | IRS-WISP-5 |
| Framework | Pub 5708 |
| Summary | Backups, tested restores |
| Applicable | YES |
| Why | Ransomware / disk failure |
| Control Type | Technical |
| Current Implementation | Online SQLite backup, verify, GFS prune, restore closes DB first; admin Storage UI |
| Evidence | `lib/backup.ts`, `docs/DISASTER-RECOVERY.md`, `RESTORE-DRILL-LOG.md` template |
| Test | Backup/restore assertions in `test.sh` (suite restores DB — re-seed between suites) |
| Status | IMPLEMENTED / PARTIAL (dated production drill may be missing) |
| Gap | Offsite encrypted copies; production drill evidence |
| Required Action | Complete dated drill; confirm offsite |
| Owner | MANAGEMENT MUST ASSIGN |
| Review Frequency | Monthly verify; annual full drill |

### IRS-WISP-6 — Incident response & disclosure

| Field | Content |
|---|---|
| Control ID | IRS-WISP-6 |
| Framework | Pub 5708; FTC notice; state laws |
| Summary | Detect, respond, notify as required |
| Applicable | UNCERTAIN (notification laws vary) |
| Why | Taxpayer harm |
| Control Type | Administrative |
| Current Implementation | IR + breach decision tree drafts |
| Evidence | Drafts |
| Test | Tabletop not evidenced |
| Status | LEGAL REVIEW REQUIRED |
| Gap | Counsel-approved playbooks |
| Required Action | Legal review register items |
| Owner | MANAGEMENT MUST ASSIGN |
| Review Frequency | Annual |

### IRS-WISP-7 — §7216 disclosure restrictions

| Field | Content |
|---|---|
| Control ID | IRS-WISP-7 |
| Framework | 26 U.S.C. §7216 + regs |
| Summary | Restrict use/disclosure of tax return information |
| Applicable | UNCERTAIN per flow — LEGAL REVIEW REQUIRED |
| Why | AI vendors, email, hosting may receive tax-related content |
| Control Type | Administrative / Technical |
| Current Implementation | Sanitize layer; tax fact SSN key rejection; vendor register; §7216 flow review draft |
| Evidence | `lib/ai/sanitize-context.ts`, Section 7216 doc |
| Test | `scripts/security-unit.ts` sanitize cases |
| Status | PARTIAL / LEGAL REVIEW REQUIRED |
| Gap | Consent/disclosure legal strategy; vendor contract terms |
| Required Action | Complete legal review register |
| Owner | MANAGEMENT MUST ASSIGN |
| Review Frequency | Per new vendor/AI feature |

### IRS-WISP-8 — Disposal / retention

| Field | Content |
|---|---|
| Control ID | IRS-WISP-8 |
| Framework | Pub 5708 |
| Summary | Retain and dispose of customer info securely |
| Applicable | YES |
| Why | DB + documents + backups |
| Control Type | Administrative / Technical |
| Current Implementation | Draft retention policy; technical purge jobs **not** fully productized for all classes |
| Evidence | `DATA-RETENTION-POLICY-DRAFT.md` |
| Test | None for legal hold |
| Status | POLICY REQUIRED |
| Gap | Adopted retention schedule + secure disposal procedure |
| Required Action | Management adopt; engineering implement purge where approved |
| Owner | MANAGEMENT MUST ASSIGN |
| Review Frequency | Annual |

---

## Cross-cutting technical controls (supporting evidence)

| Control ID | Summary | Status |
|---|---|---|
| TECH-AI-1 | AI kill switches, tool auth, hostile refusals, sanitize before Anthropic | IMPLEMENTED |
| TECH-AI-2 | Copilot audit metadata-only (no question text) | IMPLEMENTED |
| TECH-DOC-1 | MIME/size/path traversal controls | VERIFIED |
| TECH-DOC-2 | ClamAV optional; quarantine blocks parse/AI/download | PARTIAL (default OFF) |
| TECH-HDR-1 | CSP, HSTS, nosniff, frame-ancestors none | IMPLEMENTED |
| TECH-SECRET-1 | No secrets in localStorage; `.env` gitignored; demo password treated weak | IMPLEMENTED |
| TECH-TENANT-1 | Firm A/B isolation proofs | VERIFIED (app-layer) |

---

## How to use this matrix

1. Legal determines **Applicable** columns that are UNCERTAIN.  
2. Management assigns owners (replace “MANAGEMENT MUST ASSIGN”).  
3. Evidence folders receive **real** artifacts only — see `docs/compliance/evidence/README.md`.  
4. Do not alter Status to “compliant” — use the vocabulary above.
