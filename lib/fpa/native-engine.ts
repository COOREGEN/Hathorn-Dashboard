/**
 * Hathorn native FP&A engine — deterministic 12-month forecast.
 *
 * Uses compound monthly growth derived from annual percentages.
 * Does not project cash. Does not double-count payroll inside direct cost.
 */

import { monthShort } from "../db";
import type {
  Assumptions, ActualPoint, ForecastPoint, ModelCheck, ModelResults, ScenarioKey,
} from "./types";
import { NATIVE_ENGINE_VERSION, applyScenario } from "./types";

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Convert an annual growth % into a monthly compound rate. */
export function monthlyFromAnnual(annualPct: number): number {
  return Math.pow(1 + annualPct / 100, 1 / 12) - 1;
}

export function advanceMonth(year: number, month: number): { year: number; month: number } {
  if (month >= 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

export function validateAssumptions(a: Assumptions): ModelCheck[] {
  const checks: ModelCheck[] = [];
  const push = (code: string, pass: boolean, detail: string) => checks.push({ code, pass, detail });

  push("horizon", a.horizonMonths === 12, `Horizon must be 12 months (got ${a.horizonMonths}).`);
  push("rev_growth_finite", Number.isFinite(a.annualRevenueGrowthPct), "Revenue growth must be a finite number.");
  push("rev_growth_range", a.annualRevenueGrowthPct >= -50 && a.annualRevenueGrowthPct <= 100,
    `Annual revenue growth ${a.annualRevenueGrowthPct}% is outside −50%…100%.`);
  push("margin_range", a.grossMarginPct >= 0 && a.grossMarginPct <= 95,
    `Gross margin ${a.grossMarginPct}% must be between 0 and 95.`);
  push("opex_growth_finite", Number.isFinite(a.annualOpexGrowthPct), "OPEX growth must be a finite number.");
  push("opex_growth_range", a.annualOpexGrowthPct >= -50 && a.annualOpexGrowthPct <= 100,
    `Annual opex growth ${a.annualOpexGrowthPct}% is outside −50%…100%.`);
  return checks;
}

export function runNativeForecast(opts: {
  history: ActualPoint[];
  baseline: ActualPoint;
  assumptions: Assumptions;
  scenario: ScenarioKey;
}): { results: ModelResults; checks: ModelCheck[]; engineVersion: string } {
  const assumptions = applyScenario(opts.assumptions, opts.scenario);
  const checks = validateAssumptions(assumptions);

  if (opts.baseline.revenue <= 0) {
    checks.push({ code: "baseline_revenue", pass: false, detail: "Baseline revenue must be positive." });
  } else {
    checks.push({ code: "baseline_revenue", pass: true, detail: `Baseline revenue $${opts.baseline.revenue}K.` });
  }

  const blocking = checks.some((c) => !c.pass);
  const forecast: ForecastPoint[] = [];

  if (!blocking) {
    const gRev = monthlyFromAnnual(assumptions.annualRevenueGrowthPct);
    const gOpex = monthlyFromAnnual(assumptions.annualOpexGrowthPct);
    let rev = opts.baseline.revenue;
    let opex = opts.baseline.opex;
    let y = opts.baseline.year;
    let m = opts.baseline.month;

    for (let i = 0; i < assumptions.horizonMonths; i++) {
      ({ year: y, month: m } = advanceMonth(y, m));
      rev = rev * (1 + gRev);
      opex = opex * (1 + gOpex);
      const grossProfit = rev * (assumptions.grossMarginPct / 100);
      const directCost = rev - grossProfit;
      const netIncome = grossProfit - opex;
      const point: ForecastPoint = {
        year: y, month: m, label: `${monthShort(m)} ${y}`,
        revenue: r1(rev), directCost: r1(directCost), grossProfit: r1(grossProfit),
        opex: r1(opex), netIncome: r1(netIncome), kind: "FORECAST",
      };
      // Finite check per period
      for (const [k, v] of Object.entries(point)) {
        if (typeof v === "number" && !Number.isFinite(v)) {
          checks.push({ code: "finite", pass: false, detail: `${k} became non-finite in ${point.label}.` });
        }
      }
      forecast.push(point);
    }
    if (!checks.some((c) => c.code === "finite" && !c.pass)) {
      checks.push({ code: "finite", pass: true, detail: "All forecast outputs are finite." });
    }
  }

  const sum = (fn: (p: ForecastPoint) => number) => r1(forecast.reduce((s, p) => s + fn(p), 0));

  const results: ModelResults = {
    baseline: opts.baseline,
    history: opts.history,
    forecast,
    totals: {
      forecastRevenue: sum((p) => p.revenue),
      forecastGrossProfit: sum((p) => p.grossProfit),
      forecastOpex: sum((p) => p.opex),
      forecastNetIncome: sum((p) => p.netIncome),
      baselineCash: opts.baseline.cashTotal,
    },
    scenario: opts.scenario,
  };

  return { results, checks, engineVersion: NATIVE_ENGINE_VERSION };
}
