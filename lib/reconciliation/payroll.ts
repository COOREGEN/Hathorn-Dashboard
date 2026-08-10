import { dollarsToCents } from "./money";
import { finalizeResult } from "./result";
import {
  assertPeriodClient, findApprovedSchedule, getPeriod, payrollLedgerCents, periodLabel,
} from "./sources";
import type { ReconciliationResult, TolerancePolicy } from "./types";

/**
 * Payroll employer-cost tie-out.
 *
 * Control: payroll_lines (wages+OT+taxes+workers_comp+processing)
 * Supporting: approved register (grossPay + employerTaxes + benefits)
 * Excludes net pay / employee deductions.
 */
export function reconcilePayroll(opts: {
  clientId: string;
  periodId: string;
  policy: TolerancePolicy;
}): ReconciliationResult {
  const blocking: string[] = [];
  const issues: string[] = [];
  const dataQuality: string[] = [];
  const period = getPeriod(opts.periodId);
  if (!period) {
    return finalizeResult({
      type: "PAYROLL",
      controlAmountCents: null,
      supportingAmountCents: null,
      readiness: "NEEDS_DATA",
      issues: ["Period not found."],
      blockingIssues: ["Period not found."],
      policy: opts.policy,
      control: { label: "Ledger payroll", amountCents: null, currency: "USD" },
      supporting: { label: "Payroll register", amountCents: null, currency: "USD" },
      controlSource: "payroll_lines",
      supportingSource: "none",
      sourceRefs: [],
      dataQuality: [],
    });
  }
  const clientErr = assertPeriodClient(period, opts.clientId);
  if (clientErr) blocking.push(clientErr);

  const ledger = payrollLedgerCents(opts.periodId);
  if (ledger.rowCount === 0) {
    blocking.push("MISSING CONTROL — no payroll_lines for this period.");
  }

  const schedule = findApprovedSchedule({
    clientId: opts.clientId,
    periodId: opts.periodId,
    documentType: "PAYROLL_REGISTER",
  });

  let supportingCents: number | null = null;
  let supportingSource = "none";
  const supportingComponents: { label: string; amountCents: number }[] = [];
  let readiness: ReconciliationResult["readiness"] = "READY";

  if (!schedule) {
    blocking.push("MISSING_SUPPORTING_SCHEDULE — no approved payroll register for this period.");
    readiness = "NEEDS_DATA";
  } else {
    supportingSource = `source_documents:${schedule.documentId}`;
    if (schedule.periodId && schedule.periodId !== opts.periodId) {
      blocking.push(
        `STALE_SOURCE — register period does not match ${periodLabel(period)}.`,
      );
      readiness = "STALE_SOURCE";
    } else if (!schedule.periodId) {
      issues.push("Payroll register has no period link — treat as unverified period match.");
      readiness = "PERIOD_MISMATCH";
      blocking.push("PERIOD_MISMATCH — link the payroll register to this period before relying on the tie-out.");
    }

    const gross = schedule.draft.totals?.grossPay;
    const taxes = schedule.draft.totals?.employerTaxes;
    const benefits = schedule.draft.totals?.benefits;
    if (gross == null) {
      blocking.push("INVALID_TOTAL — register has no gross pay total.");
      readiness = "NEEDS_DATA";
    }
    if (taxes == null || benefits == null) {
      blocking.push(
        "RECONCILIATION NOT AVAILABLE — register must include employer taxes and benefits "
        + "to compare to ledger employer payroll cost (avoid gross-vs-full-payroll nonsense).",
      );
      readiness = "NEEDS_DATA";
    }
    if (gross != null && taxes != null && benefits != null) {
      const g = dollarsToCents(Number(gross));
      const t = dollarsToCents(Number(taxes));
      const b = dollarsToCents(Number(benefits));
      supportingComponents.push(
        { label: "Gross pay", amountCents: g },
        { label: "Employer taxes", amountCents: t },
        { label: "Benefits", amountCents: b },
      );
      supportingCents = g + t + b;
    }

    // Data quality on lines
    const invoices = schedule.draft.lineItems || [];
    const seenEmp = new Set<string>();
    for (const li of invoices) {
      const emp = String(li.employee || "").trim().toLowerCase();
      if (emp && seenEmp.has(emp)) dataQuality.push(`Duplicate employee row: ${li.employee}`);
      if (emp) seenEmp.add(emp);
      if (li.grossPay != null && Number(li.grossPay) < 0) {
        dataQuality.push(`Negative gross pay for ${li.employee || "row"}`);
      }
    }
  }

  if (period.currency && period.currency !== "USD") {
    blocking.push("CURRENCY_MISMATCH — multi-currency payroll recon is not supported in this phase.");
    readiness = "CURRENCY_MISMATCH";
  }

  const controlCents = ledger.rowCount ? ledger.totalCents : null;

  return finalizeResult({
    type: "PAYROLL",
    controlAmountCents: controlCents,
    supportingAmountCents: supportingCents,
    readiness: blocking.length ? readiness : "READY",
    issues,
    blockingIssues: blocking,
    policy: opts.policy,
    control: {
      label: "Ledger payroll employer cost",
      amountCents: controlCents,
      currency: "USD",
      components: [
        { label: "Wages + OT", amountCents: ledger.wagesOtCents },
        { label: "Employer taxes", amountCents: ledger.taxesCents },
        { label: "Workers’ comp", amountCents: ledger.workersCompCents },
        { label: "Processing", amountCents: ledger.processingCents },
      ],
      notes: [
        "Source: payroll_lines for the period ($K → dollars).",
        "Does not include accrued payroll liability (balance sheet stock).",
      ],
    },
    supporting: {
      label: "Payroll register employer cost",
      amountCents: supportingCents,
      currency: "USD",
      components: supportingComponents,
      notes: [
        "Source: approved PAYROLL_REGISTER extraction.",
        "Net pay and employee deductions are excluded.",
      ],
    },
    controlSource: "payroll_lines",
    supportingSource,
    sourceRefs: [
      {
        kind: "payroll_lines",
        label: "Ledger payroll composition",
        periodId: opts.periodId,
        periodLabel: periodLabel(period),
        amountCents: controlCents,
      },
      ...(schedule ? [{
        kind: "source_document",
        id: schedule.documentId,
        label: schedule.filename,
        periodId: schedule.periodId,
        amountCents: supportingCents,
        detail: "Approved payroll register",
      }] : []),
    ],
    dataQuality,
  });
}
