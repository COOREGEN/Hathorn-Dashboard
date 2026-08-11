# Technical action register

**Owner:** MANAGEMENT MUST ASSIGN (engineering lead)  
**Baseline:** Security/compliance hardening audit + fixes as of 2026-08-11  
**Status vocabulary:** DONE · P0 · P1 · P2 · PARTIAL · WONTFIX (requires management)

---

## Recently completed (DONE)

| ID | Item | Evidence / notes |
|---|---|---|
| T-DONE-01 | AI sanitize layer (`sanitizeAiContext` / `sanitizeAiPayload`) redacts SSN/EIN/bank/secrets/card-shaped strings before Anthropic | `lib/ai/sanitize-context.ts`; wired in Copilot responses/citations and tax analysis; `scripts/security-unit.ts` |
| T-DONE-02 | Quarantine download block + quarantine storage path under `documents/quarantine/` | `lib/documents/model.ts`, `lib/documents/storage.ts`; parse/AI/download blocked when `QUARANTINED` |
| T-DONE-03 | `ENCRYPTION_KEY` required in PRODUCTION via `assertProductionReady` (must differ from `AUTH_SECRET`, sufficient length) | `lib/config.ts` |
| T-DONE-04 | Password-reset URL / token not logged with secret material | `app/api/auth/forgot/route.ts` (hardening fix) |
| T-DONE-05 | Copilot audit metadata-only — `COPILOT_QUERY` stores length/metadata, not question text | `lib/ai/copilot/engine.ts` |

---

## Open — P0 (before real client financials / multi-firm prod)

| ID | Item | Current state | Required action | Owner |
|---|---|---|---|---|
| T-P0-01 | Enable ClamAV in production with monitoring | IMPLEMENTED code; default OFF; clean path proven; infected E2E pending | Set `MALWARE_SCAN_ENABLED=1` when clamscan available; alert on UNAVAILABLE; add infected E2E | MANAGEMENT MUST ASSIGN |
| T-P0-02 | Confirm host TLS, HSTS termination, volume encryption | App sets HSTS header; TLS is host | Document host config in evidence/ | MANAGEMENT MUST ASSIGN |
| T-P0-03 | Offsite / immutable backups for DB + `documents/` | Local GFS backup IMPLEMENTED | Configure offsite; prove restore | MANAGEMENT MUST ASSIGN |
| T-P0-04 | Dated production restore drill | Procedure documented | Execute + log in `RESTORE-DRILL-LOG.md` | MANAGEMENT MUST ASSIGN |
| T-P0-05 | Postgres + RLS for multi-firm SaaS | Scripts/tests PARTIAL; default SQLite | Cut over when scaling; keep RLS proofs green | MANAGEMENT MUST ASSIGN |
| T-P0-06 | Live QuickBooks authorization in target environment | Code IMPLEMENTED; sandbox not proven here | VENDOR ACTION REQUIRED — connect Intuit sandbox/prod | MANAGEMENT MUST ASSIGN |
| T-P0-07 | Dependency CVE triage (incl. Next.js majors if flagged) | Manual `npm audit` | Controlled upgrade behind test suite | MANAGEMENT MUST ASSIGN |

---

## Open — P1

| ID | Item | Current state | Required action | Owner |
|---|---|---|---|---|
| T-P1-01 | Middleware re-check `token_version` (or equivalent session revoke) | Handlers via `getSession` check; middleware does not | Align middleware with revoke semantics without breaking matcher invariants | MANAGEMENT MUST ASSIGN |
| T-P1-02 | Client MFA (if management requires) | NOT IMPLEMENTED | Design TOTP/WebAuthn for CLIENT role | MANAGEMENT MUST ASSIGN |
| T-P1-03 | Further minimize AI tool payloads (field allowlists) | Sanitize present; full JSON after sanitize may still go | Shrink schemas per tool | MANAGEMENT MUST ASSIGN |
| T-P1-04 | Signed/expiring document URLs if object storage introduced | NOT IMPLEMENTED (auth download today) | Design when leaving local disk | MANAGEMENT MUST ASSIGN |
| T-P1-05 | Copilot / conversation retention purge job | Policy draft only | Implement after retention adoption | MANAGEMENT MUST ASSIGN |
| T-P1-06 | Centralized log shipping + auth anomaly alerts | PARTIAL structured logs | Ops integration | MANAGEMENT MUST ASSIGN |
| T-P1-07 | External penetration test against PENTEST-SCOPE | Scope drafted | Engage vendor — EXTERNAL AUDIT REQUIRED | MANAGEMENT MUST ASSIGN |
| T-P1-08 | App-level encryption for backups (optional hardening) | NOT IMPLEMENTED | Evaluate vs volume encryption | MANAGEMENT MUST ASSIGN |
| T-P1-09 | Document UI copy when malware scan disabled | Workspace may still say unscanned | Keep UX honest when flag off | MANAGEMENT MUST ASSIGN |

---

## Open — P2

| ID | Item | Notes |
|---|---|---|
| T-P2-01 | Managed auth (Clerk/Supabase) + MFA recovery | Roadmap item; hand-rolled JWT survives adversarial tests but lacks MFA recovery polish |
| T-P2-02 | Server-side PDF | Print stylesheet today |
| T-P2-03 | Per-client staff assignment | Today staff span all firm clients |
| T-P2-04 | SIEM correlation content packs | After log shipping |

---

## Explicit non-goals (do not “fix” without product decision)

- Self-service client analytics  
- Auto-publish  
- Claiming SOC 2 / HIPAA / GLBA / IRS certification in UI  

---

## Change log

| Date | Note |
|---|---|
| 2026-08-11 | Initial register; recorded sanitize/quarantine/encryption/reset-log/audit DONE items from hardening pass |
