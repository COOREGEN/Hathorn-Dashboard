/**
 * Operational reconciliation tolerance — not financial statement materiality.
 * AI never decides materiality or tolerance.
 */

import type { ReconciliationResult, TolerancePolicy, ToleranceSource } from "./types";

export function firmDefaultTolerance(type: string): TolerancePolicy {
  switch (type) {
    case "PAYROLL":
      return { absoluteToleranceCents: 100_00, percentageTolerance: null, source: "FIRM_DEFAULT" };
    case "ACCOUNTS_RECEIVABLE":
      return { absoluteToleranceCents: 500_00, percentageTolerance: null, source: "FIRM_DEFAULT" };
    case "DEBT":
      return { absoluteToleranceCents: 100_00, percentageTolerance: null, source: "FIRM_DEFAULT" };
    default:
      return { absoluteToleranceCents: 100_00, percentageTolerance: null, source: "FIRM_DEFAULT" };
  }
}

/** Effective tolerance in cents from absolute and optional % of control. */
export function effectiveToleranceCents(
  policy: TolerancePolicy,
  controlAmountCents: number | null,
): number {
  let tol = Math.max(0, Math.round(policy.absoluteToleranceCents));
  if (
    policy.percentageTolerance != null
    && Number.isFinite(policy.percentageTolerance)
    && controlAmountCents != null
  ) {
    const pct = Math.round(Math.abs(controlAmountCents) * policy.percentageTolerance / 100);
    tol = Math.max(tol, pct);
  }
  return tol;
}

export function classifyDifference(opts: {
  controlAmountCents: number | null;
  supportingAmountCents: number | null;
  policy: TolerancePolicy;
  blockingIssues: string[];
}): Pick<
  ReconciliationResult,
  | "differenceCents"
  | "absoluteDifferenceCents"
  | "percentageDifference"
  | "toleranceCents"
  | "toleranceSource"
  | "status"
> {
  const toleranceCents = effectiveToleranceCents(opts.policy, opts.controlAmountCents);
  const toleranceSource: ToleranceSource = opts.policy.source;

  if (opts.blockingIssues.length || opts.controlAmountCents == null || opts.supportingAmountCents == null) {
    return {
      differenceCents: null,
      absoluteDifferenceCents: null,
      percentageDifference: null,
      toleranceCents,
      toleranceSource,
      status: "NEEDS_DATA",
    };
  }

  const differenceCents = opts.supportingAmountCents - opts.controlAmountCents;
  const absoluteDifferenceCents = Math.abs(differenceCents);
  const percentageDifference = opts.controlAmountCents === 0
    ? (absoluteDifferenceCents === 0 ? 0 : null)
    : (absoluteDifferenceCents / Math.abs(opts.controlAmountCents)) * 100;

  if (absoluteDifferenceCents === 0) {
    return {
      differenceCents, absoluteDifferenceCents, percentageDifference,
      toleranceCents, toleranceSource, status: "MATCHED",
    };
  }
  if (absoluteDifferenceCents <= toleranceCents) {
    return {
      differenceCents, absoluteDifferenceCents, percentageDifference,
      toleranceCents, toleranceSource, status: "WITHIN_TOLERANCE",
    };
  }
  return {
    differenceCents, absoluteDifferenceCents, percentageDifference,
    toleranceCents, toleranceSource, status: "EXCEPTION",
  };
}
