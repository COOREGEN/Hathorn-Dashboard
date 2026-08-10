/**
 * Deterministic time-series analysis over PeriodMetrics history.
 */

import { clientHistory, type PeriodMetrics } from "../metrics";
import { formatMoneyK, formatPct, pctChange, pointsDelta, r1, mean } from "./calc";
import type { TrendMode, TrendPoint, TrendResult } from "./types";

export type MetricExtractor = {
  key: string;
  label: string;
  unit: TrendResult["unit"];
  get: (p: PeriodMetrics) => number;
};

export const CORE_METRICS: MetricExtractor[] = [
  { key: "revenue", label: "Revenue", unit: "money", get: (p) => p.revenue },
  { key: "directCost", label: "Direct cost", unit: "money", get: (p) => p.directCost },
  { key: "grossProfit", label: "Gross profit", unit: "money", get: (p) => p.grossProfit },
  { key: "grossMarginPct", label: "Gross margin", unit: "percent", get: (p) => p.grossMarginPct },
  { key: "opex", label: "Overhead", unit: "money", get: (p) => p.opex },
  { key: "netIncome", label: "Net income", unit: "money", get: (p) => p.netIncome },
  { key: "laborPct", label: "Labor ratio", unit: "percent", get: (p) => p.laborPct },
  { key: "cash", label: "Cash", unit: "money", get: (p) => p.cash.total },
  { key: "arTotal", label: "Receivables", unit: "money", get: (p) => p.arTotal },
  {
    key: "totalPayroll", label: "Payroll", unit: "money", get: (p) => p.totalPayroll,
  },
];

function seriesFrom(history: PeriodMetrics[], get: (p: PeriodMetrics) => number): TrendPoint[] {
  return history.map((p) => ({
    periodId: p.periodId,
    label: p.label,
    year: p.year,
    month: p.month,
    value: get(p),
  }));
}

function materialFlat(unit: TrendResult["unit"], absDiff: number, pct: number | null): boolean {
  if (unit === "percent") return Math.abs(absDiff) < 0.5;
  if (pct != null && Math.abs(pct) < 2 && Math.abs(absDiff) < 2) return true;
  return Math.abs(absDiff) < 1 && (pct == null || Math.abs(pct) < 2);
}

export function computeTrend(
  history: PeriodMetrics[],
  metric: MetricExtractor,
  mode: TrendMode,
  asOfPeriodId?: string,
): TrendResult {
  let hist = history.filter((p) => p.revenue !== 0 || p.directCost !== 0 || p.cash.total !== 0);
  if (asOfPeriodId) {
    const idx = hist.findIndex((p) => p.periodId === asOfPeriodId);
    if (idx >= 0) hist = hist.slice(0, idx + 1);
  }
  const notes: string[] = [];
  const series = seriesFrom(hist, metric.get);
  const currentPt = series[series.length - 1];
  if (!currentPt) {
    return {
      metricKey: metric.key, label: metric.label, unit: metric.unit, mode,
      current: 0, prior: null, difference: null, percentageChange: null, pointsChange: null,
      trendDirection: "unavailable", series: [], method: mode,
      notes: ["No periods with figures."],
    };
  }

  let prior: number | null = null;
  let method = mode;
  let current = currentPt.value;

  if (mode === "MoM") {
    prior = series.length >= 2 ? series[series.length - 2].value : null;
    method = "Month-over-month vs prior period in history";
    if (prior == null) notes.push("No prior month in history.");
  } else if (mode === "YoY") {
    const cur = hist[hist.length - 1];
    const yoy = hist.find((p) => p.year === cur.year - 1 && p.month === cur.month);
    prior = yoy ? metric.get(yoy) : null;
    method = "Year-over-year same calendar month";
    if (prior == null) notes.push("Same month last year not available (published/reviewed history only when loaded as such).");
  } else if (mode === "TTM") {
    const window = series.slice(-12);
    current = r1(window.reduce((s, p) => s + p.value, 0));
    const prevWindow = series.slice(-24, -12);
    prior = prevWindow.length === 12
      ? r1(prevWindow.reduce((s, p) => s + p.value, 0))
      : null;
    method = "Trailing twelve months (sum of flows)";
    if (metric.unit === "percent") {
      notes.push("TTM sum is not meaningful for percentage metrics; use AVG_3M/AVG_6M instead.");
      return {
        metricKey: metric.key, label: metric.label, unit: metric.unit, mode,
        current: currentPt.value, prior: null, difference: null, percentageChange: null,
        pointsChange: null, trendDirection: "unavailable", series,
        method, notes,
      };
    }
    if (window.length < 12) notes.push(`TTM uses ${window.length} months (incomplete).`);
    if (prior == null) notes.push("Prior TTM window unavailable.");
  } else if (mode === "AVG_3M" || mode === "AVG_6M") {
    const n = mode === "AVG_3M" ? 3 : 6;
    const window = series.slice(-n).map((p) => p.value);
    const prev = series.slice(-2 * n, -n).map((p) => p.value);
    current = mean(window) ?? currentPt.value;
    prior = prev.length === n ? mean(prev) : null;
    method = `${n}-month average vs prior ${n}-month average`;
    if (window.length < n) notes.push(`Average uses ${window.length} months.`);
  }

  const difference = prior == null ? null : r1(current - prior);
  const percentageChange = prior == null ? null : pctChange(current, prior);
  const pointsChange = metric.unit === "percent" && prior != null
    ? pointsDelta(current, prior)
    : null;

  let trendDirection: TrendResult["trendDirection"] = "unavailable";
  if (difference != null) {
    if (materialFlat(metric.unit, difference, percentageChange)) trendDirection = "flat";
    else trendDirection = difference > 0 ? "up" : "down";
  }

  return {
    metricKey: metric.key,
    label: metric.label,
    unit: metric.unit,
    mode,
    current: r1(current),
    prior: prior == null ? null : r1(prior),
    difference,
    percentageChange: metric.unit === "percent" ? null : percentageChange,
    pointsChange,
    trendDirection,
    series,
    method,
    notes,
  };
}

