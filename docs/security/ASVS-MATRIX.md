# OWASP ASVS 5.0.0 mapping

**Target:** ASVS **5.0.0** Level **2** (applications that handle sensitive business/financial data)  
**Status:** DRAFT self-assessment — **not** an ASVS certification  
**Owner:** MANAGEMENT MUST ASSIGN  
**Date:** 2026-08-11  

### Why Level 2

Hathorn Dashboard stores multi-tenant financial statements, credentials (password hashes, encrypted QBO/MFA secrets), and optional tax-related documents. Level 1 is insufficient for this data sensitivity; Level 3 would require organizational verification programs not yet evidenced (EXTERNAL AUDIT REQUIRED). Level 2 is the appropriate **engineering target**.

Status vocabulary: VERIFIED · PARTIAL · NOT IMPLEMENTED · POLICY REQUIRED · EXTERNAL AUDIT REQUIRED

Chapter numbering follows ASVS 5.0.0 major chapter themes (summarized). Detailed requirement IDs should be filled when performing a full worksheet against the official standard.

---

## V1 Encoding & sanitization

| Theme | Status | Notes |
|---|---|---|
| Output encoding / XSS | PARTIAL | React escaping; CSP; adversarial XSS tests noted in stress suite history |
| Injection (SQL) | VERIFIED | Parameterized statements; stress injection section |
| Formula eval | VERIFIED | Hand-written parser — no `eval` |
| AI prompt injection | PARTIAL | See AISVS; sanitize + tool auth |

## V2 Validation

| Theme | Status | Notes |
|---|---|---|
| Schema / JSON body validation | VERIFIED | `jsonObject()` guards; write-boundary `lib/validate.ts` |
| File upload validation | PARTIAL | MIME/size/path; optional ClamAV |
| Business validation (gate) | VERIFIED | `lib/gate.ts` + release authority |

## V3 Cryptography

| Theme | Status | Notes |
|---|---|---|
| Password hashing | VERIFIED | bcrypt cost 12 |
| Authenticated encryption for secrets | VERIFIED | AES-256-GCM for QBO/MFA |
| Key management | PARTIAL | ENCRYPTION_KEY required in prod; host secret store POLICY |
| Document/backup encryption | NOT IMPLEMENTED (app-level) | Volume encryption expected |

## V4 Authentication

| Theme | Status | Notes |
|---|---|---|
| Credential policies | VERIFIED | Length/complexity/common/demo blocked |
| Throttling / lockout | VERIFIED | Per-email throttle |
| Session token handling | PARTIAL | httpOnly JWT 8h SameSite=lax; middleware lacks token_version re-check |
| MFA | PARTIAL | Staff TOTP; client MFA NOT IMPLEMENTED |
| Logout / revoke | PARTIAL | token_version on password reset |

## V5 Authorization

| Theme | Status | Notes |
|---|---|---|
| Role-based access | VERIFIED | ADMIN/ADVISOR/BOOKKEEPER/CLIENT + platform admin |
| Object-level (tenant) | VERIFIED | requireClientAccess + Firm A/B probes |
| Function-level (AI tools) | VERIFIED | CLIENT_TOOLS vs STAFF_TOOLS at execution |
| RLS defense-in-depth | PARTIAL | Postgres scripts; SQLite default runtime |

## V6 Session management

| Theme | Status | Notes |
|---|---|---|
| Cookie flags | VERIFIED | httpOnly; secure in prod; SameSite=lax |
| Idle / absolute timeout | PARTIAL | 8h absolute; idle not separately enforced |
| Session fixation | PARTIAL | Re-issue on firm switch / login paths — keep under review |

## V7 Error handling & logging

| Theme | Status | Notes |
|---|---|---|
| Safe API errors (401/403 JSON) | VERIFIED | Documented invariant |
| Secret redaction in logs | PARTIAL | Redaction helpers; reset URL token logging fixed |
| Security event audit | PARTIAL | audit_logs; Copilot metadata-only |

## V8 Data protection

| Theme | Status | Notes |
|---|---|---|
| Sensitive data inventory | PARTIAL | DATA-INVENTORY draft |
| Minimize storage of identifiers | PARTIAL | No SSN columns; docs may contain PII bytes |
| Client published-only | VERIFIED | Portal rule |

## V9 Communication

| Theme | Status | Notes |
|---|---|---|
| TLS | PARTIAL | Host responsibility + HSTS header |
| Outbound timeouts | VERIFIED | `fetchWithTimeout` |
| CSP / security headers | VERIFIED | next.config.mjs; dev/prod split tested |

## V10 Malicious code / supply chain

| Theme | Status | Notes |
|---|---|---|
| Dependency pinning | PARTIAL | package-lock; manual audit |
| Upload malware scanning | PARTIAL | ClamAV optional |
| CI integrity | PARTIAL | GitHub Actions CI |

## V11 Business logic

| Theme | Status | Notes |
|---|---|---|
| Publish controls | VERIFIED | release.ts re-gate in transaction |
| Comparability / confidence integrity | VERIFIED | Documented engines + tests |
| Rate limits on metered APIs | VERIFIED | Copilot/QBO/story |

## V12 Files & resources

| Theme | Status | Notes |
|---|---|---|
| Path traversal | VERIFIED | storage sanitize |
| Quarantine | VERIFIED (recent) | download/parse/AI blocked |
| Signed URLs | NOT IMPLEMENTED | AuthZ download instead |

## V13 API

| Theme | Status | Notes |
|---|---|---|
| Authn on APIs | VERIFIED | middleware + requireRole |
| Mass assignment / JSON shape | PARTIAL | jsonObject + validators |
| CSRF | PARTIAL | SameSite + CSP form-action; no CSRF token layer |

## V14 Configuration

| Theme | Status | Notes |
|---|---|---|
| Prod config guard | VERIFIED | assertProductionReady AUTH_SECRET + ENCRYPTION_KEY + base URL |
| Seed refused in prod | VERIFIED | Documented |
| Debug modes | PARTIAL | Dev CSP exceptions tested |

---

## Gaps to close for a credible Level 2 claim (still not “certified”)

1. External verification (pentest) — EXTERNAL AUDIT REQUIRED  
2. Client MFA decision  
3. Middleware session revoke consistency  
4. Malware scanning on by default in production  
5. Formal key management POLICY  

Full requirement-by-requirement spreadsheet: **NOT IMPLEMENTED** in this pass — use this chapter matrix as the seed.
