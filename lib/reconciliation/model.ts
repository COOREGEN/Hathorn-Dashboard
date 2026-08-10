/**
 * Reconciliation persistence — runs, exceptions, config, pack summary.
 * Never mutates GL / QBO / releases / FP&A / tax / research.
 */

import { db, uid } from "../db";
import { runReconciliationType } from "./engine";
import { deriveExceptions } from "./exceptions";
import { generateExceptionAnalysis, draftExceptionAnalysis } from "./analysis";
import { firmDefaultTolerance } from "./tolerance";
import { SUBLEDGERS } from "./registry";
import {
  ENGINE_VERSION, RECONCILIATION_TYPES,
  type ExceptionAnalysis, type ExceptionStatus, type ReconciliationRequirement,
  type ReconciliationResult, type ReconciliationStatus, type ReconciliationType,
  type ResolutionCategory, type TolerancePolicy, type ToleranceSource,
} from "./types";

export function reconciliationEnabled(): boolean {
  return !["0", "false", "no", "off", ""].includes(
    String(process.env.RECONCILIATION_ENABLED ?? "1").toLowerCase(),
  );
}

export function ensureClientConfig(clientId: string) {
  for (const type of RECONCILIATION_TYPES) {
    const exists = db().prepare(
      `SELECT id FROM client_reconciliation_config WHERE client_id=? AND reconciliation_type=?`,
    ).get(clientId, type);
    if (exists) continue;
    const def = SUBLEDGERS[type];
    db().prepare(`
      INSERT INTO client_reconciliation_config
        (id, client_id, reconciliation_type, requirement, absolute_tolerance_cents,
         percentage_tolerance, tolerance_source, enabled)
      VALUES (?,?,?,?,?,NULL,'FIRM_DEFAULT',1)
    `).run(
      uid(), clientId, type, def.defaultRequirement, def.defaultAbsoluteToleranceCents,
    );
  }
}

export function getTolerancePolicy(clientId: string, type: ReconciliationType): TolerancePolicy {
  ensureClientConfig(clientId);
  const row: any = db().prepare(`
    SELECT absolute_tolerance_cents, percentage_tolerance, tolerance_source, enabled, requirement
    FROM client_reconciliation_config
    WHERE client_id=? AND reconciliation_type=?
  `).get(clientId, type);
  if (!row || !row.enabled) return firmDefaultTolerance(type);
  return {
    absoluteToleranceCents: Number(row.absolute_tolerance_cents),
    percentageTolerance: row.percentage_tolerance == null ? null : Number(row.percentage_tolerance),
    source: row.tolerance_source as ToleranceSource,
  };
}

export function listClientConfig(clientId: string) {
  ensureClientConfig(clientId);
  return db().prepare(
    `SELECT * FROM client_reconciliation_config WHERE client_id=? ORDER BY reconciliation_type`,
  ).all(clientId).map((r: any) => ({
    type: r.reconciliation_type as ReconciliationType,
    requirement: r.requirement as ReconciliationRequirement,
    absoluteToleranceCents: r.absolute_tolerance_cents,
    percentageTolerance: r.percentage_tolerance,
    toleranceSource: r.tolerance_source,
    enabled: !!r.enabled,
    label: SUBLEDGERS[r.reconciliation_type as ReconciliationType]?.label || r.reconciliation_type,
  }));
}

function rowRecon(r: any) {
  return {
    id: r.id,
    clientId: r.client_id,
    periodId: r.period_id,
    type: r.reconciliation_type as ReconciliationType,
    controlSource: r.control_source,
    supportingSource: r.supporting_source,
    controlAmountCents: r.control_amount_cents,
    supportingAmountCents: r.supporting_amount_cents,
    differenceCents: r.difference_cents,
    absoluteDifferenceCents: r.absolute_difference_cents,
    percentageDifference: r.percentage_difference,
    toleranceCents: r.tolerance_cents,
    toleranceSource: r.tolerance_source as ToleranceSource,
    status: r.status as ReconciliationStatus,
    readiness: r.readiness,
    issues: JSON.parse(r.issues_json || "[]") as string[],
    sourceRefs: JSON.parse(r.source_refs_json || "{}"),
    latestRunId: r.latest_run_id,
    analysis: r.analysis_json ? JSON.parse(r.analysis_json) as ExceptionAnalysis : null,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
  };
}

