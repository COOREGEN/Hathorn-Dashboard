import { classifyDifference } from "./tolerance";
import type { ReconciliationResult, TolerancePolicy } from "./types";

export function finalizeResult(
  partial: Omit<ReconciliationResult, "differenceCents" | "absoluteDifferenceCents"
    | "percentageDifference" | "toleranceCents" | "toleranceSource" | "status"> & {
    blockingIssues: string[];
    policy: TolerancePolicy;
  },
): ReconciliationResult {
  const classified = classifyDifference({
    controlAmountCents: partial.controlAmountCents,
    supportingAmountCents: partial.supportingAmountCents,
    policy: partial.policy,
    blockingIssues: partial.blockingIssues,
  });
  const issues = [...partial.blockingIssues, ...partial.issues];
  if (classified.status === "NEEDS_DATA" && !issues.length) {
    issues.push("RECONCILIATION NOT AVAILABLE — missing control or supporting balance.");
  }
  return {
    type: partial.type,
    controlAmountCents: partial.controlAmountCents,
    supportingAmountCents: partial.supportingAmountCents,
    ...classified,
    readiness: partial.readiness,
    issues,
    control: partial.control,
    supporting: partial.supporting,
    controlSource: partial.controlSource,
    supportingSource: partial.supportingSource,
    sourceRefs: partial.sourceRefs,
    dataQuality: partial.dataQuality,
  };
}
