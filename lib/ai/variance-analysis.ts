/**
 * Deterministic variance / driver signals for planning runs.
 */

import type { ModelResults, Assumptions } from "../fpa/types";

export type PlanningSignal = {
  kind: string;
  severity: "info" | "warn" | "bad";
  detail: string;
};

export function planningSignals(
  results: ModelResults,
  assumptions: Assumptions,
): PlanningSignal[] {
  const out: PlanningSignal[] = [];
  const b = results.baseline;
  const last = results.forecast[results.forecast.length - 1];
  if (!last) return out;

  const revChange = b.revenue > 0 ? ((last.revenue - b.revenue) / b.revenue) * 100 : 0;
  out.push({
    kind: "Revenue trajectory",
    severity: revChange < -5 ? "bad" : revChange > 15 ? "warn" : "info",
    detail: `Baseline revenue $${b.revenue}K → month-12 forecast $${last.revenue}K ` +
      `(${revChange >= 0 ? "+" : ""}${revChange.toFixed(1)}% over the horizon) under ` +
      `${assumptions.annualRevenueGrowthPct}% annual revenue growth.`,
  });

  const marginShift = assumptions.grossMarginPct - (b.revenue ? (b.grossProfit / b.revenue) * 100 : 0);
  out.push({
    kind: "Gross margin assumption",
    severity: Math.abs(marginShift) > 5 ? "warn" : "info",
    detail: `Model locks gross margin at ${assumptions.grossMarginPct}% ` +
      `(baseline was ${b.revenue ? ((b.grossProfit / b.revenue) * 100).toFixed(1) : "n/a"}%). ` +
      `Direct cost is derived as revenue − gross profit — payroll is not subtracted again.`,
  });

  if (last.netIncome < 0 && b.netIncome >= 0) {
    out.push({
      kind: "Profit turns negative",
      severity: "bad",
      detail: `Month-12 net income is $${last.netIncome}K versus baseline $${b.netIncome}K.`,
    });
  } else if (last.netIncome < b.netIncome * 0.7) {
    out.push({
      kind: "Profit compression",
      severity: "warn",
      detail: `Month-12 net income $${last.netIncome}K is materially below baseline $${b.netIncome}K.`,
    });
  }

  out.push({
    kind: "Cash not projected",
    severity: "info",
    detail: b.cashTotal != null
      ? `Baseline cash $${b.cashTotal}K is shown for context only. Working-capital drivers are not modeled in v1.`
      : "No baseline cash on the source period; cash is omitted from this run.",
  });

  return out;
}
