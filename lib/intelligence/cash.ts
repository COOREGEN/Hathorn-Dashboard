/**
 * Cash intelligence — transparent burn/runway with labeled basis.
 * Runway only when normalized burn > 0. Never nonsense for cash-generating firms.
 */

import type { PeriodMetrics } from "../metrics";
import { mean, r1 } from "./calc";
import type { CashIntelligence } from "./types";

export function cashIntelligence(
  history: PeriodMetrics[],
  periodId: string,
  burnBasis: "1m" | "3m_avg" | "6m_avg" = "3m_avg",
): CashIntelligence {
  const idx = history.findIndex((p) => p.periodId === periodId);
  const cur = idx >= 0 ? history[idx] : null;
  const prior = idx > 0 ? history[idx - 1] : null;
  if (!cur) {
    return {
      currentCash: 0, priorCash: null, cashChange: null,
      monthlyGeneration: null, trailingBurn3m: null, trailingBurn6m: null,
      burnBasis: "none", monthlyBurnUsed: null, runwayMonths: null,
      runwayApplicable: false,
      runwayReason: "No period selected.",
      method: "Ending cash from cash_balances via metrics engine.",
    };
  }

  const changes: number[] = [];
  for (let i = 1; i <= idx; i++) {
    changes.push(history[i].cash.total - history[i - 1].cash.total);
  }
  const last3 = changes.slice(-3);
  const last6 = changes.slice(-6);
  const avg3 = last3.length ? mean(last3) : null;
  const avg6 = last6.length ? mean(last6) : null;
  const oneMonth = prior ? cur.cash.total - prior.cash.total : null;

  let monthlyBurnUsed: number | null = null;
  if (burnBasis === "1m" && oneMonth != null) monthlyBurnUsed = -oneMonth;
  else if (burnBasis === "6m_avg" && avg6 != null) monthlyBurnUsed = -avg6;
  else if (avg3 != null) {
    monthlyBurnUsed = -avg3;
    burnBasis = "3m_avg";
  } else if (oneMonth != null) {
    monthlyBurnUsed = -oneMonth;
    burnBasis = "1m";
  }

  const cashChange = prior ? r1(cur.cash.total - prior.cash.total) : null;
  const generation = cashChange != null && cashChange > 0 ? cashChange : null;

  // Burn is positive when cash is declining on the chosen basis
  const burn = monthlyBurnUsed != null && monthlyBurnUsed > 0 ? r1(monthlyBurnUsed) : null;
  let runwayMonths: number | null = null;
  let runwayApplicable = false;
  let runwayReason = "";

  if (burn == null || burn <= 0) {
    runwayApplicable = false;
    runwayReason = burnBasis === "none"
      ? "Insufficient cash history."
      : "Normalized cash flow is not a burn (firm is cash-generative or flat on the chosen basis). Runway is not applicable.";
  } else if (cur.cash.total <= 0) {
    runwayApplicable = true;
    runwayMonths = 0;
    runwayReason = `Cash is non-positive. Burn basis: ${burnBasis}.`;
  } else {
    runwayApplicable = true;
    runwayMonths = r1(cur.cash.total / burn);
    runwayReason =
      `Runway = ending cash ÷ monthly burn. Burn basis: ${burnBasis} ` +
      `(average cash decline; one unusual month is not silently used when averages exist).`;
  }

  return {
    currentCash: r1(cur.cash.total),
    priorCash: prior ? r1(prior.cash.total) : null,
    cashChange,
    monthlyGeneration: generation,
    trailingBurn3m: avg3 != null && avg3 < 0 ? r1(-avg3) : avg3 != null ? 0 : null,
    trailingBurn6m: avg6 != null && avg6 < 0 ? r1(-avg6) : avg6 != null ? 0 : null,
    burnBasis: monthlyBurnUsed == null ? "none" : burnBasis,
    monthlyBurnUsed: burn,
    runwayMonths,
    runwayApplicable,
    runwayReason,
    method: "Ending cash from metrics; burn from period-to-period cash change averages.",
  };
}
