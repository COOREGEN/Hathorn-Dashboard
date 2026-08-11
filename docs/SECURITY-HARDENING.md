# Security hardening — Phase 12 review

Focused review against the running architecture (JWT cookie auth, SQLite/Postgres tooling, firm tenancy, RLS scripts for future Postgres).

**Related compliance package:** `docs/FINANCIAL-DATA-SECURITY-REPORT.md` (index). Status vocabulary: IMPLEMENTED · VERIFIED · PARTIAL · NOT IMPLEMENTED.

## Authentication & sessions

| Control | Status |
|---|---|
| httpOnly JWT cookie, 8h TTL | Present |
| `secure` in production | Present |
| bcrypt cost 12 + password policy | Present |
| Login throttle (per email) | Present |
| `token_version` invalidates sessions on password reset / disable | Present — checked in `getSession` (handlers); middleware does **not** re-check |
| Staff MFA (TOTP) default on in production (`REQUIRE_STAFF_MFA`) | Present |
| Backup codes | MFA module — never log raw codes after enrollment |
| Platform admin MFA | Same staff MFA path; platform admins are staff |
| Client MFA | **NOT IMPLEMENTED** |

## CSRF

Session auth is cookie-based. Mutating APIs expect same-site usage; Next route handlers require JSON posts from the app origin. CSP `form-action 'self'`. No separate CSRF token layer — revisit if cookie `SameSite` is ever relaxed or cross-site embeds are added.

## Security headers

`next.config.mjs`: CSP, HSTS, nosniff, frame-ancestors none, referrer policy. Dev-only `unsafe-eval` + `ws:`.

## Tenant isolation

- Application: `requireClientInFirm` / firm membership on every client-facing path
- Permanent Firm A/B probes in proof + tenancy tests
- Jobs carry `firm_id`/`client_id`; ops diagnostics are metadata-only
- Copilot tools refuse cross-tenant
- Cache: no global sensitive response cache
- Support: no impersonation; preview banners only where already built for staff

## RLS

`docs/postgres-rls.sql` exists for cutover. Runtime today is SQLite — RLS not enforceable until Postgres runtime. Keep RLS regression tests when dual-driver ships.

## Uploads / files

- Extension/MIME/size checks in documents module
- Path traversal blocked in `lib/documents/storage.ts`
- Authorization on download by client/firm
- **Malware scanning: IMPLEMENTED (optional)** — `lib/documents/malware.ts` uses ClamAV (`clamscan`) when `MALWARE_SCAN_ENABLED=1` (default **OFF**)
  - Clean → store under normal `documents/` tree and continue
  - Infected or scanner error → status `QUARANTINED`, bytes under `documents/quarantine/…`
  - Quarantined documents: **parse blocked**, **AI blocked**, **download blocked**
  - Do not label SAFE when the scanner is disabled or unavailable
  - Infected-file E2E in CI: not claimed (clean path has been proven when enabled)
- Signed/expiring URLs: **NOT IMPLEMENTED** (authorized download handlers instead)

## Rate limits

Route-appropriate limits in `lib/security.ts` (login, copilot, story, QBO). Not one tiny global cap.

## Secrets & logging

- Structured log redaction (`lib/ops/redact.ts`)
- Correlation / support reference ids without encoded secrets
- QBO tokens + MFA secrets encrypted `enc:v1:` (AES-256-GCM); previous-key decrypt during rotation
- **`ENCRYPTION_KEY` required in PRODUCTION** via `assertProductionReady` (must differ from `AUTH_SECRET`, sufficient length)
- Password-reset links must not be logged with reusable tokens
- No secrets in `localStorage`; `.env` gitignored

## Admin / ops

- Platform routes require `is_platform_admin`
- No arbitrary SQL / shell in product
- Sensitive support actions audited
- Seed refused in PRODUCTION

## AI

- Prompt injection treated as untrusted user text; tools return structured facts
- Kill switches for AI/Copilot
- `sanitizeAiContext` / `sanitizeAiPayload` before Anthropic (SSN/EIN/bank/secrets/card-shaped)
- Usage / Copilot audits: metadata without raw question text in `COPILOT_QUERY`
- See `docs/AI-SECURITY.md` and `docs/security/AISVS-MATRIX.md`

## Dependency / lockfiles

- `package-lock.json` committed
- CI runs unit + build; review `npm audit` manually for exploitable runtime issues — do not bulk major-bump without tests
- Python Docling deps (when enabled) should stay pinned in worker requirements

## Open gaps (honest)

1. Managed auth MFA recovery UX / account recovery beyond email reset  
2. Malware scanning off by default; infected E2E not claimed  
3. Postgres RLS not active at default SQLite runtime  
4. Middleware does not re-check `token_version`  
5. No external error tracker (intentionally deferred — host logs first)  
6. Production restore drill evidence should be dated when performed  
7. Documents/backups not app-encrypted (volume encryption expected)

## Evidence for future compliance work

Access-control tests, MFA behaviour, audit logs, backup/verify scripts, deployment CI, incident docs, `docs/compliance/*`. **Do not claim SOC 2 / HIPAA / PCI / GLBA / IRS certification.**
