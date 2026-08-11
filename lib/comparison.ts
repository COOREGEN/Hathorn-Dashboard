/**
 * Period comparison.
 *
 * A number on its own means nothing. The question in an advisory meeting is always
 * "compared to what", and the honest answer changes with the question:
 *
 *   Prior month     — did the thing we discussed last month move?
 *   Same month last year — is this seasonal, or is it real?
 *   Year to date    — are we on track for the year, regardless of one noisy month?
 *   Budget          — did we hit the number we agreed?
 *
 * Everything here is pure and runs on `PeriodMetrics`, so the client can switch
 * comparison instantly without a round trip.
 */

import type { PeriodMetrics } from "./metrics";
import { type MetricRule, metricRules, assess, isMaterial } from "./metric-rules";
import type { ComparabilityResult, ComparabilityIssue } from "./comparability";

export type ComparisonMode = "PRIOR_MONTH" | "PRIOR_YEAR" | "YTD" | "BUDGET" | "NONE";

export const COMPARISON_LABELS: Record<ComparisonMode, string> = {
  PRIOR_MONTH: "Prior month",
  PRIOR_YEAR: "Same month last year",
  YTD: "Year to date vs last year",
  BUDGET: "Budget",
  NONE: "No comparison",
};

export type CompareLine = {
  label: string;
  current: number;
  basis: number;
  delta: number;
  deltaPct: number | null;
  /** Percentage-point move, for lines that are already percentages. */
  points: number | null;
  unit: "money" | "percent" | "count" | "ratio";
  /**
   * True when the move is the direction the owner wants, false when it is not, and
   * null when the movement is below materiality — reported as flat rather than
   * dressed up as good or bad news.
   */
  favourable: boolean | null;
  material: boolean;
  /** For range metrics: which side of the healthy band the current value sits on. */
  bandPosition?: "below" | "inside" | "above";
  /** Why the direction reads the way it does, where that is not obvious. */
  note?: string;
};

export type Comparison = {
  mode: ComparisonMode;
  available: boolean;
  currentLabel: string;
  basisLabel: string;
  /** Set when the mode was asked for but no basis period exists. */
  unavailableReason?: string;
  lines: CompareLine[];
  /**
   * Whether the two periods can honestly be measured against each other, and why not
   * when they cannot. A blocking issue suppresses the comparison instead of degrading
   * it — a delta nobody should trust is worse present than absent.
   */
  comparability?: ComparabilityResult;
  issues: ComparabilityIssue[];
};

const r1 = (n: number) => Math.round(n * 10) / 10;

function pctChange(now: number, then: number): number | null {
  if (then === 0) return null;
  return r1(((now - then) / Math.abs(then)) * 100);
}

/**
 * Builds one line by asking the metric rule what better means.
 *
 * This replaces three near-identical builders that each took a `higherIsBetter`
 * boolean. The boolean was the bug: it cannot express a labor ratio, where both
 * extremes are wrong, so labor ratio was scored lower-is-better and a collapse to 55%
 * read as an improvement.
 */
function line(rule: MetricRule, current: number, basis: number): CompareLine {
  const isPercentish = rule.unit === "percent" || rule.unit === "ratio";
  const delta = isPercentish ? r1(current - basis) : rule.unit === "count"
    ? Math.round(current - basis) : r1(current - basis);
  const verdict = assess(rule, current, basis);

  return {
    label: rule.label,
    current: rule.unit === "count" ? Math.round(current) : r1(current),
    basis: rule.unit === "count" ? Math.round(basis) : r1(basis),
    delta,
    // A percentage-point move expressed as a percentage change is a category error:
    // 78% to 80% is two points, not "up 2.6%".
    deltaPct: isPercentish ? null : pctChange(current, basis),
    points: isPercentish ? delta : null,
    unit: rule.unit,
    favourable: verdict.favourable,
    material: verdict.material,
    bandPosition: verdict.bandPosition,
    note: verdict.note,
  };
}

const hours = (p: PeriodMetrics) => p.entities.reduce((s, e) => s + e.payroll.hoursPaid, 0);

/** The standard set of lines, used for every period-to-period comparison. */
function standardLines(
  cur: PeriodMetrics, basis: PeriodMetrics,
  laborTarget: { lo: number; hi: number } | null,
  language?: { revenueLabel: string; directCostLabel: string; laborRatioLabel: string; laborGuidance: string },
): CompareLine[] {
  // Placeholder band only so other rules construct; labor line is omitted when unprovenanced.
  const r = metricRules(laborTarget ?? { lo: 0, hi: 0 }, language);
  const lines: CompareLine[] = [
    line(r.revenue, cur.revenue, basis.revenue),
    line(r.directCost, cur.directCost, basis.directCost),
    line(r.grossProfit, cur.grossProfit, basis.grossProfit),
    line(r.grossMarginPct, cur.grossMarginPct, basis.grossMarginPct),
    line(r.opex, cur.opex, basis.opex),
    line(r.netIncome, cur.netIncome, basis.netIncome),
    line(r.netMarginPct, cur.netMarginPct, basis.netMarginPct),
  ];
  // No agreed/derived band → report labor elsewhere; do not invent a verdict.
  if (laborTarget) lines.push(line(r.laborPct, cur.laborPct, basis.laborPct));
  lines.push(
    line(r.otPremium, cur.otPremium, basis.otPremium),
    line(r.hours, hours(cur), hours(basis)),
    line(r.cash, cur.cash.total, basis.cash.total),
    line(r.arTotal, cur.arTotal, basis.arTotal),
  );
  return lines;
}

