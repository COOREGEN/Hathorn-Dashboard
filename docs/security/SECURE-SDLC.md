# Secure software development lifecycle

**DRAFT — MANAGEMENT / LEGAL REVIEW REQUIRED**  
**Owner:** MANAGEMENT MUST ASSIGN  
**Applies to:** Hathorn Dashboard (Next.js 14 / TypeScript / SQLite|Postgres)

This describes how security is expected to be built into delivery. It is a working practice guide, not an ISO/IEC 27034 certification.

---

## 1. Principles (non-negotiable product rules)

1. Never let a wrong number reach a client — gate + release authority.  
2. Untrustworthy comparisons are suppressed, not degraded.  
3. Confidence never mutates figures.  
4. Validate on write.  
5. Tenancy enforced in handlers (and RLS when Postgres enabled) — not by hiding UI.  
6. No “GLBA/SOC2/HIPAA compliant” claims in product copy.

---

## 2. Lifecycle stages

### 2.1 Plan / design

| Activity | Required when |
|---|---|
| Threat notes for new client-facing routes | Always — add cross-tenant probe |
| Data classification update | New data category or vendor |
| §7216 screen | Any tax-related egress |
| ASVS/AISVS impact | Auth, crypto, AI, uploads |

### 2.2 Implement

| Practice | Status |
|---|---|
| Parameterized SQL | IMPLEMENTED |
| `requireRole` / `requireClientAccess` | IMPLEMENTED |
| `jsonObject` + validators | IMPLEMENTED |
| No `eval` on user formulas | IMPLEMENTED |
| Encrypt QBO/MFA secrets | IMPLEMENTED |
| Sanitize AI payloads | IMPLEMENTED |
| Quarantine unsafe uploads | IMPLEMENTED |
| CSRF token layer | NOT IMPLEMENTED (SameSite strategy) |

### 2.3 Verify

| Suite | Purpose |
|---|---|
| `./test.sh` | Regression / tenancy / gate / auth |
| `./stress.sh` | Adversarial / abuse |
| Unit scripts (`scripts/*-unit.ts`, `security-unit.ts`) | Focused proofs |
| `npm run tenancy:test` / copilot tests | Isolation + AI |
| CI build | Compile gate |

**Re-seed between test.sh and stress.sh** (restore interference).

### 2.4 Release

| Gate | Notes |
|---|---|
| Suites green on staging | Required |
| `assertProductionReady` env | AUTH_SECRET, ENCRYPTION_KEY, BASE_URL |
| Migrations append-only | Never edit shipped migrations |
| Expand/contract awareness | DR doc |
| Certification docs | See PRODUCTION-* docs — do not overclaim |

### 2.5 Operate

| Activity | Doc |
|---|---|
| Backups / restore | DISASTER-RECOVERY |
| Incidents | INCIDENT-RESPONSE + breach tree |
| Vendor changes | Service provider register |
| Dependency CVEs | TECHNICAL-ACTION-REGISTER |

---

## 3. Change types & extra review

| Change type | Extra review |
|---|---|
| New `/api/*` client route | Tenancy probe + middleware matcher entry |
| Auth / session | ASVS V4/V6 review |
| AI tool addition | AISVS + CLIENT vs STAFF split + sanitize |
| Document pipeline | Malware/quarantine paths |
| Crypto / keys | Dual control for production key changes — POLICY |
| RLS / SQL | Postgres proof suite |

---

## 4. Secrets handling in development

1. `.env.local` gitignored — never commit.  
2. Demo password `ledger2026` is for seed only; treated as weak if used as a chosen password.  
3. Production secrets via host secret manager — VENDOR/ops.  
4. No secrets in localStorage.

---

## 5. Definition of done (security)

A change is not done until:

- [ ] Relevant automated tests pass  
- [ ] New sensitive flow documented if egress/vendor/AI  
- [ ] No new cross-tenant path without probe  
- [ ] Logs do not include tokens/reset secrets/raw AI questions  
- [ ] Status claims use VERIFIED/PARTIAL/etc. vocabulary — not “compliant”

---

## 6. Training

Developer security training: **POLICY REQUIRED** — no completion records invented here.
