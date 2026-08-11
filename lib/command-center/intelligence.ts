import type { CCLens, CCPeriod, CommandCenterModel } from "./model";
import { LENS_META } from "./model";

export function seriesFor(periods: CCPeriod[], lens: CCLens): number[] {
  const key = LENS_META[lens].key;
  return periods.map((p) => Number(p[key]));
}

export function priorYearSeries(periods: CCPeriod[], lens: CCLens, activeIdx: number): (number | null)[] {
  const key = LENS_META[lens].key;
  return periods.map((p, i) => {
    if (i > activeIdx) return null;
    const py = periods.find((x) => x.month === p.month && x.year === p.year - 1);
    return py ? Number(py[key]) : null;
  });
}

export function budgetSeries(periods: CCPeriod[], lens: CCLens): (number | null)[] {
  if (lens !== "revenue") return periods.map(() => null);
  return periods.map((p) => p.budgetRevenue);
}

/** Trailing confidence band on the latest actual (advisory overlay). */
export function forecastBand(values: number[]): {
  forecast: (number | null)[];
  lo: (number | null)[];
  hi: (number | null)[];
} {
  const forecast = values.map(() => null as number | null);
  const lo = values.map(() => null as number | null);
  const hi = values.map(() => null as number | null);
  if (values.length < 4) return { forecast, lo, hi };
  const last = values[values.length - 1];
  const vol = stdev(values.slice(-6));
  forecast[values.length - 1] = last;
  lo[values.length - 1] = last - vol * 0.85;
  hi[values.length - 1] = last + vol * 0.85;
  return { forecast, lo, hi };
}

function stdev(xs: number[]) {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
  return Math.sqrt(v) || 1;
}

export function detectAnomalies(values: number[], labels: string[]): { index: number; label: string; z: number }[] {
  if (values.length < 5) return [];
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  const s = stdev(values);
  return values
    .map((v, i) => ({ index: i, label: labels[i], z: (v - m) / (s || 1) }))
    .filter((x) => Math.abs(x.z) >= 1.75);
}

export function fmtMoney(n: number) {
  const abs = Math.abs(n);
  const body = abs >= 100 ? abs.toFixed(0) : abs.toFixed(1);
  return `${n < 0 ? "−" : ""}$${body}K`;
}

export function fmtPct(n: number) {
  return `${n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}%`;
}

export function fmtVal(n: number, unit: "money" | "pct") {
  return unit === "pct" ? fmtPct(n) : fmtMoney(n);
}

export function deltaPct(cur: number, prior: number | null | undefined) {
  if (prior == null || prior === 0) return null;
  return ((cur - prior) / Math.abs(prior)) * 100;
}

export function askContext(model: CommandCenterModel, lens: CCLens, periodLabel: string, pointValue?: number) {
  const meta = LENS_META[lens];
  const v = pointValue != null ? fmtVal(pointValue, meta.unit) : "";
  return [
    `Why did ${meta.label.toLowerCase()} move in ${periodLabel}?`,
    `Explain ${meta.label.toLowerCase()} ${v} in ${periodLabel}`,
    "What should I open with in Close Room?",
    "Where is concentration risk in AR?",
  ];
}