/** Sums a run of periods into one synthetic period for year-to-date comparison. */
export function aggregate(periods: PeriodMetrics[], label: string): PeriodMetrics | null {
  if (!periods.length) return null;
  const sum = (f: (p: PeriodMetrics) => number) => periods.reduce((s, p) => s + f(p), 0);
  const revenue = r1(sum((p) => p.revenue));
  const directCost = r1(sum((p) => p.directCost));
  const opex = r1(sum((p) => p.opex));
  const grossProfit = r1(revenue - directCost);
  const netIncome = r1(grossProfit - opex);
  const last = periods[periods.length - 1];

  // Entity rollup, so an aggregate still supports the per-business view.
  const entityIds = Array.from(new Set(periods.flatMap((p) => p.entities.map((e) => e.id))));
  const entities = entityIds.map((id) => {
    const rows = periods.flatMap((p) => p.entities.filter((e) => e.id === id));
    const eRev = r1(rows.reduce((s, e) => s + e.revenue, 0));
    const eCost = r1(rows.reduce((s, e) => s + e.directCost, 0));
    const eOpex = r1(rows.reduce((s, e) => s + e.opex, 0));
    const eGross = r1(eRev - eCost);
    const eNet = r1(eGross - eOpex);
    const first = rows[0];
    return {
      id, name: first?.name ?? "", status: first?.status ?? "ACTIVE",
      revenue: eRev, directCost: eCost, grossProfit: eGross,
      grossMarginPct: eRev ? r1((eGross / eRev) * 100) : 0,
      opex: eOpex, netIncome: eNet,
      netMarginPct: eRev ? r1((eNet / eRev) * 100) : 0,
      laborPct: eRev ? r1((eCost / eRev) * 100) : 0,
      payroll: {
        wages: r1(rows.reduce((s, e) => s + e.payroll.wages, 0)),
        otPremium: r1(rows.reduce((s, e) => s + e.payroll.otPremium, 0)),
        taxes: r1(rows.reduce((s, e) => s + e.payroll.taxes, 0)),
        workersComp: r1(rows.reduce((s, e) => s + e.payroll.workersComp, 0)),
        processing: r1(rows.reduce((s, e) => s + e.payroll.processing, 0)),
        hoursPaid: Math.round(rows.reduce((s, e) => s + e.payroll.hoursPaid, 0)),
      },
    };
  });

  return {
    periodId: `agg:${label}`, year: last.year, month: last.month, label,
    status: "PUBLISHED", entities,
    revenue, directCost, grossProfit,
    grossMarginPct: revenue ? r1((grossProfit / revenue) * 100) : 0,
    opex, netIncome, netMarginPct: revenue ? r1((netIncome / revenue) * 100) : 0,
    laborPct: revenue ? r1((directCost / revenue) * 100) : 0,
    totalPayroll: r1(sum((p) => p.totalPayroll)),
    otPremium: r1(sum((p) => p.otPremium)),
    // Cash and receivables are balances, not flows: the closing figure, never a sum.
    cash: last.cash,
    ar: last.ar,
    arTotal: last.arTotal,
    notes: [],
  };
}

/**
 * Builds a comparison for the selected period in the requested mode.
 *
 * `all` is the full history the viewer is entitled to see; a client only ever passes
 * published periods, so a comparison can never reveal an unapproved month.
 */
