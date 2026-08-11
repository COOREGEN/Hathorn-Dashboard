# Security risk assessment — DRAFT

**DRAFT — MANAGEMENT / LEGAL REVIEW REQUIRED**  
**Owner:** MANAGEMENT MUST ASSIGN  
**Method:** Qualitative (likelihood × impact → inherent risk; residual after controls)  
**Scale:** LOW · MEDIUM · HIGH · CRITICAL  
**Sources:** FTC Safeguards themes; IRS Pub 5708/4557; ASVS 5.0.0; AISVS 1.0; NIST CSF 2.0  
**Technical baseline date:** 2026-08-11

This assessment reflects the **audited technical state** of Hathorn Dashboard. It does not invent completed trainings, contracts, or external audits.

---

## Risk register (high-priority areas)

### R-01 Cross-tenant / cross-firm data exposure

| | |
|---|---|
| Description | Firm A user reads/writes Firm B or Client B data via IDOR, AI tools, or jobs |
| Inherent | **CRITICAL** |
| Existing controls | `requireClientAccess`, firm membership, Copilot tool auth, Firm A/B proofs, optional Postgres RLS |
| Residual | **MEDIUM** on SQLite (app-only enforcement); **LOW–MEDIUM** with RLS enabled and proven |
| Status | PARTIAL |
| Action | Keep probes green; prioritize Postgres RLS runtime; expand probes for every new client-facing route |

### R-02 Credential / session compromise (staff)

| | |
|---|---|
| Description | Stolen password or JWT allows access to all firm clients |
| Inherent | **CRITICAL** |
| Existing controls | bcrypt 12, password policy, throttle, httpOnly JWT 8h, staff TOTP MFA, `token_version` on reset (checked in `getSession`) |
| Residual | **MEDIUM** — middleware does not re-check `token_version`; MFA recovery UX limited; no client MFA |
| Status | PARTIAL |
| Action | Consider middleware revoke check; harden recovery; product decision on client MFA |

### R-03 Encryption key / AUTH_SECRET leakage

| | |
|---|---|
| Description | Leak enables session forgery and/or decryption of QBO/MFA secrets |
| Inherent | **CRITICAL** |
| Existing controls | `ENCRYPTION_KEY` required in PRODUCTION and must differ from `AUTH_SECRET`; `.env` gitignored; ops rotation runbooks |
| Residual | **MEDIUM** — depends on host secret management discipline |
| Status | PARTIAL / VENDOR ACTION REQUIRED (host secrets) |
| Action | Confirm secrets manager; rotation drill |

### R-04 Malicious document upload (malware / path abuse)

| | |
|---|---|
| Description | Upload executes malware on staff endpoints or poisons storage |
| Inherent | **HIGH** |
| Existing controls | MIME/size validation, path traversal blocked, optional ClamAV, quarantine status blocks parse/AI/download, quarantine path under `documents/quarantine/` |
| Residual | **MEDIUM** when scan OFF (default); **LOW–MEDIUM** when ClamAV LIVE |
| Status | PARTIAL |
| Action | Enable `MALWARE_SCAN_ENABLED=1` in production with monitoring; infected-file E2E evidence |

### R-05 AI exfiltration of tax / identity data (Anthropic)

| | |
|---|---|
| Description | Prompts or tool JSON send SSN/EIN/bank/secrets or tax return information to model provider |
| Inherent | **HIGH** |
| Existing controls | Kill switches, tool allowlists, hostile refusals, `sanitizeAiContext`/`sanitizeAiPayload`, tax facts reject SSN keys, Copilot audit no longer stores question text |
| Residual | **MEDIUM** — sanitized tool JSON still goes to model; legal basis for disclosure UNCERTAIN |
| Status | PARTIAL / LEGAL REVIEW REQUIRED (§7216) |
| Action | Complete Section 7216 review; minimize tool payloads further; vendor DPA |

### R-06 Published statement silent mutation

| | |
|---|---|
| Description | Client sees different figures than originally published |
| Inherent | **HIGH** |
| Existing controls | Immutable release snapshots; `assertEditable`; amendment model |
| Residual | **LOW** |
| Status | VERIFIED (by design + tests described in product docs) |
| Action | Maintain release authority; never bypass `lib/release.ts` |

### R-07 Gate bypass / wrong numbers published

