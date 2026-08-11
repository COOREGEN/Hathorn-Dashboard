import { runSec179ExpenseLimit, SEC179_RULE_KEY } from "./sec179-expense";
import type { TaxRuleResult } from "../types";

export { SEC179_RULE_KEY, SEC179_RULE_VERSION } from "./sec179-expense";

export const TAX_RULES = [
  {
    key: SEC179_RULE_KEY,
    label: "IRC §179 expense limitation (TY 2025)",
    taxYears: [2025],
  },
] as const;

export function runTaxRule(opts: {
  ruleKey: string;
  taxYear: number;
  facts: Record<string, string>;
}): TaxRuleResult {
  if (opts.ruleKey === SEC179_RULE_KEY) {
    return runSec179ExpenseLimit({ taxYear: opts.taxYear, facts: opts.facts });
  }
  return {
    ruleKey: opts.ruleKey,
    ruleVersion: "unknown",
    taxYear: opts.taxYear,
    status: "ERROR",
    outputs: {},
    missingFacts: [],
    authorityRefs: [],
    detail: `Unknown rule key: ${opts.ruleKey}`,
  };
}

/** Required fact keys per rule for missing-info UI. */
export function requiredFactsForRule(ruleKey: string): string[] {
  if (ruleKey === SEC179_RULE_KEY) {
    return ["equipment_cost", "placed_in_service", "business_use_pct"];
  }
  return [];
}