export function buildComparison(
  cur: PeriodMetrics,
  all: PeriodMetrics[],
  mode: ComparisonMode,
  budget?: { revenue: number; directCost: number; opex: number; netIncome: number } | null,
  opts: {
    laborTarget?: { lo: number; hi: number } | null;
    language?: { revenueLabel: string; directCostLabel: string; laborRatioLabel: string; laborGuidance: string };
    /** Supplied by the server, which alone can read period context from the database. */
    checkPair?: (a: PeriodMetrics, b: PeriodMetrics, mode: string) => ComparabilityResult;
    entityScope?: string;
  } = {},
): Comparison {
  const laborTarget = opts.laborTarget ?? null;
  const base: Comparison = {
    mode, available: false, currentLabel: cur.label, basisLabel: "", lines: [], issues: [],
  };

  if (mode === "NONE") return { ...base, available: false };

  /**
   * Runs the comparability gate and refuses the comparison outright on a blocking
   * issue. Suppressing is deliberate: a delta between a cash month and an accrual
   * month is not a weak finding, it is not a finding.
   */
  const gated = (a: PeriodMetrics, b: PeriodMetrics, label: string): Comparison | null => {
    if (!opts.checkPair) return null;
    const check = opts.checkPair(a, b, mode);
    if (check.comparable) return null;
    return {
      ...base, available: false, basisLabel: label,
      comparability: check, issues: check.issues,
      unavailableReason: check.issues.find((i) => i.severity === "blocking")?.message
        ?? "These periods cannot be compared like for like.",
    };
  };

  if (mode === "PRIOR_MONTH") {
    const idx = all.findIndex((p) => p.periodId === cur.periodId);
    const prev = idx > 0 ? all[idx - 1] : null;
    if (!prev) {
      return { ...base, unavailableReason: "This is the earliest month on record." };
    }
    const blocked = gated(cur, prev, prev.label);
    if (blocked) return blocked;
    const check = opts.checkPair?.(cur, prev, mode);
    return {
      ...base, available: true, basisLabel: prev.label,
      lines: standardLines(cur, prev, laborTarget, opts.language),
      comparability: check, issues: check?.issues ?? [],
    };
  }

  if (mode === "PRIOR_YEAR") {
    const prior = all.find((p) => p.year === cur.year - 1 && p.month === cur.month);
    if (!prior) {
      return {
        ...base,
        basisLabel: `${cur.label.split(" ")[0]} ${cur.year - 1}`,
        unavailableReason: `No published statement for ${cur.label.split(" ")[0]} ${cur.year - 1}.`,
      };
    }
    const blocked = gated(cur, prior, prior.label);
    if (blocked) return blocked;
    const check = opts.checkPair?.(cur, prior, mode);
    return {
      ...base, available: true, basisLabel: prior.label,
      lines: standardLines(cur, prior, laborTarget, opts.language),
      comparability: check, issues: check?.issues ?? [],
    };
  }

  if (mode === "YTD") {
    const thisYear = all.filter((p) => p.year === cur.year && p.month <= cur.month);
    const lastYear = all.filter((p) => p.year === cur.year - 1 && p.month <= cur.month);
    const a = aggregate(thisYear, `${cur.year} YTD`);
    const b = aggregate(lastYear, `${cur.year - 1} YTD`);
    if (!a) return { ...base, unavailableReason: "No months recorded for this year yet." };
    if (!b) {
      return {
        ...base, basisLabel: `${cur.year - 1} YTD`,
        unavailableReason: `No ${cur.year - 1} statements to compare against.`,
      };
    }
    // A year-to-date aggregate is compared over the same elapsed months, so day-count
    // variance is inherent and not a defect. Composition change still matters.
    const check = opts.checkPair?.(a, b, mode);
    if (check && !check.comparable) {
      return {
        ...base, available: false, currentLabel: a.label, basisLabel: b.label,
        comparability: check, issues: check.issues,
        unavailableReason: check.issues.find((i) => i.severity === "blocking")?.message,
      };
    }
    return {
      ...base, available: true,
      currentLabel: a.label, basisLabel: b.label,
      lines: standardLines(a, b, laborTarget, opts.language),
      comparability: check, issues: check?.issues ?? [],
    };
  }

  // BUDGET
  if (!budget) {
    return { ...base, basisLabel: "Budget", unavailableReason: "No budget loaded for this month." };
  }
  // A budget is a plan, not another period: no day count, no accounting basis, nothing
  // to gate. The only question is whether the number was met.
  const r = metricRules(laborTarget ?? { lo: 0, hi: 0 }, opts.language);
  return {
    ...base, available: true, basisLabel: "Budget",
    lines: [
      line(r.revenue, cur.revenue, budget.revenue),
      line(r.directCost, cur.directCost, budget.directCost),
      line(r.opex, cur.opex, budget.opex),
      line(r.netIncome, cur.netIncome, budget.netIncome),
    ].filter((l) => l.basis !== 0),
  };
}

/** Year-to-date totals for the headline strip. */
export function ytdSummary(cur: PeriodMetrics, all: PeriodMetrics[]) {
  const months = all.filter((p) => p.year === cur.year && p.month <= cur.month);
  const agg = aggregate(months, `${cur.year} YTD`);
  return agg
    ? {
        available: true, monthCount: months.length,
        revenue: agg.revenue, netIncome: agg.netIncome,
        laborPct: agg.laborPct, netMarginPct: agg.netMarginPct,
      }
    : { available: false, monthCount: 0, revenue: 0, netIncome: 0, laborPct: 0, netMarginPct: 0 };
}
