/**
 * Proof-of-concept: Payroll Register draft vs GL / uploaded payroll actuals.
 *
 * Differences create EXCEPTIONS for accountant review — never auto-correct.
 * Amounts in the register fixtures are in dollars; Hathorn ledger stores $K.
 */

import { computePeriod } from "../metrics";
import { getDocument, latestExtraction } from "./model";
import type { StructuredDraft } from "./types";

export type PayrollReconciliation = {
  available: boolean;
  reason?: string;
  registerGross: number | null;
  /** Ledger total payroll in dollars (converted from $K). */
  ledgerPayrollDollars: number | null;
  difference: number | null;
  status: "MATCH" | "NEEDS_REVIEW" | "UNAVAILABLE";
  detail: string;
};

const TOLERANCE = 1; // $1

export function reconcilePayrollRegister(documentId: string): PayrollReconciliation {
  const doc = getDocument(documentId);
  if (!doc) {
    return {
      available: false, reason: "Document not found.",
      registerGross: null, ledgerPayrollDollars: null, difference: null,
      status: "UNAVAILABLE", detail: "Document not found.",
    };
  }
  if (doc.documentType !== "PAYROLL_REGISTER") {
    return {
      available: false, reason: "Not a payroll register.",
      registerGross: null, ledgerPayrollDollars: null, difference: null,
      status: "UNAVAILABLE", detail: "Reconciliation applies to payroll registers only.",
    };
  }
  if (!doc.periodId) {
    return {
      available: false, reason: "No period linked.",
      registerGross: null, ledgerPayrollDollars: null, difference: null,
      status: "UNAVAILABLE", detail: "Link a period to compare against ledger payroll.",
    };
  }

  const draft: StructuredDraft | null =
    doc.reviewedJson || latestExtraction(documentId)?.structuredResult || null;
  const registerGross = draft?.totals?.grossPay ?? null;
  if (registerGross == null) {
    return {
      available: false, reason: "No gross pay extracted.",
      registerGross: null, ledgerPayrollDollars: null, difference: null,
      status: "UNAVAILABLE", detail: "Extracted draft has no gross pay total.",
    };
  }

  let period;
  try {
    period = computePeriod(doc.periodId);
  } catch {
    return {
      available: false, reason: "Period metrics unavailable.",
      registerGross, ledgerPayrollDollars: null, difference: null,
      status: "UNAVAILABLE", detail: "Could not load period payroll.",
    };
  }

  // Ledger stores thousands; convert to dollars for comparison with register.
  const ledgerPayrollDollars = Math.round(period.totalPayroll * 1000 * 100) / 100;
  const difference = Math.round((registerGross - ledgerPayrollDollars) * 100) / 100;
  const match = Math.abs(difference) <= TOLERANCE;

  return {
    available: true,
    registerGross,
    ledgerPayrollDollars,
    difference,
    status: match ? "MATCH" : "NEEDS_REVIEW",
    detail: match
      ? "Payroll register gross agrees with ledger total payroll within $1."
      : `Exception: register $${registerGross.toLocaleString()} vs ledger payroll $${ledgerPayrollDollars.toLocaleString()} (Δ $${difference.toLocaleString()}). Supporting schedule does not override the GL.`,
  };
}
