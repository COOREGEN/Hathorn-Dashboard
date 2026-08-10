# Architecture — Hathorn Dashboard (Phase 8)

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
- `lib/migrations.ts` #26 — schema  
- `lib/postgres.ts` — offline transfer order (firms before clients)  
- Staff UI: `/firm`, `/platform`  
- APIs: `/api/firm`, `/api/firm/switch`, `/api/platform/firms`  

## White-label

Controlled tokens on `firms`: name, logo text, primary/accent hex, report footer, portal name, show_platform_mark. **No** arbitrary CSS/JS/HTML.
