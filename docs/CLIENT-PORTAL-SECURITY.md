# Client Portal Security — Hathorn Dashboard (Phase 11)

## Authorization model

| Actor | Scope |
|---|---|
| CLIENT | `session.clientId` only; ignores `?client=` |
| ADMIN / ADVISOR | Firm membership + `requireClientAccess` |
| BOOKKEEPER | No client-experience curation; no portal pages |

Every download/upload/API call re-checks ownership. Route location never proves identity.

## Explicit visibility

| Resource | Client-visible when |
|---|---|
| Financial period | Active published release exists |
| Insight | `status = PUBLISHED` |
| Management question | `PUBLISHED` / `ANSWERED` / `CLOSED` |
| FP&A run | `visibility = CLIENT_SHARED` (+ frozen snapshot) |
| Source document | `visibility = CLIENT_VISIBLE` |
| Client report | `status = PUBLISHED` (not `RETRACTED`) |
| Document request | Belongs to client |

Defaults for documents and FP&A runs: **INTERNAL**.

## Cross-client isolation

Client A must receive 403/404 for Client B:

- report id
- document id / download
- insight / question id
- shared scenario id
- Copilot `clientId` override

Firm B staff cannot curate or preview Firm A clients.

## Copilot restrictions

Client Copilot cannot call staff tools (exceptions, close, recon, tax, research, working books, intelligence engines, internal documents).

Preferred answer sources: published release → published insight → shared forecast → published report.

## Downloads

`/api/client-portal/download` authorizes then streams bytes. `Cache-Control: private, no-store`. No long-lived public URLs. Storage paths never returned in JSON.

## Uploads

Client multipart upload only against an **OPEN** document request for their client. Files validated (type/size/magic). Request fulfill sets `CLIENT_VISIBLE`.

## Preview as Client

Staff preview uses the same visibility filters (`forClient: true`) without impersonating a client user session. Banner shown. No auth bypass.

## Audit events (selected)

`CLIENT_REPORT_VIEWED`, `CLIENT_REPORT_PUBLISHED`, `CLIENT_REPORT_RETRACTED`, `CLIENT_QUESTION_ANSWERED`, `CLIENT_DOCUMENT_UPLOADED`, `CLIENT_DOCUMENT_DOWNLOADED`, `CLIENT_SCENARIO_SHARED`, `CLIENT_INSIGHT_PUBLISHED`.

## Not in Phase 11

Public share links, custom domains, arbitrary CSS/JS, payment portals, board/lender portals.
