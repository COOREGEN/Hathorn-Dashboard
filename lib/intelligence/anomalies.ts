/**
 * Transparent anomaly detection — thresholds and rolling averages, not opaque ML.
 */

import type { PeriodMetrics } from "../metrics";
import { mean, pctChange, pointsDelta, r1 } from "./calc";
import { CORE_METRICS, type MetricExtractor } from "./trends";
import type { AnomalyFinding, AnomalyMethod } from "./types";

export type SignalPolicy = {
  metricKey: string;
  method: AnomalyMethod;
  threshold: number;
  severity: "INFO" | "WARNING" | "CRITICAL";
  enabled: boolean;
};

/** Firm defaults — major movements only. Tuned to reduce noise. */
export const DEFAULT_POLICIES: SignalPolicy[] = [
  { metricKey: "revenue", method: "PERCENT_THRESHOLD", threshold: 10, severity: "WARNING", enabled: true },
  { metricKey: "revenue", method: "PERCENT_THRESHOLD", threshold: 25, severity: "CRITICAL", enabled: true },
  { metricKey: "grossMarginPct", method: "ABSOLUTE_THRESHOLD", threshold: 3, severity: "WARNING", enabled: true },
  { metricKey: "grossMarginPct", method: "ABSOLUTE_THRESHOLD", threshold: 7, severity: "CRITICAL", enabled: true },
  { metricKey: "totalPayroll", method: "ROLLING_AVERAGE_DEVIATION", threshold: 15, severity: "WARNING", enabled: true },
  { metricKey: "opex", method: "PERCENT_THRESHOLD", threshold: 15, severity: "WARNING", enabled: true },
  { metricKey: "cash", method: "PERCENT_THRESHOLD", threshold: 20, severity: "WARNING", enabled: true },
  { metricKey: "arTotal", method: "PERCENT_THRESHOLD", threshold: 15, severity: "WARNING", enabled: true },
  { metricKey: "netIncome", method: "PERCENT_THRESHOLD", threshold: 25, severity: "WARNING", enabled: true },
];

function metricOf(key: string): MetricExtractor | undefined {
  return CORE_METRICS.find((m) => m.key === key);
}

function severityRank(s: string): number {
  return s === "CRITICAL" ? 3 : s === "WARNING" ? 2 : 1;
}

