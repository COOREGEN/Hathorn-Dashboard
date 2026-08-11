# Employee & contractor security policy — DRAFT

**DRAFT — MANAGEMENT / LEGAL REVIEW REQUIRED**  
**Owner:** MANAGEMENT MUST ASSIGN  
**Applies to:** Employees, contractors, and other personnel with access to Hathorn Dashboard or firm customer information

This is a draft acceptable-use / security policy for the practice. It does **not** invent training completion, background checks, or signed acknowledgements.

---

## 1. Purpose

Protect CONFIDENTIAL and RESTRICTED information (see `docs/DATA-INVENTORY.md`) from unauthorized access, disclosure, alteration, or destruction.

---

## 2. Access rules

1. Use unique accounts — no shared platform admin logins.  
2. Least privilege: request only the role needed (ADMIN / ADVISOR / BOOKKEEPER / CLIENT / platform admin).  
3. Staff access spans all clients **within the firm** by current product design — do not browse client data without a business need.  
4. Do not attempt cross-firm access.  
5. MFA: staff must enroll TOTP when `REQUIRE_STAFF_MFA` is on (default in production).  
6. Report lost devices or suspected credential theft immediately per `INCIDENT-RESPONSE.md`.

---

## 3. Passwords & secrets

1. Follow product password policy (length, complexity, blocked common/demo passwords).  
2. Never place production secrets in chat, tickets, or git.  
3. Do not store JWT/session tokens in localStorage or screenshots.  
4. API keys (Anthropic, Resend, QBO, ENCRYPTION_KEY, AUTH_SECRET) only in approved secret stores.

---

## 4. Acceptable use of customer data

1. No export of client financials to personal email/cloud without approval.  
2. No uploading of **PHI** — PHI is not an approved data type (`HIPAA-SCOPE.md`).  
3. Minimize tax identifiers in Copilot questions; never paste SSNs into AI prompts.  
4. Quarantined documents must not be force-downloaded or emailed.  
5. Published client statements are official deliverables — do not alter source data to “fix” a published month; use amendment workflow.

---

## 5. Endpoints & remote work

| Control | Status |
|---|---|
| Disk encryption on laptops | POLICY REQUIRED (endpoint standard outside app) |
| Screen lock / auto-lock | POLICY REQUIRED |
| Untrusted USB / unknown apps | POLICY REQUIRED |
| Public Wi-Fi + sensitive admin actions | Prefer VPN/corporate network — POLICY REQUIRED |

---

## 6. Training

Security awareness training (phishing, §7216 basics, incident reporting) shall be delivered on a cadence set by management.

**Evidence of completion:** not stored in this repository. Do not invent attendance records. Retain in HR systems; optionally add a redacted index under `docs/compliance/evidence/` per evidence README.

Status: **POLICY REQUIRED** (curriculum not adopted).

---

## 7. Joiner / mover / leaver

| Event | Required actions | Owner |
|---|---|---|
| Hire | Provision least-privilege role; MFA enroll; policy ack | MANAGEMENT MUST ASSIGN |
| Role change | Update role/membership; revoke excess | MANAGEMENT MUST ASSIGN |
| Termination | Disable user; revoke GitHub/host/vendor access; rotate shared secrets if any; see IR offboarding | MANAGEMENT MUST ASSIGN |

Technical note: password reset bumps `token_version` ending live sessions for that user — IMPLEMENTED in app.

---

## 8. Violations

Violations may result in access removal and employment consequences per firm HR policy — **LEGAL/HR REVIEW REQUIRED** for enforcement language.

---

## Acknowledgement (template)

I have read this draft policy and will follow the adopted version when issued.

Name: _______________ Signature: _______________ Date: _______________

**(Do not collect signed copies inside the public git repo if they contain personal data.)**
