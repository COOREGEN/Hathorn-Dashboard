/**
 * Advanced Financial Intelligence — shared types.
 *
 * Calculate first. Detect second. Explain third. Never invent financial truth.
 */

export const FI_ENGINE_VERSION = "1.0.0";
export const FI_POLICY_VERSION = "1.0.0";

export type SourceQuality =
  | "DIRECT_SOURCE_DATA"
  | "PARTIALLY_ALLOCATED_DATA"
  | "FULLY_ALLOCATED_DATA"
  | "INCOMPLETE_DATA";

export type DimensionAvailability = "WORKING" | "PARTIAL" | "UNAVAILABLE";

export type TrendMode = "MoM" | "YoY" | "TTM" | "AVG_3M" | "AVG_6M";

export type TrendPoint = {
  periodId: string;
  label: string;
  year: number;
  month: number;
  value: number;
};

export type TrendResult = {
  metricKey: string;
  label: string;
  unit: "money" | "percent" | "count" | "ratio" | "days";
  mode: TrendMode;
  current: number;
  prior: number | null;
  difference: number | null;
  percentageChange: number | null;
  /** For percent metrics: movement in percentage points. */
  pointsChange: number | null;
  trendDirection: "up" | "down" | "flat" | "unavailable";
  series: TrendPoint[];
  method: string;
  notes: string[];
};

export type AnomalyMethod =
  | "PERCENT_THRESHOLD"
  | "ABSOLUTE_THRESHOLD"
  | "ROLLING_AVERAGE_DEVIATION"
  | "SAME_PERIOD_PRIOR_YEAR"
  | "LARGEST_DECLINE_IN_WINDOW";

export type AnomalyFinding = {
  metricKey: string;
  label: string;
  currentValue: number;
  referenceValue: number | null;
  difference: number | null;
  differencePct: number | null;
  method: AnomalyMethod;
  threshold: number;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  detail: string;
  unit: "money" | "percent" | "count";
};

export type ProfitabilityRow = {
  dimension: "ENTITY" | "PAYER_AR";
  key: string;
  name: string;
  revenue: number;
  directCost: number;
  grossProfit: number;
  grossMarginPct: number | null;
  allocatedOpex: number | null;
  contributionAfterAlloc: number | null;
  revenueSharePct: number | null;
  sourceQuality: SourceQuality;
};

export type ProfitabilityReport = {
  dimension: "ENTITY" | "PAYER_AR";
  availability: DimensionAvailability;
  reason?: string;
  sourceQuality: SourceQuality;
  rows: ProfitabilityRow[];
  concentration?: {
    top1Pct: number | null;
    top5Pct: number | null;
    basis: string;
  };
  allocation?: {
    method: string | null;
    ruleId: string | null;
    version: number | null;
    pool: number | null;
  };
};

export type DriverSlice = {
  key: string;
  label: string;
  current: number;
  prior: number;
  delta: number;
};

export type DriverBridge = {
  metricKey: string;
  label: string;
  totalDelta: number;
  slices: DriverSlice[];
  other: number;
  method: string;
  notes: string[];
};

export type CashIntelligence = {
  currentCash: number;
  priorCash: number | null;
  cashChange: number | null;
  monthlyGeneration: number | null;
  trailingBurn3m: number | null;
  trailingBurn6m: number | null;
  burnBasis: "3m_avg" | "6m_avg" | "1m" | "none";
  monthlyBurnUsed: number | null;
  runwayMonths: number | null;
  runwayApplicable: boolean;
  runwayReason: string;
  method: string;
};

export type ForecastIntelligence = {
  available: boolean;
  reason?: string;
  management?: {
    runId: string;
    scenario: string;
    forecastRevenue: number;
    forecastNetIncome: number;
    engine: string;
  };
  trendProjection?: {
    method: string;
    projectedNextRevenue: number;
    historicalGrowthPct: number | null;
  };
  comparison?: {
    managementGrowthPct: number | null;
    trendGrowthPct: number | null;
    differencePoints: number | null;
    note: string;
  };
  accuracy?: {
    available: boolean;
    dollarError: number | null;
    percentageError: number | null;
    note: string;
  };
};

export type SignalStatus = "NEW" | "REVIEWED" | "DISMISSED" | "MONITORING" | "SUPERSEDED";

export type FinancialSignal = {
  id: string;
  firmId: string;
  clientId: string;
  periodId: string;
  signalKey: string;
  signalType: string;
  metricKey: string;
  severity: string;
  title: string;
  detectedValue: number | null;
  referenceValue: number | null;
  difference: number | null;
  differencePct: number | null;
  method: string;
  threshold: number | null;
  status: SignalStatus;
  sourceRefs: { type: string; id?: string; title: string }[];
  detail: Record<string, unknown>;
  engineVersion: string;
  detectedAt: string;
};

export type IntelligenceReadiness = {
  trends: DimensionAvailability;
  cash: DimensionAvailability;
  signals: DimensionAvailability;
  entityProfitability: DimensionAvailability;
  customerProfitability: DimensionAvailability;
  projectJobCosting: DimensionAvailability;
  locationProfitability: DimensionAvailability;
  opexDrivers: DimensionAvailability;
  forecastCompare: DimensionAvailability;
  arReceivables: DimensionAvailability;
  notes: string[];
};

export type IntelligenceOverview = {
  clientId: string;
  periodId: string;
  periodLabel: string;
  sourceKind: "working_ledger" | "financial_release";
  engineVersion: string;
  kpis: {
    key: string;
    label: string;
    value: number;
    formatted: string;
    trend: TrendResult | null;
  }[];
  signals: AnomalyFinding[];
  profitability: ProfitabilityReport;
  cash: CashIntelligence;
  drivers: DriverBridge[];
  forecast: ForecastIntelligence;
  readiness: IntelligenceReadiness;
  seasonality: {
    available: boolean;
    reason: string;
    note?: string;
  };
};