export function listReconciliations(clientId: string, periodId?: string | null) {
  if (periodId) {
    return db().prepare(
      `SELECT * FROM reconciliations WHERE client_id=? AND period_id=? ORDER BY reconciliation_type`,
    ).all(clientId, periodId).map(rowRecon);
  }
  return db().prepare(
    `SELECT * FROM reconciliations WHERE client_id=? ORDER BY updated_at DESC LIMIT 100`,
  ).all(clientId).map(rowRecon);
}

export function getReconciliation(id: string) {
  const r = db().prepare(`SELECT * FROM reconciliations WHERE id=?`).get(id);
  return r ? rowRecon(r) : null;
}

export function listRuns(reconciliationId: string) {
  return db().prepare(
    `SELECT * FROM reconciliation_runs WHERE reconciliation_id=? ORDER BY created_at DESC`,
  ).all(reconciliationId).map((r: any) => ({
    id: r.id,
    reconciliationId: r.reconciliation_id,
    controlSnapshot: JSON.parse(r.control_snapshot),
    supportingSnapshot: JSON.parse(r.supporting_snapshot),
    differenceCents: r.difference_cents,
    status: r.status,
    readiness: r.readiness,
    issues: JSON.parse(r.issues_json || "[]"),
    sourceRefs: JSON.parse(r.source_refs_json || "{}"),
    engineVersion: r.engine_version,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));
}

export function listExceptions(opts: { clientId: string; periodId?: string | null; reconciliationId?: string | null }) {
  let sql = `SELECT * FROM accounting_exceptions WHERE client_id=?`;
  const params: any[] = [opts.clientId];
  if (opts.periodId) { sql += ` AND period_id=?`; params.push(opts.periodId); }
  if (opts.reconciliationId) { sql += ` AND reconciliation_id=?`; params.push(opts.reconciliationId); }
  sql += ` ORDER BY created_at DESC`;
  return db().prepare(sql).all(...params).map((r: any) => ({
    id: r.id,
    clientId: r.client_id,
    periodId: r.period_id,
    reconciliationId: r.reconciliation_id,
    reconciliationRunId: r.reconciliation_run_id,
    type: r.type,
    severity: r.severity,
    title: r.title,
    description: r.description,
    sourceRefs: JSON.parse(r.source_refs_json || "{}"),
    status: r.status as ExceptionStatus,
    assignedTo: r.assigned_to,
    createdBy: r.created_by,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
    resolvedBy: r.resolved_by,
    resolutionNote: r.resolution_note,
    resolutionCategory: r.resolution_category,
    acceptedDifferenceCents: r.accepted_difference_cents,
  }));
}

function persistResult(opts: {
  clientId: string;
  periodId: string;
  type: ReconciliationType;
  result: ReconciliationResult;
  createdBy: string;
}) {
  const existing: any = db().prepare(`
    SELECT id FROM reconciliations
    WHERE client_id=? AND period_id=? AND reconciliation_type=?
  `).get(opts.clientId, opts.periodId, opts.type);

  const reconId = existing?.id || uid();
  const now = new Date().toISOString();
  const runId = uid();

  db().prepare(`
    INSERT INTO reconciliation_runs
      (id, reconciliation_id, control_snapshot, supporting_snapshot, difference_cents,
       status, readiness, issues_json, source_refs_json, engine_version, created_by, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    runId, reconId,
    JSON.stringify(opts.result.control),
    JSON.stringify(opts.result.supporting),
    opts.result.differenceCents,
    opts.result.status,
    opts.result.readiness,
    JSON.stringify(opts.result.issues),
    JSON.stringify(opts.result.sourceRefs),
    ENGINE_VERSION,
    opts.createdBy,
    now,
  );

  if (existing) {
    db().prepare(`
      UPDATE reconciliations SET
        control_source=?, supporting_source=?,
        control_amount_cents=?, supporting_amount_cents=?,
        difference_cents=?, absolute_difference_cents=?, percentage_difference=?,
        tolerance_cents=?, tolerance_source=?, status=?, readiness=?,
        issues_json=?, source_refs_json=?, latest_run_id=?, updated_at=?,
        reviewed_by=NULL, reviewed_at=NULL, analysis_json=NULL
      WHERE id=?
    `).run(
      opts.result.controlSource, opts.result.supportingSource,
      opts.result.controlAmountCents, opts.result.supportingAmountCents,
      opts.result.differenceCents, opts.result.absoluteDifferenceCents,
      opts.result.percentageDifference,
      opts.result.toleranceCents, opts.result.toleranceSource,
      opts.result.status, opts.result.readiness,
      JSON.stringify(opts.result.issues),
      JSON.stringify(opts.result.sourceRefs),
      runId, now, reconId,
    );
  } else {
    db().prepare(`
      INSERT INTO reconciliations
        (id, client_id, period_id, reconciliation_type, control_source, supporting_source,
         control_amount_cents, supporting_amount_cents, difference_cents, absolute_difference_cents,
         percentage_difference, tolerance_cents, tolerance_source, status, readiness,
         issues_json, source_refs_json, latest_run_id, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      reconId, opts.clientId, opts.periodId, opts.type,
      opts.result.controlSource, opts.result.supportingSource,
      opts.result.controlAmountCents, opts.result.supportingAmountCents,
      opts.result.differenceCents, opts.result.absoluteDifferenceCents,
      opts.result.percentageDifference,
      opts.result.toleranceCents, opts.result.toleranceSource,
      opts.result.status, opts.result.readiness,
      JSON.stringify(opts.result.issues),
      JSON.stringify(opts.result.sourceRefs),
      runId, opts.createdBy, now, now,
    );
  }

  // Close prior open exceptions for this recon, then create fresh from this run
  db().prepare(`
    UPDATE accounting_exceptions
    SET status='RESOLVED', resolved_at=?, resolved_by=?, resolution_note=?, resolution_category='OTHER'
    WHERE reconciliation_id=? AND status IN ('OPEN','ASSIGNED','UNDER_REVIEW')
  `).run(now, opts.createdBy, "Superseded by new reconciliation run.", reconId);

  const derived = deriveExceptions(opts.result);
  for (const ex of derived) {
    db().prepare(`
      INSERT INTO accounting_exceptions
        (id, client_id, period_id, reconciliation_id, reconciliation_run_id, type, severity,
         title, description, source_refs_json, status, created_by, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?, 'OPEN', ?, ?)
    `).run(
      uid(), opts.clientId, opts.periodId, reconId, runId,
      ex.type, ex.severity, ex.title, ex.description,
      JSON.stringify(opts.result.sourceRefs),
      opts.createdBy, now,
    );
  }

  return { reconciliationId: reconId, runId, result: opts.result };
}

export function runOne(opts: {
  clientId: string;
  periodId: string;
  type: ReconciliationType;
  createdBy: string;
}) {
  const period: any = db().prepare(
    `SELECT id, client_id FROM periods WHERE id=?`,
  ).get(opts.periodId);
  if (!period || period.client_id !== opts.clientId) {
    throw new Error("Period not found for client.");
  }
  const policy = getTolerancePolicy(opts.clientId, opts.type);
  const result = runReconciliationType({
    type: opts.type,
    clientId: opts.clientId,
    periodId: opts.periodId,
    policy,
  });
  return persistResult({
    clientId: opts.clientId,
    periodId: opts.periodId,
    type: opts.type,
    result,
    createdBy: opts.createdBy,
  });
}

export function runPack(opts: {
  clientId: string;
  periodId: string;
  createdBy: string;
  types?: ReconciliationType[];
}) {
  ensureClientConfig(opts.clientId);
  const cfg = listClientConfig(opts.clientId);
  const types = opts.types || cfg
    .filter((c) => c.enabled && c.requirement !== "NOT_APPLICABLE")
    .map((c) => c.type);
  const results = [];
  for (const type of types) {
    results.push(runOne({
      clientId: opts.clientId,
      periodId: opts.periodId,
      type,
      createdBy: opts.createdBy,
    }));
  }
  return results;
}

export function packSummary(clientId: string, periodId: string) {
  const rows = listReconciliations(clientId, periodId);
  const cfg = listClientConfig(clientId);
  const counts = {
    matched: rows.filter((r) => r.status === "MATCHED").length,
    withinTolerance: rows.filter((r) => r.status === "WITHIN_TOLERANCE").length,
    exceptions: rows.filter((r) => r.status === "EXCEPTION").length,
    needsData: rows.filter((r) => r.status === "NEEDS_DATA").length,
    underReview: rows.filter((r) => r.status === "UNDER_REVIEW").length,
    resolved: rows.filter((r) => r.status === "RESOLVED").length,
  };
  const openExceptions = listExceptions({ clientId, periodId })
    .filter((e) => ["OPEN", "ASSIGNED", "UNDER_REVIEW"].includes(e.status));
  const required = cfg.filter((c) => c.requirement === "REQUIRED" && c.enabled);
  const requiredComplete = required.every((c) => {
    const row = rows.find((r) => r.type === c.type);
    return row && ["MATCHED", "WITHIN_TOLERANCE", "RESOLVED"].includes(row.status);
  });
  const criticalOpen = openExceptions.some((e) => e.severity === "CRITICAL");
  return {
    counts,
    openExceptionCount: openExceptions.length,
    requiredComplete,
    criticalExceptions: criticalOpen,
    readiness: {
      allRequiredComplete: requiredComplete,
      criticalExceptions: criticalOpen,
    },
    rows,
    config: cfg,
    definitions: Object.values(SUBLEDGERS),
  };
}

export async function analyzeReconciliation(id: string) {
  const recon = getReconciliation(id);
  if (!recon) throw new Error("Reconciliation not found.");
  const runs = listRuns(id);
  const latest = runs[0];
  if (!latest) throw new Error("No runs to analyze.");

  // Rebuild a ReconciliationResult-shaped object from persisted data
  const result: ReconciliationResult = {
    type: recon.type,
    controlAmountCents: recon.controlAmountCents,
    supportingAmountCents: recon.supportingAmountCents,
    differenceCents: recon.differenceCents,
    absoluteDifferenceCents: recon.absoluteDifferenceCents,
    percentageDifference: recon.percentageDifference,
    toleranceCents: recon.toleranceCents,
    toleranceSource: recon.toleranceSource,
    status: (["MATCHED", "WITHIN_TOLERANCE", "EXCEPTION", "NEEDS_DATA"].includes(recon.status)
      ? recon.status
      : "NEEDS_DATA") as ReconciliationResult["status"],
    readiness: recon.readiness as any,
    issues: recon.issues,
    control: latest.controlSnapshot,
    supporting: latest.supportingSnapshot,
    controlSource: recon.controlSource,
    supportingSource: recon.supportingSource,
    sourceRefs: Array.isArray(recon.sourceRefs) ? recon.sourceRefs : [],
    dataQuality: recon.issues.filter((i) => /Duplicate|Negative|missing/i.test(i)),
  };

  const analysis = await generateExceptionAnalysis(result);
  // Guard: AI cannot mutate locked amounts
  analysis.locked = {
    controlAmountCents: recon.controlAmountCents,
    supportingAmountCents: recon.supportingAmountCents,
    differenceCents: recon.differenceCents,
    status: recon.status,
  };
  db().prepare(
    `UPDATE reconciliations SET analysis_json=?, updated_at=? WHERE id=?`,
  ).run(JSON.stringify(analysis), new Date().toISOString(), id);
  return analysis;
}

export function assignException(exceptionId: string, assigneeId: string | null) {
  const ex: any = db().prepare(`SELECT * FROM accounting_exceptions WHERE id=?`).get(exceptionId);
  if (!ex) throw new Error("Exception not found.");
  db().prepare(`
    UPDATE accounting_exceptions SET assigned_to=?, status=? WHERE id=?
  `).run(
    assigneeId,
    assigneeId ? "ASSIGNED" : "OPEN",
    exceptionId,
  );
  if (ex.reconciliation_id) {
    db().prepare(
      `UPDATE reconciliations SET status='UNDER_REVIEW', updated_at=? WHERE id=?`,
    ).run(new Date().toISOString(), ex.reconciliation_id);
  }
  return listExceptions({ clientId: ex.client_id, reconciliationId: ex.reconciliation_id })
    .find((e) => e.id === exceptionId);
}

export function resolveException(opts: {
  exceptionId: string;
  resolvedBy: string;
  resolutionNote: string;
  resolutionCategory: ResolutionCategory;
  acceptDifference?: boolean;
}) {
  const note = opts.resolutionNote.trim();
  if (note.length < 8) throw new Error("resolution_note is required (min 8 characters).");
  const ex: any = db().prepare(`SELECT * FROM accounting_exceptions WHERE id=?`).get(opts.exceptionId);
  if (!ex) throw new Error("Exception not found.");
  const now = new Date().toISOString();
  const accepted = opts.acceptDifference
    ? (db().prepare(
      `SELECT absolute_difference_cents FROM reconciliations WHERE id=?`,
    ).get(ex.reconciliation_id) as any)?.absolute_difference_cents ?? null
    : null;

  db().prepare(`
    UPDATE accounting_exceptions SET
      status='RESOLVED', resolved_at=?, resolved_by=?, resolution_note=?,
      resolution_category=?, accepted_difference_cents=?
    WHERE id=?
  `).run(
    now, opts.resolvedBy, note, opts.resolutionCategory, accepted, opts.exceptionId,
  );

  if (ex.reconciliation_id) {
    const open = db().prepare(`
      SELECT COUNT(*) n FROM accounting_exceptions
      WHERE reconciliation_id=? AND status IN ('OPEN','ASSIGNED','UNDER_REVIEW')
    `).get(ex.reconciliation_id) as any;
    if (open.n === 0) {
      // Do not rewrite MATCHED — mark RESOLVED while historical run status remains on runs table
      db().prepare(`
        UPDATE reconciliations SET status='RESOLVED', reviewed_by=?, reviewed_at=?, updated_at=?
        WHERE id=?
      `).run(opts.resolvedBy, now, now, ex.reconciliation_id);
    }
  }
  return listExceptions({ clientId: ex.client_id }).find((e) => e.id === opts.exceptionId);
}

export function reconciliationBundle(id: string) {
  const reconciliation = getReconciliation(id);
  if (!reconciliation) return null;
  return {
    reconciliation,
    runs: listRuns(id),
    exceptions: listExceptions({
      clientId: reconciliation.clientId,
      reconciliationId: id,
    }),
    definition: SUBLEDGERS[reconciliation.type],
    analysis: reconciliation.analysis || draftExceptionAnalysis({
      type: reconciliation.type,
      controlAmountCents: reconciliation.controlAmountCents,
      supportingAmountCents: reconciliation.supportingAmountCents,
      differenceCents: reconciliation.differenceCents,
      absoluteDifferenceCents: reconciliation.absoluteDifferenceCents,
      percentageDifference: reconciliation.percentageDifference,
      toleranceCents: reconciliation.toleranceCents,
      toleranceSource: reconciliation.toleranceSource,
      status: (["MATCHED", "WITHIN_TOLERANCE", "EXCEPTION", "NEEDS_DATA"].includes(reconciliation.status)
        ? reconciliation.status : "NEEDS_DATA") as any,
      readiness: reconciliation.readiness as any,
      issues: reconciliation.issues,
      control: listRuns(id)[0]?.controlSnapshot || { label: "Control", amountCents: null, currency: "USD" },
      supporting: listRuns(id)[0]?.supportingSnapshot || { label: "Supporting", amountCents: null, currency: "USD" },
      controlSource: reconciliation.controlSource,
      supportingSource: reconciliation.supportingSource,
      sourceRefs: Array.isArray(reconciliation.sourceRefs) ? reconciliation.sourceRefs : [],
      dataQuality: [],
    }),
  };
}

/** Fingerprint proving recon does not mutate books / adjacent domains. */
export function accountingFingerprint(clientId: string) {
  const d = db();
  const periods = (d.prepare("SELECT COUNT(*) n FROM periods WHERE client_id=?").get(clientId) as any).n;
  const pl = (d.prepare(
    `SELECT COUNT(*) n FROM pl_lines WHERE period_id IN (SELECT id FROM periods WHERE client_id=?)`,
  ).get(clientId) as any).n;
  const payroll = (d.prepare(
    `SELECT COUNT(*) n FROM payroll_lines WHERE period_id IN (SELECT id FROM periods WHERE client_id=?)`,
  ).get(clientId) as any).n;
  const releases = (d.prepare(
    `SELECT COUNT(*) n, COALESCE(SUM(length(snapshot)),0) bytes FROM release_records WHERE client_id=?`,
  ).get(clientId) as any);
  const fpa = (d.prepare("SELECT COUNT(*) n FROM fpa_model_runs WHERE client_id=?").get(clientId) as any).n;
  const tax = (d.prepare("SELECT COUNT(*) n FROM tax_issues WHERE client_id=?").get(clientId) as any).n;
  const research = (d.prepare(
    "SELECT COUNT(*) n FROM accounting_research_issues WHERE client_id=?",
  ).get(clientId) as any).n;
  const approvedDocs = (d.prepare(
    `SELECT COUNT(*) n FROM source_documents WHERE client_id=? AND status='APPROVED'`,
  ).get(clientId) as any).n;
  return {
    periods, pl, payroll,
    releaseCount: releases.n, releaseBytes: releases.bytes,
    fpaRuns: fpa, taxIssues: tax, researchIssues: research, approvedDocs,
  };
}
