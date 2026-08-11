/**
 * The starting metric library.
 *
 * These are definitions, not opinions. Each says what to compute and which direction is
 * better — both of which follow from accounting rather than from any industry's data.
 * None carries a target, because a target is a claim about a specific business and
 * belongs on the client record where its source can be recorded.
 *
 * Presets below suggest *which* metrics to activate for a kind of business. That is a
 * defensible thing to ship: knowing that a childcare centre should watch enrolment and a
 * rental operator should watch occupancy requires no invented benchmark. Knowing that
 * childcare labour "should" be 45–55% does, and is not shipped.
 */
import { upsertDefinition, setClientConfig, type KpiDefinition } from "./kpi-registry";

type Def = Partial<KpiDefinition> & { key: string; label: string };

export const DEFAULT_KPIS: Def[] = [
  // ---- Profitability ----
  { key: "gross_margin", label: "Gross margin", category: "Profitability",
    formula: "grossProfit / revenue * 100", unit: "percent", direction: "higher_is_better",
    materialityAbs: 0.5, decimals: 1,
    description: "Revenue less direct cost, as a share of revenue.",
    guidance: "Compression here shows up before it reaches net income.", isDefault: true },
  { key: "net_margin", label: "Net margin", category: "Profitability",
    formula: "netIncome / revenue * 100", unit: "percent", direction: "higher_is_better",
    materialityAbs: 0.5, isDefault: true },
  { key: "opex_ratio", label: "Overhead ratio", category: "Profitability",
    formula: "opex / revenue * 100", unit: "percent", direction: "lower_is_better",
    materialityAbs: 0.5, isDefault: true,
    description: "Overhead as a share of revenue." },
  { key: "direct_cost_ratio", label: "Direct cost ratio", category: "Profitability",
    formula: "directCost / revenue * 100", unit: "percent", direction: "target_range",
    materialityAbs: 0.5, isDefault: true,
    description: "Cost of delivery as a share of revenue.",
    guidance: "Set as a range where both extremes are a problem: too high gives margin away, too low usually means work was not delivered as billed or costs are posting elsewhere." },

  // ---- Labour ----
  { key: "labor_ratio", label: "Labor ratio", category: "Labor",
    formula: "totalPayroll / revenue * 100", unit: "percent", direction: "target_range",
    materialityAbs: 0.5, isDefault: true,
    guidance: "A labour ratio usually has a floor as well as a ceiling." },
  { key: "overtime_share", label: "Overtime share of payroll", category: "Labor",
    formula: "overtimePremium / totalPayroll * 100", unit: "percent", direction: "lower_is_better",
    materialityAbs: 0.3, isDefault: true,
    guidance: "Overtime premium is the quiet leak — it rarely appears as its own line in a conversation." },
  { key: "revenue_per_hour", label: "Revenue per hour", category: "Labor",
    formula: "revenue / hoursPaid * 1000", unit: "money_exact", direction: "higher_is_better",
    materialityRel: 2, decimals: 2,
    description: "Effective rate earned on every paid hour." },
  { key: "cost_per_hour", label: "Cost per paid hour", category: "Labor",
    formula: "totalPayroll / hoursPaid * 1000", unit: "money_exact", direction: "lower_is_better",
    materialityRel: 2, decimals: 2 },
  { key: "revenue_per_head", label: "Revenue per employee", category: "Labor",
    formula: "revenue / headcount * 1000", unit: "money_exact", direction: "higher_is_better",
    materialityRel: 3,
    description: "Needs a headcount input on the close." },

  // ---- Liquidity ----
  { key: "current_ratio", label: "Current ratio", category: "Liquidity",
    formula: "currentAssets / currentLiabilities", unit: "ratio", direction: "target_range",
    materialityAbs: 0.05, decimals: 2, isDefault: true,
    guidance: "Below the range is a liquidity risk; far above it is usually idle capital." },
  { key: "quick_cash_days", label: "Days of cash", category: "Liquidity",
    formula: "cash / (directCost + opex) * daysInPeriod", unit: "days",
    direction: "higher_is_better", materialityAbs: 2, decimals: 0, isDefault: true,
    description: "Days of operating cost covered by cash on hand." },
  { key: "working_capital", label: "Working capital", category: "Liquidity",
    formula: "currentAssets - currentLiabilities", unit: "money",
    direction: "higher_is_better", materialityRel: 5, isDefault: true },
  { key: "debt_to_equity", label: "Debt to equity", category: "Liquidity",
    formula: "totalLiabilities / equity", unit: "ratio", direction: "lower_is_better",
    materialityAbs: 0.05, decimals: 2, isDefault: true },

  // ---- Receivables ----
  { key: "dso", label: "Days sales outstanding", category: "Receivables",
    formula: "receivables / revenue * daysInPeriod", unit: "days",
    direction: "lower_is_better", materialityAbs: 2, decimals: 0, isDefault: true,
    description: "How long revenue sits before it becomes cash." },
  { key: "ar_over_90_share", label: "Receivables past 90 days", category: "Receivables",
    formula: "receivablesPast90 / receivables * 100", unit: "percent",
    direction: "lower_is_better", materialityAbs: 1, isDefault: true,
    guidance: "Aged balances are where write-offs and timely-filing losses come from." },
  { key: "ar_to_revenue", label: "Receivables to revenue", category: "Receivables",
    formula: "receivables / revenue * 100", unit: "percent", direction: "lower_is_better",
    materialityAbs: 2 },

  // ---- Volume ----
  { key: "utilisation", label: "Capacity used", category: "Volume",
    formula: "unitsSold / unitsAvailable * 100", unit: "percent",
    direction: "target_range", materialityAbs: 1,
    description: "Units delivered against units available. Occupancy, enrolment, billable share.",
    guidance: "Unsold capacity is usually the fastest revenue to recover — it costs nothing to fix." },
  { key: "revenue_per_unit", label: "Revenue per unit", category: "Volume",
    formula: "revenue / unitsSold * 1000", unit: "money_exact", direction: "higher_is_better",
    materialityRel: 2, decimals: 2,
    description: "Average rate: per night, per child, per job, per cover." },
  { key: "revenue_per_day", label: "Revenue per day", category: "Volume",
    formula: "revenue / daysInPeriod * 1000", unit: "money_exact", direction: "higher_is_better",
    materialityRel: 2, decimals: 2,
    description: "Removes the calendar so a short month is not read as a decline." },

  // ---- Growth ----
  { key: "revenue_amount", label: "Revenue", category: "Growth",
    formula: "revenue", unit: "money", direction: "higher_is_better",
    materialityAbs: 2, materialityRel: 2, isDefault: true },
  { key: "net_income_amount", label: "Net income", category: "Growth",
    formula: "netIncome", unit: "money", direction: "higher_is_better",
    materialityAbs: 1, materialityRel: 5, isDefault: true },
  { key: "cash_amount", label: "Cash on hand", category: "Growth",
    formula: "cash", unit: "money", direction: "higher_is_better",
    materialityAbs: 5, isDefault: true },
];

