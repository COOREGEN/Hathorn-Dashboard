/**
 * Forecast intelligence — compares FP&A management scenarios to statistical trend.
 * Does not overwrite FP&A. Does not call statistical projection "AI forecasting".
 */

import { listModelRuns, getModelRun } from "../fpa/model";
import type { PeriodMetrics } from "../metrics";
import { pctChange, r1 } from "./calc";
import { linearRevenueProjection } from "./trends";
import type { ForecastIntelligence } from "./types";

export function forecastIntelligence(
  clientId: string,
  history: PeriodMetrics[],
): ForecastIntelligence {
  const runs = listModelRuns(clientId, 10).filter((r) => r.status === "OK");
  const latest = runs[0] ? getModelRun(runs[0].id) : null;
  const trend = linearRevenueProjection(history);

  if (!latest && !trend) {
    return {
      available: false,
      reason: "No saved FP&A runs and insufficient history for a trend projection.",
    };
  }

  let management: ForecastIntelligence["management"];
  let managementGrowthPct: number | null = null;
  if (latest) {
    const baselineRev = latest.results.baseline.revenue;
    const lastF = latest.results.forecast[latest.results.forecast.length - 1];
    management = {
      runId: latest.id,
      scenario: latest.scenario,
      forecastRevenue: latest.results.totals.forecastRevenue,
      forecastNetIncome: latest.results.totals.forecastNetIncome,
      engine: latest.engine,
    };
    if (lastF && baselineRev > 0) {
      // Approximate annualized growth from month-12 vs baseline
      managementGrowthPct = pctChange(lastF.revenue, baselineRev);
    }
  }

  const trendProjection = trend
    ? {
        method: trend.method,
        projectedNextRevenue: trend.projectedNextRevenue,
        historicalGrowthPct: trend.historicalGrowthPct,
      }
    : undefined;

  let comparison: ForecastIntelligence["comparison"];
  if (managementGrowthPct != null && trend?.historicalGrowthPct != null) {
    comparison = {
      managementGrowthPct,
      trendGrowthPct: trend.historicalGrowthPct,
      differencePoints: r1(managementGrowthPct - trend.historicalGrowthPct),
      note:
        "Difference between management scenario growth and historical linear trend. " +
        "This surfaces an assumption to review — it does not prove management wrong.",
    };
  }

  // Forecast accuracy: if a prior run's first forecast month matches a later actual
  let accuracy: ForecastIntelligence["accuracy"] = {
    available: false,
    dollarError: null,
    percentageError: null,
    note: "No overlapping forecast-vs-actual pair found for this client yet.",
  };

  for (const runMeta of runs.slice(0, 5)) {
    const run = getModelRun(runMeta.id);
    if (!run?.results.forecast?.length) continue;
    const first = run.results.forecast[0];
    const actual = history.find((p) => p.year === first.year && p.month === first.month);
    if (!actual) continue;
    const err = r1(actual.revenue - first.revenue);
    accuracy = {
      available: true,
      dollarError: err,
      percentageError: pctChange(actual.revenue, first.revenue),
      note: `Compared saved ${run.scenario} run ${run.id.slice(0, 8)}… forecast for ${first.label} to actual revenue. Frozen run is not rewritten.`,
    };
    break;
  }

  return {
    available: true,
    management,
    trendProjection,
    comparison,
    accuracy,
  };
}
