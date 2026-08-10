# AI Capabilities Inventory — Ask Hathorn (Phase 9)

Code and tests are the source of truth. Only capabilities that exist in this repository are listed. Experimental pilots are labeled and must not be presented as established platform truth.

Product surface name: **Ask Hathorn** (not “ChatGPT”).

---

## Financial Actuals

| Field | Value |
|---|---|
| Capability | Financial Actuals (working ledger) |
| Source | `computePeriod` / period tables |
| Tool | `getFinancialSummary` |
| Deterministic | YES |
| Client Visible | NO (staff working books) |
| Staff Visible | YES |
| Can Modify Data | NO |

| Field | Value |
|---|---|
| Capability | Published financial release |
| Source | `release_records` immutable snapshot |
| Tool | `getPublishedRelease` |
| Deterministic | YES |
| Client Visible | YES |
| Staff Visible | YES |
| Can Modify Data | NO |

---

## KPIs / Metric history

| Field | Value |
|---|---|
| Capability | Metric history (revenue, margin, labor, cash, AR) |
| Source | `clientHistory` / metrics engine |
| Tool | `getMetricHistory` |
| Deterministic | YES |
| Client Visible | Via published-only history when audience=CLIENT |
| Staff Visible | YES |
| Can Modify Data | NO |

---

## FP&A

| Field | Value |
|---|---|
| Capability | Saved planning model runs |
| Source | `fpa_model_runs` + planning engine |
| Tool | `getPlanningScenario` |
| Deterministic | YES (reads saved runs; no freeform formula exec) |
| Client Visible | NO |
| Staff Visible | YES |
| Can Modify Data | NO |
| Notes | Forge pilot flagged via `forgeStatus()` — experimental |

---

## Documents

| Field | Value |
|---|---|
| Capability | Document search / extraction summary |
| Source | `source_documents` + extractions |
| Tool | `searchDocuments` |
| Deterministic | YES (list/filter); extractions are drafts |
| Client Visible | NO |
| Staff Visible | YES |
| Can Modify Data | NO |

---

## Reconciliations

| Field | Value |
|---|---|
| Capability | Reconciliation pack / detail |
| Source | Reconciliation engine |
| Tool | `getReconciliationStatus` |
| Deterministic | YES |
| Client Visible | NO |
| Staff Visible | YES |
| Can Modify Data | NO |

---

## Exceptions

| Field | Value |
|---|---|
| Capability | Open / assigned / blocking exceptions |
| Source | `accounting_exceptions` (firm-scoped) |
| Tool | `getExceptions` |
| Deterministic | YES |
| Client Visible | NO |
| Staff Visible | YES |
| Can Modify Data | NO |

---

## Close

| Field | Value |
|---|---|
| Capability | Close readiness / blockers / firm portfolio |
| Source | Close automation engine |
| Tool | `getCloseStatus` |
| Deterministic | YES |
| Client Visible | NO |
| Staff Visible | YES |
| Can Modify Data | NO |

---

## Integrations

| Field | Value |
|---|---|
| Capability | Integration health & freshness |
| Source | Integration Hub (no credentials) |
| Tool | `getIntegrationHealth` |
| Deterministic | YES |
| Client Visible | NO |
| Staff Visible | YES |
| Can Modify Data | NO |

---

## Tax Intelligence

| Field | Value |
|---|---|
| Capability | Tax issues / authorities / rule runs |
| Source | Tax Intelligence module |
| Tool | `getTaxIssue` |
| Deterministic | Rules/facts YES; narrative AI elsewhere |
| Client Visible | NO |
| Staff Visible | YES |
| Can Modify Data | NO |
| Notes | Draft issues → `DRAFT_NOT_FINAL`. Fact Graph pilot blocked/off unless configured |

---

## Accounting Guidance

| Field | Value |
|---|---|
| Capability | Technical accounting sources & issues |
| Source | Accounting Guidance module |
| Tool | `searchAccountingGuidance` |
| Deterministic | Retrieval YES |
| Client Visible | NO |
| Staff Visible | YES |
| Can Modify Data | NO |
| Notes | Preserves source rights / authority type. RAGFlow experimental/deferred |

---

## Technical Memos / Client Commentary

| Field | Value |
|---|---|
| Capability | Commentary on published releases |
| Source | Release snapshot `commentary` |
| Tool | `getPublishedRelease` |
| Deterministic | YES (frozen text) |
| Client Visible | YES (published only) |
| Staff Visible | YES |
| Can Modify Data | NO |

Advisor draft story notes are **not** exposed as a separate Copilot write/read tool in Phase 9 beyond what appears on a release snapshot.

---

## Release History

| Field | Value |
|---|---|
| Capability | Active release + history count |
| Source | `releaseHistory` / `activeRelease` |
| Tool | `getPublishedRelease` |
| Deterministic | YES |
| Client Visible | Active published |
| Staff Visible | YES |
| Can Modify Data | NO |

---

## Portfolio / Attention

| Field | Value |
|---|---|
| Capability | Firm portfolio status |
| Source | `assessClient` / `loadPortfolio` |
| Tool | `getClientPortfolioStatus` |
| Deterministic | YES |
| Client Visible | NO |
| Staff Visible | YES |
| Can Modify Data | NO |

| Field | Value |
|---|---|
| Capability | Attention digest (“what needs my attention?”) |
| Source | Close + exceptions + integrations + portfolio |
| Tool | `getAttentionDigest` |
| Deterministic | Aggregation YES; AI only summarizes |
| Client Visible | NO |
| Staff Visible | YES |
| Can Modify Data | NO |

---

## Period resolution

| Field | Value |
|---|---|
| Capability | Resolve this/last month → period id |
| Source | Periods table + calendar |
| Tool | `resolvePeriod` |
| Deterministic | YES |
| Client Visible | YES |
| Staff Visible | YES |
| Can Modify Data | NO |

---

## Explicitly NOT exposed

- Raw SQL / DB credentials / shell / arbitrary HTTP  
- Write tools (resolve exception, waive, publish, post JE, sync, email, disconnect)  
- Cross-firm benchmarking  
- Autonomous agent loops  
- Generic web search  
- Forge / Fact Graph / RAGFlow as authoritative truth when blocked or experimental  
