import { dollarsToCents } from "./money";
import { finalizeResult } from "./result";
import {
  assertPeriodClient, balanceSheetDebtCents, findApprovedSchedule, getPeriod, periodLabel,
} from "./sources";
import type { ReconciliationResult, TolerancePolicy } from "./types";

/**
 * Debt principal tie-out.
 *
 * Control: BS liability lines matching debt/loan/note labels
 * Supporting: approved DEBT_SCHEDULE currentBalance (principal outstanding)
 * Excludes future payment totals and interest.
 */
export function reconcileDebt(opts: {
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
      type: "DEBT",
      controlAmountCents: null,
      supportingAmountCents: null,
      readiness: "NEEDS_DATA",
      issues: ["Period not found."],
      blockingIssues: ["Period not found."],
      policy: opts.policy,
      control: { label: "GL debt", amountCents: null, currency: "USD" },
      supporting: { label: "Debt schedule", amountCents: null, currency: "USD" },
      controlSource: "balance_lines",
      supportingSource: "none",
      sourceRefs: [],
      dataQuality: [],
    });
  }
  const clientErr = assertPeriodClient(period, opts.clientId);
  if (clientErr) blocking.push(clientErr);

  const bs = balanceSheetDebtCents(opts.periodId);
  if (!bs.lines.length) {
    blocking.push("MAPPING_REQUIRED — no debt/loan/note liability lines on the balance sheet.");
  }

  const schedule = findApprovedSchedule({
    clientId: opts.clientId,
    periodId: opts.periodId,
    documentType: "DEBT_SCHEDULE",
  });

  let supportingCents: number | null = null;
  let supportingSource = "none";
  let readiness: ReconciliationResult["readiness"] = "READY";
  const supportingComponents: { label: string; amountCents: number }[] = [];

  if (!schedule) {
    blocking.push("MISSING_SUPPORTING_SCHEDULE — no approved debt schedule for this period.");
    readiness = "NEEDS_DATA";
  } else {
    supportingSource = `source_documents:${schedule.documentId}`;
    if (schedule.periodId && schedule.periodId !== opts.periodId) {
      blocking.push(
        `STALE_SOURCE — debt schedule period does not match ${periodLabel(period)}.`,
      );
      readiness = "STALE_SOURCE";
    } else if (!schedule.periodId) {
      blocking.push("PERIOD_MISMATCH — link the debt schedule to this period.");
      readiness = "PERIOD_MISMATCH";
    }

    const bal = schedule.draft.totals?.currentBalance;
    if (bal == null) {
      blocking.push("INVALID_TOTAL — debt schedule has no currentBalance total.");
      readiness = "NEEDS_DATA";
    } else {
      supportingCents = dollarsToCents(Number(bal));
      for (const li of schedule.draft.lineItems || []) {
        if (li.currentBalance != null) {
          supportingComponents.push({
            label: String(li.lender || "Facility"),
            amountCents: dollarsToCents(Number(li.currentBalance)),
          });
        }
        if (li.currentBalance != null && Number(li.currentBalance) < 0) {
          dataQuality.push(`Negative debt balance: ${li.lender || "row"}`);
        }
      }
    }
  }

  if (period.currency && period.currency !== "USD") {
    blocking.push("CURRENCY_MISMATCH — multi-currency debt recon is not supported in this phase.");
    readiness = "CURRENCY_MISMATCH";
  }

  const controlCents = bs.lines.length ? bs.totalCents : null;

  return finalizeResult({
    type: "DEBT",
    controlAmountCents: controlCents,
    supportingAmountCents: supportingCents,
    readiness: blocking.length ? readiness : "READY",
    issues,
    blockingIssues: blocking,
    policy: opts.policy,
    control: {
      label: "GL / balance sheet debt principal",
      amountCents: controlCents,
      currency: "USD",
      components: bs.lines.map((l) => ({ label: `${l.label} (${l.section})`, amountCents: l.amountCents })),
      notes: [
        "Sum of CURRENT_LIABILITY + LONG_TERM_LIABILITY lines matching debt/loan/note/SBA patterns.",
        "Current vs long-term split is shown in components; classification engine is not applied.",
      ],
    },
    supporting: {
      label: "Debt schedule principal",
      amountCents: supportingCents,
      currency: "USD",
      components: supportingComponents,
      notes: ["Outstanding principal only — not future payments or interest."],
    },
    controlSource: "balance_lines:debt",
    supportingSource,
    sourceRefs: [
      {
        kind: "balance_lines",
        label: "Debt liabilities",
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
        detail: "Approved debt schedule",
      }] : []),
    ],
    dataQuality,
  });
}
