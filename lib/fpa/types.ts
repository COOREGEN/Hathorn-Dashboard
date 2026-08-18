/**
 * FP&A planning types — forward-looking projections, never accounting actuals.
 *
 * A ModelRun freezes assumptions + results so historical answers do not drift.
 * It is not a financial release and must never write into pl_lines / release_records.
 */

export type ScenarioKey = "BASE" | "UPSIDE" | "DOWNSIDE" | "CUSTOM";

export type EngineKind = "native" | "forge";

/**
 * Annual growth rates (percent points, e.g. 8 = 8% per year).
 * Monthly compounding uses (1 + annual/100)^(1/12) − 1.
 *
 * Financial definitions (amounts in $K, matching PeriodMetrics):
 *   Revenue_t+1     = Revenue_t × (1 + monthlyRevenueGrowth)
 *   GrossProfit_t   = Revenue_t × (grossMarginPct / 100)
 *   DirectCost_t    = Revenue_t − GrossProfit_t
 *     (Direct cost is the residual of revenue − GP. Do NOT also subtract payroll —
 *      in Hathorn, labor often lives inside directCost via the gate tie-out.)
 *   Opex_t+1        = Opex_t × (1 + monthlyOpexGrowth)
 *   NetIncome_t     = GrossProfit_t − Opex_t
 *
 * Cash is NOT projected in v1 — working-capital drivers are insufficient for a
 * responsible cash forecast. Ending cash is reported as baseline only.
 */
export type Assumptions = {
  /** Annual revenue growth % */
  annualRevenueGrowthPct: number;
  /** Target gross margin % of revenue */
  grossMarginPct: number;
  /** Annual opex growth % (operating expenses below the line) */
  annualOpexGrowthPct: number;
  /** Horizon in months (fixed 12 for v1) */
  horizonMonths: number;
};

export type ActualPoint = {
  year: number;
  month: number;
  label: string;
  periodId: string;
  revenue: number;
  directCost: number;
  grossProfit: number;
  opex: number;
  netIncome: number;
  cashTotal: number | null;
  kind: "ACTUAL";
};

export type ForecastPoint = {
  year: number;
  month: number;
  label: string;
  revenue: number;
  directCost: number;
  grossProfit: number;
  opex: number;
  netIncome: number;
  kind: "FORECAST";
};

export type ModelCheck = {
  code: string;
  pass: boolean;
  detail: string;
};

export type ModelResults = {
  baseline: ActualPoint;
  history: ActualPoint[];
  forecast: ForecastPoint[];
  totals: {
    forecastRevenue: number;
    forecastGrossProfit: number;
    forecastOpex: number;
    forecastNetIncome: number;
    /** Baseline cash only — not projected. */
    baselineCash: number | null;
  };
  /** Scenario presets that were applied on top of custom assumptions. */
  scenario: ScenarioKey;
};

export type ModelRunInput = {
  clientId: string;
  sourcePeriodId: string;
  sourceReleaseId: string | null;
  scenario: ScenarioKey;
  assumptions: Assumptions;
};

export type ModelRunRecord = {
  id: string;
  clientId: string;
  sourcePeriodId: string;
  sourceReleaseId: string | null;
  scenario: ScenarioKey;
  engine: EngineKind;
  engineVersion: string;
  assumptions: Assumptions;
  results: ModelResults;
  checks: ModelCheck[];
  status: "OK" | "FAILED";
  analysis: string | null;
  createdBy: string;
  createdAt: string;
};

export const NATIVE_ENGINE_VERSION = "hathorn-native-1.0.0";

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  annualRevenueGrowthPct: 8,
  grossMarginPct: 35,
  annualOpexGrowthPct: 3,
  horizonMonths: 12,
};

/** Scenario overlays — multipliers on annual revenue growth; margin/opex tweaks. */
export function applyScenario(base: Assumptions, scenario: ScenarioKey): Assumptions {
  if (scenario === "CUSTOM" || scenario === "BASE") return { ...base, horizonMonths: 12 };
  if (scenario === "UPSIDE") {
    return {
      ...base,
      horizonMonths: 12,
      annualRevenueGrowthPct: base.annualRevenueGrowthPct + 4,
      grossMarginPct: Math.min(95, base.grossMarginPct + 2),
      annualOpexGrowthPct: Math.max(0, base.annualOpexGrowthPct - 1),
    };
  }
  // DOWNSIDE
  return {
    ...base,
    horizonMonths: 12,
    annualRevenueGrowthPct: base.annualRevenueGrowthPct - 4,
    grossMarginPct: Math.max(0, base.grossMarginPct - 3),
    annualOpexGrowthPct: base.annualOpexGrowthPct + 2,
  };
}
