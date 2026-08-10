/**
 * Deterministic document summary for advisor review.
 * Only cites values present in the structured draft — never invents totals.
 */

import type { ExtractionRun, SourceDocument, StructuredDraft } from "./types";

export function draftDocumentSummary(
  doc: SourceDocument,
  extraction: ExtractionRun | null,
): string {
  const draft: StructuredDraft | null =
    doc.reviewedJson || extraction?.structuredResult || null;
  if (!draft) {
    return [
      "DOCUMENT SUMMARY",
      `${doc.originalFilename}`,
      "No structured extraction yet. The original file is stored as evidence.",
    ].join("\n");
  }

  const lines: string[] = [
    "DOCUMENT SUMMARY",
    `Type: ${draft.documentType}`,
    `Confidence: ${draft.confidence}`,
    `Source file: ${doc.originalFilename}`,
    "",
  ];

  if (draft.documentType === "PAYROLL_REGISTER") {
    lines.push("Payroll register (extracted draft — not posted):");
    if (draft.totals.grossPay != null) lines.push(`Gross payroll: $${fmt(draft.totals.grossPay)}`);
    if (draft.totals.employerTaxes != null) lines.push(`Employer payroll taxes: $${fmt(draft.totals.employerTaxes)}`);
    if (draft.totals.netPay != null) lines.push(`Net pay: $${fmt(draft.totals.netPay)}`);
    const depts = new Map<string, number>();
    for (const row of draft.lineItems) {
      const d = String(row.department || "");
      const g = typeof row.grossPay === "number" ? row.grossPay : 0;
      if (d) depts.set(d, (depts.get(d) || 0) + g);
    }
    if (depts.size) {
      const top = [...depts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top) lines.push(`Largest department (by gross): ${top[0]} ($${fmt(top[1])})`);
    }
    lines.push("");
    lines.push("The underlying data does not establish period-over-period change unless a prior register is compared.");
  } else if (draft.documentType === "DEBT_SCHEDULE") {
    lines.push("Debt schedule (extracted draft):");
    if (draft.totals.currentBalance != null) {
      lines.push(`Outstanding balance: $${fmt(draft.totals.currentBalance)}`);
    }
    lines.push(`${draft.lineItems.length} instrument line(s) captured.`);
  } else if (draft.documentType === "AR_SCHEDULE" || draft.documentType === "AP_SCHEDULE") {
    lines.push(`${draft.documentType === "AR_SCHEDULE" ? "AR" : "AP"} schedule (extracted draft):`);
    if (draft.totals.balance != null) lines.push(`Total balance: $${fmt(draft.totals.balance)}`);
    lines.push(`${draft.lineItems.length} line(s) captured.`);
  } else {
    lines.push(`Captured ${draft.lineItems.length} line item(s) for review.`);
  }

  if (draft.warnings.length) {
    lines.push("", "Warnings:");
    for (const w of draft.warnings.slice(0, 5)) lines.push(`- ${w}`);
  }

  lines.push("", "AI note: figures above are taken only from the extracted draft. Nothing was posted to the books.");
  return lines.join("\n");
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
