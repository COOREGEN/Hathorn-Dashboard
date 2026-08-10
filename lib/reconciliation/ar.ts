import { dollarsToCents } from "./money";
import { finalizeResult } from "./result";
import {
  arBucketsCents, assertPeriodClient, balanceSheetArCents, findApprovedSchedule,
  getPeriod, periodLabel,
} from "./sources";
import type { ReconciliationResult, TolerancePolicy } from "./types";

/**
 * AR aging vs balance-sheet Accounts receivable.
 *
 * Control: BS "Accounts receivable" line(s)
 * Supporting: period ar_buckets total, overridden by approved AR schedule when present & period-matched
 */
export function reconcileAr(opts: {
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
      type: "ACCOUNTS_RECEIVABLE",
      controlAmountCents: null,
      supportingAmountCents: null,
      readiness: "NEEDS_DATA",
      issues: ["Period not found."],
      blockingIssues: ["Period not found."],
      policy: opts.policy,
      control: { label: "GL Accounts receivable", amountCents: null, currency: "USD" },
      supporting: { label: "AR aging", amountCents: null, currency: "USD" },
      controlSource: "balance_lines",
      supportingSource: "none",
      sourceRefs: [],
      dataQuality: [],
    });
  }
  const clientErr = assertPeriodClient(period, opts.clientId);
  if (clientErr) blocking.push(clientErr);

  const bs = balanceSheetArCents(opts.periodId);
  if (!bs.lines.length) {
    blocking.push("MAPPING_REQUIRED — no balance_lines Accounts receivable control for this period.");
  }

  const buckets = arBucketsCents(opts.periodId);
  dataQuality.push(...buckets.quality);

  const schedule = findApprovedSchedule({
    clientId: opts.clientId,
    periodId: opts.periodId,
    documentType: "AR_SCHEDULE",
  });

  let supportingCents: number | null = null;
  let supportingSource = "none";
  let readiness: ReconciliationResult["readiness"] = "READY";
  const supportingComponents: { label: string; amountCents: number }[] = [];

  if (schedule && schedule.periodId === opts.periodId) {
    supportingSource = `source_documents:${schedule.documentId}`;
    const bal = schedule.draft.totals?.balance;
    if (bal == null) {
      blocking.push("INVALID_TOTAL — approved AR schedule has no balance total.");
      readiness = "NEEDS_DATA";
    } else {
      supportingCents = dollarsToCents(Number(bal));
      supportingComponents.push({ label: "AR schedule total", amountCents: supportingCents });
    }
    const seenInv = new Set<string>();
    for (const li of schedule.draft.lineItems || []) {
      const inv = String(li.invoice || "").trim().toLowerCase();
      if (inv && seenInv.has(inv)) dataQuality.push(`Duplicate invoice: ${li.invoice}`);
      if (inv) seenInv.add(inv);
      if (!li.customer && !li.payer) dataQuality.push("AR line missing customer.");
      if (li.balance != null && Number(li.balance) < 0) {
        dataQuality.push(`Negative AR balance: ${li.invoice || li.customer || "row"}`);
      }
    }
  } else if (schedule && schedule.periodId && schedule.periodId !== opts.periodId) {
    blocking.push(
      `STALE_SOURCE — AR schedule is for another period; need ${periodLabel(period)}.`,
    );
    readiness = "STALE_SOURCE";
    supportingSource = `source_documents:${schedule.documentId}`;
  } else if (buckets.rowCount > 0) {
    supportingSource = "ar_buckets";
    supportingCents = buckets.totalCents;
    supportingComponents.push(...buckets.buckets);
  } else {
    blocking.push("MISSING_SUPPORTING_SCHEDULE — no AR aging (ar_buckets or approved AR schedule).");
    readiness = "NEEDS_DATA";
  }

  if (period.currency && period.currency !== "USD") {
    blocking.push("CURRENCY_MISMATCH — multi-currency AR recon is not supported in this phase.");
    readiness = "CURRENCY_MISMATCH";
  }

  const controlCents = bs.lines.length ? bs.totalCents : null;

  return finalizeResult({
    type: "ACCOUNTS_RECEIVABLE",
    controlAmountCents: controlCents,
    supportingAmountCents: supportingCents,
    readiness: blocking.length ? readiness : "READY",
    issues,
    blockingIssues: blocking,
    policy: opts.policy,
    control: {
      label: "GL / balance sheet Accounts receivable",
      amountCents: controlCents,
      currency: "USD",
      components: bs.lines,
      notes: ["Label match on balance_lines CURRENT_ASSET containing “accounts receivable”."],
    },
    supporting: {
      label: supportingSource.startsWith("source_documents")
        ? "Approved AR schedule"
        : "AR aging (ar_buckets)",
      amountCents: supportingCents,
      currency: "USD",
      components: supportingComponents,
      notes: buckets.rowCount
        ? [`Ledger AR aging also present: ${buckets.rowCount} payer row(s).`]
        : undefined,
    },
    controlSource: "balance_lines:Accounts receivable",
    supportingSource,
    sourceRefs: [
      {
        kind: "balance_lines",
        label: "Accounts receivable",
        periodId: opts.periodId,
        periodLabel: periodLabel(period),
        amountCents: controlCents,
      },
      {
        kind: supportingSource.startsWith("source_documents") ? "source_document" : "ar_buckets",
        id: schedule && supportingSource.includes(schedule.documentId) ? schedule.documentId : null,
        label: supportingSource.startsWith("source_documents")
          ? (schedule?.filename || "AR schedule")
          : "Uploaded AR aging",
        periodId: opts.periodId,
        periodLabel: periodLabel(period),
        amountCents: supportingCents,
      },
    ],
    dataQuality,
  });
}