| | |
|---|---|
| Description | Period failing tie-out reaches clients |
| Inherent | **HIGH** |
| Existing controls | Gate re-run inside release transaction; no auto-publish |
| Residual | **LOW** |
| Status | VERIFIED |
| Action | Keep gate checks; no advisory-only downgrade of blocking checks |

### R-08 Backup loss / ransomware

| | |
|---|---|
| Description | Database and documents encrypted/wiped; backups online and also hit |
| Inherent | **CRITICAL** |
| Existing controls | Online backup + verify; restore procedure; GFS retention |
| Residual | **HIGH** if backups share the same volume without offline/offsite copies; documents/backups not app-encrypted |
| Status | PARTIAL |
| Action | Offsite immutable backups; dated restore drill; volume encryption confirmation — see DR doc |

### R-09 QuickBooks token theft

| | |
|---|---|
| Description | DB leak yields usable QBO refresh tokens |
| Inherent | **HIGH** |
| Existing controls | AES-256-GCM at rest; re-encrypt on write; OAuth state single-use |
| Residual | **LOW–MEDIUM** with ENCRYPTION_KEY hygiene |
| Status | IMPLEMENTED |
| Action | Rotate on suspicion; disconnect AUTH failures promptly |

### R-10 Email / phishing via notification links

| | |
|---|---|
| Description | Attacker phishes portal links or spoofs Resend content |
| Inherent | **MEDIUM** |
| Existing controls | Auth still required for data; fire-and-forget email |
| Residual | **MEDIUM** |
| Status | PARTIAL |
| Action | SPF/DKIM/DMARC at DNS (VENDOR/ops); user training POLICY |

### R-11 Dependency / framework CVE

| | |
|---|---|
| Description | Exploitable Next.js or npm CVE in production |
| Inherent | **HIGH** |
| Existing controls | Lockfile; CI build; manual `npm audit` |
| Residual | **MEDIUM** — controlled major upgrades may be pending |
| Status | PARTIAL |
| Action | Track CVEs in TECHNICAL-ACTION-REGISTER; upgrade with test gate |

### R-12 Insider misuse by firm staff

| | |
|---|---|
| Description | Authorized staff exports or misuses client data |
| Inherent | **HIGH** |
| Existing controls | Role walls, audit logs, no self-service analytics for clients |
| Residual | **MEDIUM** — staff span all firm clients by design |
| Status | PARTIAL / POLICY REQUIRED |
| Action | Acceptable use; monitoring; consider per-client staff assignment if needed |

### R-13 HIPAA / PHI accidental ingestion

| | |
|---|---|
| Description | Users upload medical records; firm treated as handling PHI |
| Inherent | **HIGH** (regulatory) |
| Existing controls | Policy: PHI not approved (`HIPAA-SCOPE.md`); no PHI features |
| Residual | **MEDIUM** — file bytes can contain anything |
| Status | POLICY REQUIRED |
| Action | Prohibit PHI in contracts/training; quarantine/process for accidental uploads |

### R-14 Incomplete legal program (WISP / FTC / §7216)

| | |
|---|---|
| Description | Technical controls exist but written program / notices / consents missing |
| Inherent | **HIGH** |
| Existing controls | Draft compliance package only |
| Residual | **HIGH** until adopted |
| Status | LEGAL REVIEW REQUIRED / POLICY REQUIRED |
| Action | Execute MANAGEMENT-ACTION-REGISTER and LEGAL-REVIEW-REGISTER |

---

## Risk summary heatmap (residual)

| ID | Residual |
|---|---|
| R-01 Tenancy | MEDIUM (SQLite) |
| R-02 Session/staff creds | MEDIUM |
| R-03 Key leakage | MEDIUM |
| R-04 Malware upload | MEDIUM (scan off) |
| R-05 AI exfil | MEDIUM |
| R-06 Release mutation | LOW |
| R-07 Gate bypass | LOW |
| R-08 Ransomware/backup | HIGH without offsite |
| R-09 QBO tokens | LOW–MEDIUM |
| R-10 Email phishing | MEDIUM |
| R-11 CVEs | MEDIUM |
| R-12 Insider | MEDIUM |
| R-13 PHI | MEDIUM |
| R-14 Legal program | HIGH |

---

## Management acceptance

| Statement | Sign-off |
|---|---|
| Residual risks accepted / remediation funded | MANAGEMENT MUST ASSIGN — Date _______ |
| Next reassessment date | `[NOT SET]` |

**Do not mark this assessment “complete” without management signature outside this draft.**
