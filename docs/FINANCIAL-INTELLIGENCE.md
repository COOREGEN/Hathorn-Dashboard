# Financial Intelligence — Hathorn Dashboard (Phase 10)

## Principle

```
DATA → DETERMINISTIC METRICS → PROFITABILITY → TRENDS → ANOMALIES
    → DRIVERS → SIGNALS → AI EXPLANATION → ADVISOR JUDGMENT
```

Calculate first. Detect second. Explain third. Never invent financial truth.

## Surface

- Staff page: `/intelligence` (ADMIN / ADVISOR)
- API: `/api/intelligence`
- Ask Hathorn tools: `getFinancialSignals`, `getProfitabilityAnalysis`, `getTrendAnalysis`, `getCashIntelligence`, `getDriverAnalysis`, `getForecastAccuracy`

Client users do **not** get this module.

## Metric dictionary (core)

| Name | Formula / source | Unit | Limitations |
|---|---|---|---|
| Revenue | `SUM(pl_lines REVENUE)` via `computePeriod` | $K | Entity-scoped available |
| Direct cost | `SUM(pl_lines DIRECT_COST)` | $K | |
| Gross profit | Revenue − Direct cost | $K | |
| Gross margin | GP / Revenue × 100 | % | Points for MoM |
| Overhead (OPEX) | `SUM(pl_lines OPEX)` | $K | Label bridge when lines exist |
| Net income | GP − OPEX | $K | |
| Labor ratio | Direct cost / Revenue × 100 (home-care shaped) | % | Range metric in KPI registry |
| Cash | operating + reserve | $K | Period stock, not flow sum |
| AR total | Sum of aging buckets | $K | By payer, not entity |
| Payroll | Payroll composition total | $K | |

KPI registry formulas remain the single definition layer for dashboard KPIs (`lib/kpi-registry.ts`). Intelligence reuses `PeriodMetrics` / registry inputs — it does not redefine gross margin in React or prompts.

## Profitability dimensions

| Dimension | Status |
|---|---|
| Company / period | WORKING |
| Business entity (direct) | WORKING |
| Entity + allocated OPEX | PARTIAL / WORKING when an allocation rule exists |
| Customer | UNAVAILABLE |
| Project / Job | UNAVAILABLE |
| Location / Department | UNAVAILABLE |
| AR payer concentration | WORKING as **receivables** share — not customer P&L |

## Cost allocation

Methods: `DIRECT`, `REVENUE_SHARE`, `HOURS`.

Rules are versioned (`cost_allocation_rules`). AI may suggest a method; it cannot silently choose one. Allocated totals reconcile to the pool within 0.1.

## Trends

Modes: MoM, YoY, TTM (flows), AVG_3M, AVG_6M. Percentage metrics use **points** for MoM. Seasonality requires ≥24 months.

## Anomalies / signals

Methods: percentage threshold, absolute point threshold, rolling-average deviation, same-period prior year, largest decline in window.

Default thresholds (firm policy, overridable): revenue ±10%/25%, gross margin 3/7 pts, payroll rolling 15%, opex 15%, cash 20%, AR 15%.

Signals are durable (`financial_signals`), deduped by `(client, period, signal_key)`, distinct from accounting exceptions. Statuses: NEW / REVIEWED / DISMISSED / MONITORING / SUPERSEDED.

No magic 0–100 risk scores.

## Cash

Burn from period-to-period cash change averages (default 3-month). Runway = cash ÷ burn **only** when burn > 0. Cash-generative firms get an explicit “not applicable” reason.

## Forecast intelligence

- Management scenarios from FP&A model runs  
- Statistical **Trend Projection** (OLS linear) — never labeled “AI forecast”  
- Comparison surfaces assumption gaps  
- Forecast accuracy when a saved forecast month later has actuals  

FP&A is never overwritten.

## Benchmarking

**DEFERRED.** No cross-firm or cross-client anonymous benchmarks.

## Engine version

`FI_ENGINE_VERSION = 1.0.0` · `FI_POLICY_VERSION = 1.0.0`
