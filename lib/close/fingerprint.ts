/**
 * Deterministic input fingerprints for stale-review detection.
 * When source inputs change, reviewed_hash !== input_hash → STALE.
 */

import { createHash } from "crypto";
import { db } from "../db";

export function hashPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 40);
}

/** Build dependency-scoped fingerprints for a period. */
export function dependencyFingerprints(clientId: string, periodId: string): Record<string, string> {
  const d = db();
  const period: any = d.prepare("SELECT * FROM periods WHERE id=?").get(periodId);

  const pl: any[] = d.prepare(
    `SELECT entity_id, category, label, ROUND(amount, 4) amount FROM pl_lines WHERE period_id=? ORDER BY entity_id, category, label`,
  ).all(periodId);
  const pay: any[] = d.prepare(
    `SELECT entity_id, ROUND(wages,4) wages, ROUND(ot_premium,4) ot, ROUND(hours_paid,4) hours
     FROM payroll_lines WHERE period_id=? ORDER BY entity_id`,
  ).all(periodId);
  const ar: any[] = d.prepare(
    `SELECT payer, ROUND(b0_30,4) a, ROUND(b31_60,4) b, ROUND(b61_90,4) c, ROUND(b90p,4) d
     FROM ar_buckets WHERE period_id=? ORDER BY payer`,
  ).all(periodId);
  const cash: any[] = d.prepare(
    `SELECT ROUND(operating,4) o, ROUND(reserve,4) r FROM cash_balances WHERE period_id=?`,
  ).all(periodId);
  const bal: any[] = d.prepare(
    `SELECT section, label, ROUND(amount,4) amount FROM balance_lines WHERE period_id=? ORDER BY section, label`,
  ).all(periodId);

  const docs = (type: string) => d.prepare(`
    SELECT id, status, sha256, uploaded_at FROM source_documents
    WHERE client_id=? AND period_id=? AND document_type=? AND status='APPROVED'
    ORDER BY id
  `).all(clientId, periodId, type);

  const recon = (type: string) => d.prepare(`
    SELECT id, status, control_amount_cents, supporting_amount_cents, difference_cents, latest_run_id, updated_at
    FROM reconciliations WHERE client_id=? AND period_id=? AND reconciliation_type=?
  `).get(clientId, periodId, type);

  const hub: any = d.prepare(`
    SELECT provider, status, last_successful_sync_at, last_error_code
    FROM integration_connections WHERE client_id=? ORDER BY provider
  `).all(clientId);

  const notes: any[] = d.prepare(
    `SELECT heading, body FROM story_notes WHERE period_id=? AND slot='WHAT_CHANGED' ORDER BY sort, id`,
  ).all(periodId);

  const gate = { gate_pass: period?.gate_pass, gate_detail: period?.gate_detail };

  return {
    ledger: hashPayload(pl),
    payroll: hashPayload(pay),
    ar: hashPayload(ar),
    cash: hashPayload(cash),
    balance: hashPayload(bal),
    doc_payroll: hashPayload(docs("PAYROLL_REGISTER")),
    doc_ar: hashPayload(docs("AR_SCHEDULE")),
    doc_debt: hashPayload(docs("DEBT_SCHEDULE")),
    recon_payroll: hashPayload(recon("PAYROLL") || null),
    recon_ar: hashPayload(recon("ACCOUNTS_RECEIVABLE") || null),
    recon_debt: hashPayload(recon("DEBT") || null),
    integration: hashPayload(hub),
    commentary: hashPayload(notes),
    gate: hashPayload(gate),
  };
}

export function combineDeps(fps: Record<string, string>, tags: string[]): string {
  const picked = tags.map((t) => `${t}:${fps[t] || "empty"}`).sort();
  return hashPayload(picked);
}
