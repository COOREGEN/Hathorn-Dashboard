# Multi-tenant security review — Phase 8

## Absolute rule

A Firm A user must never access Firm B resources by changing URL, body, or id.

## Threats reviewed

| Risk | Mitigation | Residual |
|---|---|---|
| IDOR on client-scoped APIs | `requireClientAccess` on documents, planning, tax, research, recon, integrations, close, QBO, admin client mutate, comments | Expand to any new route |
| Staff listed all clients | Firm-scoped `listClientsForFirm` / portfolio / close portfolio / exceptions | KPI library still firm-global |
| Platform admin = god mode | `is_platform_admin` does **not** grant client access | Support impersonation deliberately deferred |
| Browser-supplied firmId | Session firm revalidated via membership every request | Cookie alone never authorizes |
| Cache leakage | No shared React Query cache; firm switch hard-navigates | Add firmId to any future cache keys |
| AI retrieval | Story/agent paths load by client/period already authorized | Vector store (if added) must filter firm_id |
| Signed URL / downloads | Document download after `requireClientAccess` | Object storage not yet introduced |
| Webhooks | QBO callback uses single-use state → client_id | Map provider id → connection → client → firm |
| Error leakage | Prefer “Resource not found.” | Some routes still say “Not found.” / 404 |
| Pool RLS bleed | N/A on SQLite; Postgres must use `SET LOCAL` | Documented, not live-tested |

## Isolation tests

- Offline: `npm run tenancy:test`  
- Live proof: workflow-proof §17 (second firm admin cannot read Hathorn clients/APIs)  

## Explicit non-goals this phase

Billing, OpenFGA, Appsmith, custom domains, cross-firm benchmarks, casual impersonation.
