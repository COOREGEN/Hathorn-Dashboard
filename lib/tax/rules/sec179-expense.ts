/**
 * Deterministic pilot rule: IRC §179 expense deduction limitation (tax year 2025).
 *
 * Rule name: sec179_expense_limit
 * Tax year: 2025 only
 *
 * Inputs:
 *   equipment_cost (currency) — cost of §179 property
 *   placed_in_service (boolean)
 *   business_use_pct (percent 0–100)
 *   total_section179_property_cost (currency, optional) — aggregate for phase-out;
 *     defaults to qualifying cost of this asset when omitted
 *
 * Formula / decision logic (2025):
 *   1. Require tax_year === 2025
 *   2. Require equipment_cost, placed_in_service, business_use_pct
 *   3. Not eligible if not placed in service
 *   4. Not eligible if business use ≤ 50% (IRC §179(d)(1))
 *   5. qualifying_cost = equipment_cost × (business_use_pct / 100)
 *   6. Dollar limitation = $1,250,000 (Rev. Proc. 2024-40)
 *   7. Phase-out threshold = $3,130,000; dollar limit reduced dollar-for-dollar
 *      by excess of total §179 property cost over threshold (IRC §179(b)(2))
 *   8. allowable = min(qualifying_cost, adjusted_dollar_limit), floored at 0
 *
 * Authority:
 *   - IRC §179 (expense deduction for certain depreciable property)
 *   - Rev. Proc. 2024-40 (2025 inflation adjustments for §179)
 *   - IRS Topic No. 509 / Publication 946 (business-use > 50% concept)
 *
 * Effective: tax year 2025. Not applied to other years without a new rule version.
 *
 * This module does NOT file returns, make elections, or post journal entries.
 */

import type { TaxAuthorityReference, TaxRuleResult } from "../types";

export const SEC179_RULE_KEY = "sec179_expense_limit";
export const SEC179_RULE_VERSION = "2025.1.0";

/** 2025 §179 dollar limitation — Rev. Proc. 2024-40 */
export const SEC179_2025_DOLLAR_LIMIT = 1_250_000;
/** 2025 §179 investment limitation (phase-out begins) — Rev. Proc. 2024-40 */
export const SEC179_2025_PHASEOUT_THRESHOLD = 3_130_000;

const AUTHORITIES: TaxAuthorityReference[] = [
  {
    authorityId: "auth-irc-179",
    citation: "IRC §179",
    title: "Election to expense certain depreciable business assets",
    sourceType: "IRC",
    url: "https://www.law.cornell.edu/uscode/text/26/179",
  },
  {
    authorityId: "auth-rp-2024-40",
    citation: "Rev. Proc. 2024-40",
    title: "2025 inflation adjustments (including §179)",
    sourceType: "REV_PROCEDURE",
    url: "https://www.irs.gov/irb/2024-45_IRB",
  },
];

function num(facts: Record<string, string>, key: string): number | null {
  if (facts[key] == null || facts[key] === "") return null;
  const n = Number(String(facts[key]).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function bool(facts: Record<string, string>, key: string): boolean | null {
  if (facts[key] == null || facts[key] === "") return null;
  const v = String(facts[key]).toLowerCase();
  if (["1", "true", "yes", "y"].includes(v)) return true;
  if (["0", "false", "no", "n"].includes(v)) return false;
  return null;
}

export function runSec179ExpenseLimit(opts: {
  taxYear: number;
  facts: Record<string, string>;
}): TaxRuleResult {
  const { taxYear, facts } = opts;

  if (taxYear !== 2025) {
    return {
      ruleKey: SEC179_RULE_KEY,
      ruleVersion: SEC179_RULE_VERSION,
      taxYear,
      status: "UNSUPPORTED_TAX_YEAR",
      outputs: {},
      missingFacts: [],
      authorityRefs: AUTHORITIES,
      detail: `Rule ${SEC179_RULE_KEY} ${SEC179_RULE_VERSION} supports tax year 2025 only. Requested ${taxYear}.`,
    };
  }

  const missing: string[] = [];
  const equipmentCost = num(facts, "equipment_cost");
  const placed = bool(facts, "placed_in_service");
  const businessUse = num(facts, "business_use_pct");

  if (equipmentCost == null) missing.push("equipment_cost");
  if (placed == null) missing.push("placed_in_service");
  if (businessUse == null) missing.push("business_use_pct");

  if (missing.length) {
    return {
      ruleKey: SEC179_RULE_KEY,
      ruleVersion: SEC179_RULE_VERSION,
      taxYear,
      status: "NEEDS_INFORMATION",
      outputs: {},
      missingFacts: missing,
      authorityRefs: AUTHORITIES,
      detail: "Insufficient information to evaluate §179 expense limitation.",
    };
  }

  if (!placed) {
    return {
      ruleKey: SEC179_RULE_KEY,
      ruleVersion: SEC179_RULE_VERSION,
      taxYear,
      status: "NOT_ELIGIBLE",
      outputs: {
        allowable_section179: 0,
        qualifying_cost: 0,
        dollar_limit: SEC179_2025_DOLLAR_LIMIT,
        phaseout_threshold: SEC179_2025_PHASEOUT_THRESHOLD,
      },
      missingFacts: [],
      authorityRefs: AUTHORITIES,
      detail: "Property not placed in service in the tax year — §179 expense not available for this item.",
    };
  }

  if ((businessUse as number) <= 50) {
    return {
      ruleKey: SEC179_RULE_KEY,
      ruleVersion: SEC179_RULE_VERSION,
      taxYear,
      status: "NOT_ELIGIBLE",
      outputs: {
        allowable_section179: 0,
        qualifying_cost: 0,
        business_use_pct: businessUse,
        dollar_limit: SEC179_2025_DOLLAR_LIMIT,
      },
      missingFacts: [],
      authorityRefs: AUTHORITIES,
      detail: "Business use ≤ 50%. IRC §179 requires predominantly business use (>50%).",
    };
  }

  const qualifying = Math.round((equipmentCost as number) * ((businessUse as number) / 100) * 100) / 100;
  const totalProperty = num(facts, "total_section179_property_cost") ?? qualifying;
  const excess = Math.max(0, totalProperty - SEC179_2025_PHASEOUT_THRESHOLD);
  const adjustedLimit = Math.max(0, SEC179_2025_DOLLAR_LIMIT - excess);
  const allowable = Math.min(qualifying, adjustedLimit);

  return {
    ruleKey: SEC179_RULE_KEY,
    ruleVersion: SEC179_RULE_VERSION,
    taxYear,
    status: "ELIGIBLE",
    outputs: {
      qualifying_cost: qualifying,
      total_section179_property_cost: totalProperty,
      dollar_limit: SEC179_2025_DOLLAR_LIMIT,
      phaseout_threshold: SEC179_2025_PHASEOUT_THRESHOLD,
      phaseout_reduction: excess,
      adjusted_dollar_limit: adjustedLimit,
      allowable_section179: allowable,
      estimate_only: true,
    },
    missingFacts: [],
    authorityRefs: AUTHORITIES,
    detail:
      `Estimated §179 expense (TY 2025): $${allowable.toLocaleString()} ` +
      `(qualifying $${qualifying.toLocaleString()}, adjusted limit $${adjustedLimit.toLocaleString()}). ` +
      `Estimate only — election timing, taxable income limit (IRC §179(b)(3)), and asset class not modeled.`,
  };
}
