import type { ExceptionSeverity, ExceptionType, ReconciliationResult } from "./types";

export type DerivedException = {
  type: ExceptionType;
  severity: ExceptionSeverity;
  title: string;
  description: string;
};

/** Deterministic exception derivation from a recon result — never AI. */
export function deriveExceptions(result: ReconciliationResult): DerivedException[] {
  const out: DerivedException[] = [];

  for (const issue of result.issues) {
    if (/MISSING_SUPPORTING_SCHEDULE/i.test(issue)) {
      out.push({
        type: "MISSING_SUPPORTING_SCHEDULE",
        severity: "CRITICAL",
        title: "Missing supporting schedule",
        description: issue,
      });
    } else if (/STALE_SOURCE/i.test(issue)) {
      out.push({
        type: "STALE_SOURCE",
        severity: "CRITICAL",
        title: "Stale supporting schedule",
        description: issue,
      });
    } else if (/PERIOD_MISMATCH/i.test(issue)) {
      out.push({
        type: "PERIOD_MISMATCH",
        severity: "CRITICAL",
        title: "Period mismatch",
        description: issue,
      });
    } else if (/MAPPING_REQUIRED/i.test(issue)) {
      out.push({
        type: "MAPPING_REQUIRED",
        severity: "WARNING",
        title: "Mapping required",
        description: issue,
      });
    } else if (/CURRENCY_MISMATCH/i.test(issue)) {
      out.push({
        type: "CURRENCY_MISMATCH",
        severity: "CRITICAL",
        title: "Currency mismatch",
        description: issue,
      });
    } else if (/INVALID_TOTAL/i.test(issue)) {
      out.push({
        type: "INVALID_TOTAL",
        severity: "WARNING",
        title: "Invalid total",
        description: issue,
      });
    } else if (/RECONCILIATION NOT AVAILABLE/i.test(issue)) {
      out.push({
        type: "MISSING_SUPPORTING_SCHEDULE",
        severity: "WARNING",
        title: "Reconciliation not available",
        description: issue,
      });
    }
  }

  for (const q of result.dataQuality) {
    out.push({
      type: /Duplicate/i.test(q) ? "DUPLICATE_SOURCE" : "DATA_QUALITY",
      severity: "WARNING",
      title: "Data quality",
      description: q,
    });
  }

  if (result.status === "EXCEPTION" && result.differenceCents != null) {
    out.push({
      type: "RECONCILIATION_DIFFERENCE",
      severity: "CRITICAL",
      title: "Reconciliation difference outside tolerance",
      description:
        `Control and supporting balances differ by ${result.absoluteDifferenceCents} cents `
        + `(tolerance ${result.toleranceCents} cents).`,
    });
  }

  // Dedupe by type+description
  const seen = new Set<string>();
  return out.filter((e) => {
    const k = `${e.type}:${e.description}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
