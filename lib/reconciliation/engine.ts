/**
 * Deterministic reconciliation engine — owns status and amounts.
 * Never posts to GL / QBO / releases.
 */

import { reconcilePayroll } from "./payroll";
import { reconcileAr } from "./ar";
import { reconcileDebt } from "./debt";
import type { ReconciliationResult, TolerancePolicy } from "./types";

export { finalizeResult } from "./result";

export function runReconciliationType(opts: {
  type: "PAYROLL" | "ACCOUNTS_RECEIVABLE" | "DEBT";
  clientId: string;
  periodId: string;
  policy: TolerancePolicy;
}): ReconciliationResult {
  switch (opts.type) {
    case "PAYROLL":
      return reconcilePayroll(opts);
    case "ACCOUNTS_RECEIVABLE":
      return reconcileAr(opts);
    case "DEBT":
      return reconcileDebt(opts);
    default:
      throw new Error(`Unsupported reconciliation type: ${opts.type}`);
  }
}