export function detectAnomalies(
  history: PeriodMetrics[],
  periodId: string,
  policies: SignalPolicy[] = DEFAULT_POLICIES,
): AnomalyFinding[] {
  const idx = history.findIndex((p) => p.periodId === periodId);
  if (idx < 0) return [];
  const cur = history[idx];
  const prior = idx > 0 ? history[idx - 1] : null;
  const findings: AnomalyFinding[] = [];

  for (const policy of policies.filter((p) => p.enabled)) {
    const metric = metricOf(policy.metricKey);
    if (!metric) continue;
    const currentValue = metric.get(cur);

    if (policy.method === "PERCENT_THRESHOLD") {
      if (!prior) continue;
      const ref = metric.get(prior);
      const pct = pctChange(currentValue, ref);
      if (pct == null) continue;
      // Flag material |pct| moves. Severity comes from policy thresholds (e.g. 10% vs 25%).
      if (Math.abs(pct) < policy.threshold) continue;
      // Skip tiny absolute moves even if % is large on small bases
      if (metric.unit === "money" && Math.abs(currentValue - ref) < 2) continue;
      findings.push({
        metricKey: metric.key,
        label: metric.label,
        currentValue: r1(currentValue),
        referenceValue: r1(ref),
        difference: r1(currentValue - ref),
        differencePct: pct,
        method: "PERCENT_THRESHOLD",
        threshold: policy.threshold,
        severity: policy.severity,
        title: `${metric.label} moved ${pct >= 0 ? "+" : ""}${pct}% vs prior month`,
        detail:
          `${metric.label}\nCurrent: ${r1(currentValue)}\nPrior month: ${r1(ref)}\n` +
          `Difference: ${r1(currentValue - ref)} (${pct >= 0 ? "+" : ""}${pct}%)\n` +
          `Detection: Percentage threshold\nConfigured threshold: ${policy.threshold}%`,
        unit: metric.unit === "percent" ? "percent" : "money",
      });
    }

    if (policy.method === "ABSOLUTE_THRESHOLD" && metric.unit === "percent") {
      if (!prior) continue;
      const ref = metric.get(prior);
      const pts = pointsDelta(currentValue, ref);
      if (Math.abs(pts) < policy.threshold) continue;
      findings.push({
        metricKey: metric.key,
        label: metric.label,
        currentValue: r1(currentValue),
        referenceValue: r1(ref),
        difference: pts,
        differencePct: null,
        method: "ABSOLUTE_THRESHOLD",
        threshold: policy.threshold,
        severity: policy.severity,
        title: `${metric.label} moved ${pts >= 0 ? "+" : ""}${pts} points`,
        detail:
          `${metric.label}\nCurrent: ${r1(currentValue)}%\nPrior: ${r1(ref)}%\n` +
          `Difference: ${pts >= 0 ? "+" : ""}${pts} points\n` +
          `Detection: Absolute point threshold\nConfigured threshold: ${policy.threshold} points`,
        unit: "percent",
      });
    }

    if (policy.method === "ROLLING_AVERAGE_DEVIATION") {
      const window = history.slice(Math.max(0, idx - 6), idx).map((p) => metric.get(p));
      if (window.length < 3) continue; // insufficient history — do not flag
      const avg = mean(window);
      if (avg == null || avg === 0) continue;
      const pct = pctChange(currentValue, avg);
      if (pct == null || Math.abs(pct) < policy.threshold) continue;
      if (metric.unit === "money" && Math.abs(currentValue - avg) < 2) continue;
      findings.push({
        metricKey: metric.key,
        label: metric.label,
        currentValue: r1(currentValue),
        referenceValue: r1(avg),
        difference: r1(currentValue - avg),
        differencePct: pct,
        method: "ROLLING_AVERAGE_DEVIATION",
        threshold: policy.threshold,
        severity: policy.severity,
        title: `${metric.label} ${pct >= 0 ? "+" : ""}${pct}% vs ${window.length}-month average`,
        detail:
          `${metric.label}\nCurrent: ${r1(currentValue)}\n` +
          `${window.length}-Month Average: ${r1(avg)}\n` +
          `Difference: ${r1(currentValue - avg)} (${pct >= 0 ? "+" : ""}${pct}%)\n` +
          `Detection: Rolling average deviation\nConfigured threshold: ${policy.threshold}%\n` +
          `Note: Statistically unusual is not the same as financially wrong.`,
        unit: metric.unit === "percent" ? "percent" : "money",
      });
    }

    if (policy.method === "SAME_PERIOD_PRIOR_YEAR") {
      const yoy = history.find((p) => p.year === cur.year - 1 && p.month === cur.month);
      if (!yoy) continue;
      const ref = metric.get(yoy);
      const pct = pctChange(currentValue, ref);
      if (pct == null || Math.abs(pct) < policy.threshold) continue;
      findings.push({
        metricKey: metric.key,
        label: metric.label,
        currentValue: r1(currentValue),
        referenceValue: r1(ref),
        difference: r1(currentValue - ref),
        differencePct: pct,
        method: "SAME_PERIOD_PRIOR_YEAR",
        threshold: policy.threshold,
        severity: policy.severity,
        title: `${metric.label} ${pct >= 0 ? "+" : ""}${pct}% vs same month last year`,
        detail:
          `${metric.label}\nCurrent: ${r1(currentValue)}\nSame month prior year: ${r1(ref)}\n` +
          `Detection: Same-period prior-year deviation\nThreshold: ${policy.threshold}%`,
        unit: metric.unit === "percent" ? "percent" : "money",
      });
    }
  }

  // Largest gross-margin decline in 12 months (informational)
  if (idx >= 1) {
    const gm = cur.grossMarginPct;
    const window = history.slice(Math.max(0, idx - 11), idx + 1);
    let worst = 0;
    for (let i = 1; i < window.length; i++) {
      const d = pointsDelta(window[i].grossMarginPct, window[i - 1].grossMarginPct);
      if (d < worst) worst = d;
    }
    const mom = prior ? pointsDelta(gm, prior.grossMarginPct) : 0;
    if (mom <= -3 && mom <= worst + 0.05 && prior) {
      findings.push({
        metricKey: "grossMarginPct",
        label: "Gross margin",
        currentValue: r1(gm),
        referenceValue: r1(prior.grossMarginPct),
        difference: mom,
        differencePct: null,
        method: "LARGEST_DECLINE_IN_WINDOW",
        threshold: 3,
        severity: "WARNING",
        title: `Gross margin decline of ${mom} pts is the largest in the trailing window`,
        detail:
          `Gross margin\nCurrent: ${r1(gm)}%\nPrior: ${r1(prior.grossMarginPct)}%\n` +
          `Difference: ${mom} points\nDetection: Largest decline in trailing ≤12 months\n` +
          `This is a relative ranking, not a statistical proof of error.`,
        unit: "percent",
      });
    }
  }

  // Deduplicate: keep highest severity per metric+method
  const byKey = new Map<string, AnomalyFinding>();
  for (const f of findings) {
    const k = `${f.metricKey}:${f.method}`;
    const prev = byKey.get(k);
    if (!prev || severityRank(f.severity) > severityRank(prev.severity)) byKey.set(k, f);
  }
  return Array.from(byKey.values())
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}
