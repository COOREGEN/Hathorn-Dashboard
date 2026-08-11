/**
 * Shared source loaders for reconciliation — read-only against ledger + documents.
 */

import { db } from "../db";
import { getDocument, latestExtraction } from "../documents/model";
import type { StructuredDraft } from "../documents/types";
import { ledgerKToCents } from "./money";

export type PeriodRow = {
  id: string;
  client_id: string;
  year: number;
  month: number;
  currency: string | null;
};

export function getPeriod(periodId: string): PeriodRow | null {
  const r = db().prepare(
    `SELECT id, client_id, year, month, currency FROM periods WHERE id=?`,
  ).get(periodId) as PeriodRow | undefined;
  return r || null;
}

export function periodLabel(p: PeriodRow): string {
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

export function assertPeriodClient(period: PeriodRow, clientId: string): string | null {
  if (period.client_id !== clientId) return "Period does not belong to this client.";
  return null;
}

/** Approved supporting schedule for client+period+type (newest first). */
export function findApprovedSchedule(opts: {
  clientId: string;
  periodId: string;
  documentType: string;
}): { documentId: string; draft: StructuredDraft; periodId: string | null; filename: string } | null {
  const rows: any[] = db().prepare(`
    SELECT id, period_id, original_filename, reviewed_json
    FROM source_documents
    WHERE client_id=? AND document_type=? AND status='APPROVED'
    ORDER BY uploaded_at DESC
  `).all(opts.clientId, opts.documentType);

  // Prefer exact period match
  for (const r of rows) {
    if (r.period_id === opts.periodId) {
      const draft = draftFor(r.id, r.reviewed_json);
      if (draft) {
        return {
          documentId: r.id, draft, periodId: r.period_id, filename: r.original_filename,
        };
      }
    }
  }
  // Fall back to any approved of type (caller may flag STALE)
  for (const r of rows) {
    const draft = draftFor(r.id, r.reviewed_json);
    if (draft) {
      return {
        documentId: r.id, draft, periodId: r.period_id, filename: r.original_filename,
      };
    }
  }
  return null;
}

function draftFor(documentId: string, reviewedJson: string | null): StructuredDraft | null {
  if (reviewedJson) {
    try { return JSON.parse(reviewedJson); } catch { /* fall through */ }
  }
  const ext = latestExtraction(documentId);
  return ext?.structuredResult || null;
}

export function payrollLedgerCents(periodId: string): {
  totalCents: number;
  wagesOtCents: number;
  taxesCents: number;
  workersCompCents: number;
  processingCents: number;
  rowCount: number;
} {
  const rows: any[] = db().prepare(
    `SELECT wages, ot_premium, taxes, workers_comp, processing FROM payroll_lines WHERE period_id=?`,
  ).all(periodId);
  let wagesOt = 0, taxes = 0, wc = 0, proc = 0;
  for (const r of rows) {
    wagesOt += ledgerKToCents(Number(r.wages || 0) + Number(r.ot_premium || 0));
    taxes += ledgerKToCents(Number(r.taxes || 0));
    wc += ledgerKToCents(Number(r.workers_comp || 0));
    proc += ledgerKToCents(Number(r.processing || 0));
  }
  return {
    totalCents: wagesOt + taxes + wc + proc,
    wagesOtCents: wagesOt,
    taxesCents: taxes,
    workersCompCents: wc,
    processingCents: proc,
    rowCount: rows.length,
  };
}

export function arBucketsCents(periodId: string): {
  totalCents: number;
  buckets: { label: string; amountCents: number }[];
  rowCount: number;
  quality: string[];
} {
  const rows: any[] = db().prepare(
    `SELECT payer, b0_30, b31_60, b61_90, b90p FROM ar_buckets WHERE period_id=?`,
  ).all(periodId);
  const quality: string[] = [];
  let b0 = 0, b31 = 0, b61 = 0, b90 = 0;
  const seen = new Set<string>();
  for (const r of rows) {
    const payer = String(r.payer || "").trim().toLowerCase();
    if (!payer) quality.push("AR aging row missing payer.");
    if (payer && seen.has(payer)) quality.push(`Duplicate AR payer: ${r.payer}`);
    if (payer) seen.add(payer);
    b0 += ledgerKToCents(Number(r.b0_30 || 0));
    b31 += ledgerKToCents(Number(r.b31_60 || 0));
    b61 += ledgerKToCents(Number(r.b61_90 || 0));
    b90 += ledgerKToCents(Number(r.b90p || 0));
  }
  return {
    totalCents: b0 + b31 + b61 + b90,
    buckets: [
      { label: "0–30", amountCents: b0 },
      { label: "31–60", amountCents: b31 },
      { label: "61–90", amountCents: b61 },
      { label: "90+", amountCents: b90 },
    ],
    rowCount: rows.length,
    quality,
  };
}

export function balanceSheetArCents(periodId: string): {
  totalCents: number;
  lines: { label: string; amountCents: number }[];
} {
  const rows: any[] = db().prepare(
    `SELECT label, amount FROM balance_lines
     WHERE period_id=? AND section='CURRENT_ASSET'
       AND lower(label) LIKE '%accounts receivable%'`,
  ).all(periodId);
  const lines = rows.map((r) => ({
    label: String(r.label),
    amountCents: ledgerKToCents(Number(r.amount || 0)),
  }));
  return {
    totalCents: lines.reduce((s, l) => s + l.amountCents, 0),
    lines,
  };
}

const DEBT_LABEL = /debt|loan|note|mortgage|line of credit|sba|financing/i;

export function balanceSheetDebtCents(periodId: string): {
  totalCents: number;
  lines: { label: string; section: string; amountCents: number }[];
} {
  const rows: any[] = db().prepare(
    `SELECT label, amount, section FROM balance_lines
     WHERE period_id=? AND section IN ('CURRENT_LIABILITY','LONG_TERM_LIABILITY')`,
  ).all(periodId);
  const lines = rows
    .filter((r) => DEBT_LABEL.test(String(r.label || "")))
    .map((r) => ({
      label: String(r.label),
      section: String(r.section),
      amountCents: ledgerKToCents(Number(r.amount || 0)),
    }));
  return {
    totalCents: lines.reduce((s, l) => s + l.amountCents, 0),
    lines,
  };
}

export function documentDraft(documentId: string): StructuredDraft | null {
  const doc = getDocument(documentId);
  if (!doc) return null;
  return doc.reviewedJson || latestExtraction(documentId)?.structuredResult || null;
}
