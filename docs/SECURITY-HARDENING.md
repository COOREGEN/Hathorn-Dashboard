# Security hardening — Phase 12 review

Focused review against the running architecture (JWT cookie auth, SQLite/Postgres tooling, firm tenancy, RLS scripts for future Postgres).

## Authentication & sessions

| Control | Status |
|---|---|
| httpOnly JWT cookie, 8h TTL | Present |
| `secure` in production | Present |
| bcrypt cost 12 + password policy | Present |
| Login throttle (per email) | Present |
| `token_version` invalidates sessions on password reset / disable | Present |
| Staff MFA (TOTP) default on in production | Present |
| Backup codes | MFA module — never log raw codes after enrollment |
| Platform admin MFA | Same staff MFA path; platform admins are staff |

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
- **Malware scanning: NOT IMPLEMENTED** — document clearly; quarantine states reserved for future scanner. Do not label SAFE without a scan.

## Rate limits

Route-appropriate limits in `lib/security.ts` (login, copilot, story, QBO). Not one tiny global cap.

## Secrets & logging

- Structured log redaction (`lib/ops/redact.ts`)
- Correlation / support reference ids without encoded secrets
- QBO tokens encrypted `enc:v1:` with previous-key decrypt during rotation

## Admin / ops

- Platform routes require `is_platform_admin`
- No arbitrary SQL / shell in product
- Sensitive support actions audited
- Seed refused in PRODUCTION

## AI

- Prompt injection treated as untrusted user text; tools return structured facts
- Kill switches for AI/Copilot
- Usage recorded without raw prompts in `ai_usage_events`

## Dependency / lockfiles

- `package-lock.json` committed
- CI runs unit + build; review `npm audit` manually for exploitable runtime issues — do not bulk major-bump without tests
- Python Docling deps (when enabled) should stay pinned in worker requirements

## Open gaps (honest)

1. Managed auth MFA recovery UX / account recovery beyond email reset  
2. Malware scanning not integrated  
3. Postgres RLS not active at runtime yet  
4. No external error tracker (intentionally deferred — host logs first)  
5. Production restore drill evidence should be dated when performed  

## Evidence for future compliance work

Access-control tests, MFA behaviour, audit logs, backup/verify scripts, deployment CI, incident docs. **Do not claim SOC 2 / HIPAA / PCI.**
