# Audit fixes (2026-08-11)

Resolves findings from `docs/FULL-SYSTEM-AUDIT.md`.

| Finding | Fix |
|---|---|
| Stuck `SYNCING` blocks retries | `reclaimStaleSyncs()` (15m) + try/catch around provider.sync so crashes mark FAILED |
| Login array/null body → 401 | `jsonObject()` → **400** |
| `/api/assets` unguarded | Middleware GUARD + public GET `/api/assets/[id]` exemption |
| Portal Tier-1 drift | Defaults: Ask/answers/uploads **off**; migration 32; staff toggles on Client Experience |
| Client MFA missing | Clients may enroll; login challenges any `mfa_enabled` user |
| Portal double masthead | `Dashboard` `embedded` prop on statement |
| Review `prompt()`/`confirm()` | Inline reason/confirm dialogs |
| Smoke Firm B flake | Skip isolation assert with note when Example CPA user missing |
| Workflow interrupted hub | Clears abandoned SYNCING before mock sync |

**Not “fixed” in code (environment / scope):** live QBO, Resend, Postgres E2E; full ECharts→SVG rewrite of prototypes (documented doctrine; prototypes remain parallel).