/**
 * Which metrics to switch on for a kind of business.
 *
 * A preset is a selection and a priority, never a target. It encodes that a rental
 * operator should be watching occupancy and rate rather than labour — which is a
 * structural fact about the business — without pretending to know what good occupancy is
 * for this particular operator.
 */
export const PRESETS: Record<string, { label: string; note: string; kpis: [string, number][] }> = {
  home_care: {
    label: "Home Health Care",
    note: "Labour is the whole cost of delivery, so the ratio and the effective rate carry everything. Payer ageing matters because claims are denied, not merely late.",
    kpis: [["revenue_amount", 3], ["labor_ratio", 3], ["revenue_per_hour", 3], ["net_income_amount", 3],
      ["cost_per_hour", 2], ["overtime_share", 2], ["gross_margin", 2], ["ar_over_90_share", 3],
      ["dso", 2], ["quick_cash_days", 2], ["cash_amount", 2], ["current_ratio", 1]],
  },
  childcare: {
    label: "Childcare & Preschool",
    note: "Ratio requirements put a floor under staffing, so enrolment drives everything. A low labour ratio here usually means empty places rather than efficiency.",
    kpis: [["revenue_amount", 3], ["utilisation", 3], ["labor_ratio", 3], ["revenue_per_unit", 3],
      ["net_income_amount", 2], ["gross_margin", 2], ["opex_ratio", 2], ["quick_cash_days", 2],
      ["dso", 1], ["cash_amount", 2]],
  },
  short_term_rental: {
    label: "Short-Term Rental",
    note: "No payroll in the direct line. Occupancy and rate are the two levers, and money arrives within days so ageing means little.",
    kpis: [["revenue_amount", 3], ["utilisation", 3], ["revenue_per_unit", 3], ["gross_margin", 3],
      ["net_income_amount", 3], ["direct_cost_ratio", 2], ["opex_ratio", 2],
      ["revenue_per_day", 2], ["cash_amount", 2], ["quick_cash_days", 2]],
  },
  property_management: {
    label: "Property Management",
    note: "Gross bookings are not revenue. Everything must be read against the management fee, and fee recovery is where margin quietly leaks.",
    kpis: [["revenue_amount", 3], ["net_margin", 3], ["utilisation", 3], ["opex_ratio", 3],
      ["revenue_per_unit", 2], ["quick_cash_days", 2], ["dso", 2], ["cash_amount", 2],
      ["ar_over_90_share", 2], ["current_ratio", 1]],
  },
  professional_services: {
    label: "Professional Services",
    note: "You sell time. The effective rate and the share of capacity billed are the business.",
    kpis: [["revenue_amount", 3], ["revenue_per_hour", 3], ["utilisation", 3], ["labor_ratio", 3],
      ["gross_margin", 2], ["dso", 3], ["revenue_per_head", 2], ["net_income_amount", 2],
      ["quick_cash_days", 2], ["ar_over_90_share", 2]],
  },
  restaurant: {
    label: "Restaurant & Food Service",
    note: "Prime cost — food plus labour together — is the number operators manage daily.",
    kpis: [["revenue_amount", 3], ["direct_cost_ratio", 3], ["labor_ratio", 3],
      ["revenue_per_unit", 3], ["gross_margin", 2], ["opex_ratio", 2],
      ["revenue_per_day", 2], ["quick_cash_days", 3], ["cash_amount", 2]],
  },
  contractor: {
    label: "Construction & Trades",
    note: "Job margin and collections. Retainage is earned but not collected, so ageing overstates trouble unless read carefully.",
    kpis: [["revenue_amount", 3], ["gross_margin", 3], ["net_income_amount", 3], ["dso", 3],
      ["ar_over_90_share", 3], ["revenue_per_unit", 2], ["working_capital", 2],
      ["quick_cash_days", 2], ["current_ratio", 2]],
  },
  retail: {
    label: "Retail & E-commerce",
    note: "Margin per order and inventory-driven working capital.",
    kpis: [["revenue_amount", 3], ["gross_margin", 3], ["revenue_per_unit", 3],
      ["net_income_amount", 2], ["opex_ratio", 2], ["working_capital", 2],
      ["quick_cash_days", 2], ["cash_amount", 2]],
  },
  nil_athlete: {
    label: "NIL Athlete",
    note: "An individual, not a business. Earnings, what reaches them after fees, and what is already owed in tax.",
    kpis: [["revenue_amount", 3], ["net_income_amount", 3], ["cash_amount", 3],
      ["direct_cost_ratio", 2], ["dso", 2]],
  },
  generic: {
    label: "General Business",
    note: "No industry assumptions. Start here and add what the client actually manages.",
    kpis: [["revenue_amount", 3], ["gross_margin", 3], ["net_income_amount", 3],
      ["opex_ratio", 2], ["cash_amount", 2], ["quick_cash_days", 2], ["dso", 2],
      ["current_ratio", 1]],
  },
};

/** Installs the starting library. Safe to re-run; existing definitions are updated. */
export function installDefaults() {
  for (const d of DEFAULT_KPIS) upsertDefinition(d);
  return DEFAULT_KPIS.length;
}

/**
 * Applies a preset to a client.
 *
 * Activates a selection with priorities and *no targets*. Every metric arrives in the
 * "reported, not judged" state until someone agrees a target or derives one from the
 * client's own history — which is the honest starting position for a new engagement.
 */
export function applyPreset(clientId: string, presetKey: string) {
  const preset = PRESETS[presetKey] ?? PRESETS.generic;
  preset.kpis.forEach(([key, importance], i) => {
    setClientConfig(clientId, key, { active: true, importance, sort: i, targetSource: "NONE" });
  });
  return preset.kpis.length;
}