export function trendsForPeriod(
  clientId: string,
  periodId: string,
  modes: TrendMode[] = ["MoM", "YoY"],
  publishedOnly = false,
): TrendResult[] {
  const history = clientHistory(clientId, publishedOnly);
  const out: TrendResult[] = [];
  for (const metric of CORE_METRICS) {
    for (const mode of modes) {
      out.push(computeTrend(history, metric, mode, periodId));
    }
  }
  return out;
}

export function formatTrendDelta(t: TrendResult): string {
  if (t.trendDirection === "unavailable") return "—";
  if (t.unit === "percent" && t.pointsChange != null) {
    const s = t.pointsChange >= 0 ? "+" : "";
    return `${s}${t.pointsChange.toFixed(1)} pts`;
  }
  if (t.difference == null) return "—";
  if (t.unit === "money") {
    const pct = t.percentageChange == null ? "" : ` (${t.percentageChange >= 0 ? "+" : ""}${t.percentageChange}%)`;
    return `${t.difference >= 0 ? "+" : ""}${formatMoneyK(t.difference)}${pct}`;
  }
  return `${t.difference >= 0 ? "+" : ""}${formatPct(t.difference)}`;
}

/** Simple linear trend projection for next period revenue — labeled statistical, not AI. */
export function linearRevenueProjection(history: PeriodMetrics[]): {
  method: string;
  projectedNextRevenue: number;
  historicalGrowthPct: number | null;
} | null {
  const pts = history
    .filter((p) => p.revenue > 0)
    .slice(-12)
    .map((p, i) => ({ x: i, y: p.revenue }));
  if (pts.length < 3) return null;
  const n = pts.length;
  const sumX = pts.reduce((s, p) => s + p.x, 0);
  const sumY = pts.reduce((s, p) => s + p.y, 0);
  const sumXY = pts.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = pts.reduce((s, p) => s + p.x * p.x, 0);
  const den = n * sumXX - sumX * sumX;
  if (den === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / den;
  const intercept = (sumY - slope * sumX) / n;
  const next = r1(intercept + slope * n);
  const first = pts[0].y;
  const last = pts[pts.length - 1].y;
  const growth = pctChange(last, first);
  return {
    method: "Ordinary least-squares linear trend on up to 12 months of revenue (Trend Projection — not an AI forecast)",
    projectedNextRevenue: Math.max(0, next),
    historicalGrowthPct: growth,
  };
}
