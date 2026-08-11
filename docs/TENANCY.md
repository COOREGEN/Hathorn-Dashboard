# Tenancy model — Hathorn Dashboard

**Product:** Hathorn Dashboard  
**First tenant:** Hathorn Advisory Group  

## Hierarchy

```
PLATFORM (Hathorn Dashboard operators)
  └── FIRM (accounting practice workspace)
        ├── Firm staff (membership + role)
        └── CLIENT organizations
              └── Financial data, documents, releases, …
```

## Object inventory (ownership)

| Object | Current owner | Future owner | Firm boundary | Client boundary | Migration | Authorization | RLS applicable? |
|---|---|---|---|---|---|---|---|
| Firm | — (new) | Platform | self | n/a | created + backfill | platform admin / membership | yes |
| Firm membership | — (new) | Firm | firm_id | n/a | backfill staff | firm admin / self | yes |
| Client | orphan / global | Firm → Client | `clients.firm_id` | self | backfill Hathorn | membership + client access | yes |
| Period / P&L / payroll / AR / cash | Client | Firm → Client | via client | client_id | none (derivable) | requireClientAccess | via client |
| Financial release | Client | Firm → Client → Release | via client | client_id | none | staff firm + client portal published-only | yes |
| Source document | Client | Firm → Client | via client | client_id | none | requireClientAccess | yes |
| QBO / integration connection | Client | Firm → Client | via client | client_id | none | requireClientAccess | yes |
| FP&A model run | Client | Firm → Client | via client | client_id | none | requireClientAccess | yes |
| Tax / research issue | Client (or firm library) | Firm → Client | via client when set | client_id nullable | none | requireClientAccess when client-scoped | yes when client-scoped |
| Reconciliation / exception | Client | Firm → Client | via client | client_id | none | requireClientAccess | yes |
| Close run | Client | Firm → Client | via client | client_id | none | requireClientAccess | yes |
| Comment thread | Period → Client | Firm → Client | via client | client_id | none | authorizePeriod + firm | yes |
| Audit log | User | Firm (+ optional client) | `audit_logs.firm_id` | optional | columns added | firm admin / platform | yes |
| KPI definitions | Firm library (global today) | Firm (future) | planned | n/a | deferred | staff | later |
| Users | Global identity | Platform identity + firm memberships | memberships | client_id for CLIENT role | `is_platform_admin` | session + membership | n/a |

## Roles (kept small)

| Capability | Mechanism |
|---|---|
| Platform admin | `users.is_platform_admin` — provision firms; **not** silent access to books |
| Firm admin | `users.role=ADMIN` + ACTIVE `firm_memberships` |
| Advisor / Bookkeeper | existing roles + firm membership |
| Client user | `users.role=CLIENT` + `users.client_id` |

**Staff policy (Phase 8):** ACTIVE firm membership grants access to **all clients in that firm**. Per-client staff assignment (`client_memberships`) is not implemented — document if that policy changes.

## Authorization helpers

- `requireFirmContext()` — server-validated active firm  
- `requireClientAccess(clientId)` / `requireClientInFirm` — never trust browser firm/client ids  
- `requirePlatformAdmin()` — platform ops only  
- `switchActiveFirm(firmId)` — re-issues session after membership check  

## Slug uniqueness

On SQLite, `clients.slug` remains **platform-unique** (URL stability). Postgres cutover may tighten to `UNIQUE(firm_id, slug)`. Firm slugs are globally unique.

## Orphan detection

`orphanReport()` in `lib/tenancy.ts` counts clients without firm, documents/releases without client, staff without membership.
