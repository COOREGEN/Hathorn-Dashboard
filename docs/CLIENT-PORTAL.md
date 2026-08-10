# Client Portal — Hathorn Dashboard (Phase 11)

## Principle

```
ACCOUNTING DATA → REVIEW → RELEASE → INTELLIGENCE → ADVISOR CURATION → CLIENT PRESENTATION
```

Clients see clarity. Staff retain control. Internal accounting work stays internal.

Visibility is **explicit**, never inferred from ownership alone.

## Surfaces

| Route | Audience | Content |
|---|---|---|
| `/portal` | CLIENT (+ staff preview) | Curated overview |
| `/portal/statement` | CLIENT | Published financial statement |
| `/portal/insights` | CLIENT | Published insights + management questions |
| `/portal/planning` | CLIENT | `CLIENT_SHARED` forecasts only |
| `/portal/reports` | CLIENT | Published Monthly Advisory Review |
| `/portal/documents` | CLIENT | `CLIENT_VISIBLE` docs + requests |
| `/client-experience` | ADMIN / ADVISOR | Staff curation + Preview as Client |

## Trusted sources

1. Published financial releases (immutable snapshots)
2. Advisor-published insights (`status = PUBLISHED`)
3. Client-shared forecast snapshots
4. Published client reports (content + branding frozen)
5. Explicitly `CLIENT_VISIBLE` documents

Working ledger, close, recon, tax drafts, internal signals, and staff notes are never client-facing.

## Modules

Per-client `client_portal_config` toggles: planning, documents, insights, copilot, financial statements, reports.

Overview metrics come from `client_portal_metric_config` (defaults from KPI registry keys) — formulas are not redefined in the portal.

## Monthly Advisory Review

Template `tmpl_monthly_advisory_v1`: Cover · Executive summary metrics · What changed · Financial performance · Cash · Outlook · Management questions · Advisor commentary.

Publishing a report does **not** republish financials. Changing branding or books later does not mutate a published report snapshot.

## Management questions

Advisor publishes questions → client answers → staff see responses. Answers are engagement evidence, not verified accounting facts until reviewed.

## White label

Firm tokens: name, portal name, logo text, primary/accent, report footer, support email, show platform mark. No arbitrary CSS/JS/HTML.

## Copilot (client)

Tools: `getPublishedRelease`, `resolvePeriod`, `getClientInsights`, `getClientSharedForecast`, `getClientReport`, `getClientManagementQuestions`.

See `docs/CLIENT-PORTAL-SECURITY.md`.
