# Architecture — Hathorn Dashboard

## Product vs firm

| Layer | Name | Meaning |
|---|---|---|
| Product | **Hathorn Dashboard** | Multi-firm platform software |
| Tenant | **Hathorn Advisory Group** (and peers) | Accounting firm workspace |

Do not replace the product name with a tenant name in chrome meant for platform identity.

## Request path

```
Authenticated request
  → JWT session (role, tv, preferred firmId)
  → getSession() revalidates token_version + firm membership
  → Domain handler
  → requireClientAccess / requireFirmContext / requirePlatformAdmin
  → SQLite queries scoped by firm_id / client ownership
```

## Key modules

- `lib/tenancy.ts` — firms, memberships, orphan report, branding tokens  
- `lib/auth.ts` — sessions, `requireClientAccess`, platform vs firm admin  
- `lib/migrations.ts` — append-only schema (#26 multi-tenant, #27 AI Copilot)  
- `lib/postgres.ts` — offline transfer order (firms before clients; copilot tables included)  
- Staff UI: `/firm`, `/platform`, `/ask`  
- APIs: `/api/firm`, `/api/firm/switch`, `/api/platform/firms`, `/api/copilot`  

## White-label

Controlled tokens on `firms`: name, logo text, primary/accent hex, report footer, portal name, show_platform_mark. **No** arbitrary CSS/JS/HTML.

## Ask Hathorn (Phase 9)

AI is the interface — never wired directly to the database.

```
User
  ↓
Copilot Router (intent + tool plan)
  ↓
Permission Layer (role · firm · client · audience registry)
  ↓
Tool Registry (explicit read-only tools)
  ↓
Domain Services
  ↓
Accounting / Planning / Research / Close / Recon / Integrations
  ↓
Structured result + citations
  ↓
AI explanation (optional; grounded fallback without API key)
```

See `docs/AI-COPILOT.md`, `docs/AI-SECURITY.md`, `docs/AI-CAPABILITIES.md`.
