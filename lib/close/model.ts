/**
 * Close run persistence — checklist, events, exception bridge.
 * Never posts journals, never publishes, never mutates releases.
 */

import { config } from "../config";
import { db, uid } from "../db";
import { evaluateCloseCheck } from "./checks";
import { getCheckDef } from "./registry";
import { resolvePolicy, isCheckBlocking } from "./policy";
import { buildSummary, evaluateCloseReadiness } from "./readiness";
import type {
  CheckKey, CloseChecklistItem, CloseRun, CloseRunStatus, CloseSummary,
} from "./types";

export function closeAutomationEnabled(): boolean {
  return config.closeAutomation.enabled;
}

function rowItem(r: any): CloseChecklistItem {
  return {
    id: r.id,
    closeRunId: r.close_run_id,
    checkKey: r.check_key,
    category: r.category,
    title: r.title,
    kind: r.kind,
    required: !!r.required,
    blocking: !!r.blocking,
    status: r.status,
    assignedTo: r.assigned_to,
    dueAt: r.due_at,
    completedBy: r.completed_by,
    completedAt: r.completed_at,
    waivedBy: r.waived_by,
    waivedAt: r.waived_at,
    waiveReason: r.waive_reason,
    note: r.note,
    evidence: JSON.parse(r.evidence_json || "{}"),
    inputHash: r.input_hash,
    reviewedHash: r.reviewed_hash,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    lastEvaluatedAt: r.last_evaluated_at,
    exceptionId: r.exception_id,
  };
}

function overdue(target: string | null, status: CloseRunStatus): boolean {
  if (!target || status === "CLOSED") return false;
  const t = Date.parse(target.includes("T") ? target : target + "T23:59:59Z");
  return Number.isFinite(t) && Date.now() > t;
}

function rowRun(r: any): CloseRun {
  const status = r.status as CloseRunStatus;
  return {
    id: r.id,
    clientId: r.client_id,
    periodId: r.period_id,
    status,
    startedBy: r.started_by,
    startedAt: r.started_at,
    targetCloseDate: r.target_close_date,
    completedAt: r.completed_at,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    releaseId: r.release_id,
    lastEvaluatedAt: r.last_evaluated_at,
    summary: JSON.parse(r.summary_json || "{}") as CloseSummary,
    reopenReason: r.reopen_reason,
    reopenedBy: r.reopened_by,
    reopenedAt: r.reopened_at,
    overdue: overdue(r.target_close_date, status),
  };
}

export function recordCloseEvent(closeRunId: string, eventType: string, detail: string, actorId?: string | null) {
  db().prepare(`
    INSERT INTO close_events (id, close_run_id, event_type, detail, actor_id)
    VALUES (?,?,?,?,?)
  `).run(uid(), closeRunId, eventType, detail, actorId || null);
}

export function listChecklist(closeRunId: string): CloseChecklistItem[] {
  return db().prepare(
    `SELECT * FROM close_checklist_items WHERE close_run_id=? ORDER BY category, title`,
  ).all(closeRunId).map(rowItem);
}

export function getCloseRun(id: string): CloseRun | null {
  const r = db().prepare(`SELECT * FROM close_runs WHERE id=?`).get(id);
  return r ? rowRun(r) : null;
}

export function getCloseRunForPeriod(clientId: string, periodId: string): CloseRun | null {
  const r = db().prepare(
    `SELECT * FROM close_runs WHERE client_id=? AND period_id=?`,
  ).get(clientId, periodId);
  return r ? rowRun(r) : null;
}

function ensureItems(closeRunId: string, clientId: string) {
  const policy = resolvePolicy(clientId);
  for (const key of policy.checkKeys) {
    const def = getCheckDef(key);
    const exists = db().prepare(
      `SELECT id FROM close_checklist_items WHERE close_run_id=? AND check_key=?`,
    ).get(closeRunId, key);
    if (exists) continue;
    db().prepare(`
      INSERT INTO close_checklist_items
        (id, close_run_id, check_key, category, title, kind, required, blocking, status)
      VALUES (?,?,?,?,?,?,1,?, 'PENDING')
    `).run(
      uid(), closeRunId, key, def.category, def.label, def.kind,
      isCheckBlocking(policy, key, def.blockingDefault) ? 1 : 0,
    );
  }
}

export function startOrGetCloseRun(opts: {
  clientId: string;
  periodId: string;
  startedBy: string;
  targetCloseDate?: string | null;
}): CloseRun {
  const period: any = db().prepare(
    `SELECT id, client_id, status FROM periods WHERE id=? AND client_id=?`,
  ).get(opts.periodId, opts.clientId);
  if (!period) throw new Error("Period not found for client.");

  let existing = getCloseRunForPeriod(opts.clientId, opts.periodId);
  if (!existing) {
    const id = uid();
    const now = new Date().toISOString();
    db().prepare(`
      INSERT INTO close_runs
        (id, client_id, period_id, status, started_by, started_at, target_close_date)
      VALUES (?,?,?,?,?,?,?)
    `).run(
      id, opts.clientId, opts.periodId, "IN_PROGRESS",
      opts.startedBy, now, opts.targetCloseDate || null,
    );
    ensureItems(id, opts.clientId);
    recordCloseEvent(id, "CLOSE_STARTED", `period ${opts.periodId}`, opts.startedBy);
    existing = getCloseRun(id)!;
  } else if (opts.targetCloseDate) {
    db().prepare(`UPDATE close_runs SET target_close_date=? WHERE id=?`)
      .run(opts.targetCloseDate, existing.id);
  }
  ensureItems(existing.id, opts.clientId);
  return refreshCloseRun(existing.id, opts.startedBy);
}

function upsertCloseException(opts: {
  clientId: string;
  periodId: string;
  closeRunId: string;
  checkKey: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  blocking: boolean;
  actorId: string;
}): string {
  const existing: any = db().prepare(`
    SELECT id FROM accounting_exceptions
    WHERE client_id=? AND period_id=? AND type=? AND title=?
      AND status IN ('OPEN','ASSIGNED','UNDER_REVIEW')
    LIMIT 1
  `).get(opts.clientId, opts.periodId, opts.type, opts.title);

  if (existing) {
    db().prepare(`
      UPDATE accounting_exceptions SET
        description=?, close_run_id=?, blocking=?, subsystem=?
      WHERE id=?
    `).run(opts.description, opts.closeRunId, opts.blocking ? 1 : 0, opts.checkKey, existing.id);
    return existing.id;
  }

  const id = uid();
  db().prepare(`
    INSERT INTO accounting_exceptions
      (id, client_id, period_id, reconciliation_id, reconciliation_run_id, type, severity,
       title, description, source_refs_json, status, created_by, close_run_id, blocking, subsystem)
    VALUES (?,?,?,NULL,NULL,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, opts.clientId, opts.periodId, opts.type, opts.severity,
    opts.title, opts.description,
    JSON.stringify({ closeCheck: opts.checkKey }),
    "OPEN", opts.actorId, opts.closeRunId, opts.blocking ? 1 : 0, opts.checkKey,
  );
  return id;
}

/** Re-evaluate automated checks; preserve WAIVED; mark STALE when fingerprints drift. */
export function refreshCloseRun(closeRunId: string, actorId?: string): CloseRun {
  const run = getCloseRun(closeRunId);
  if (!run) throw new Error("Close run not found.");
  if (run.status === "CLOSED" && run.releaseId) {
    // Still allow fingerprint watch after close — flag source change without mutating release
    return run;
  }

  const policy = resolvePolicy(run.clientId);
  ensureItems(closeRunId, run.clientId);
  const items = listChecklist(closeRunId);
  const now = new Date().toISOString();

  for (const item of items) {
    if (item.status === "WAIVED") continue;
    if (item.kind === "MANUAL") {
      // Manual stays until completed; only invalidate if somehow hashed
      continue;
    }

    const result = evaluateCloseCheck(item.checkKey as CheckKey, run.clientId, run.periodId, policy);
    let nextStatus = result.status;
    let exceptionId = item.exceptionId;

    // Stale review: human reviewed, inputs changed
    if (
      item.reviewedHash
      && item.reviewedAt
      && result.inputHash
      && item.reviewedHash !== result.inputHash
      && ["PASS", "NEEDS_REVIEW"].includes(item.status)
    ) {
      nextStatus = "STALE";
      recordCloseEvent(closeRunId, "CLOSE_INPUT_CHANGED", `${item.checkKey} inputs changed`, actorId);
    } else if (item.status === "PASS" && item.reviewedHash && item.reviewedHash === result.inputHash) {
      // Keep human-confirmed PASS when hash stable
      nextStatus = "PASS";
    }

    // Auto-pass from evaluator (no prior review needed for pure automated pass)
    if (nextStatus !== "STALE") {
      if (result.status === "PASS" && !item.reviewedHash) nextStatus = "PASS";
      else if (result.status === "PASS" && item.reviewedHash === result.inputHash) nextStatus = "PASS";
      else if (result.status === "NOT_APPLICABLE") nextStatus = "NOT_APPLICABLE";
      else if (result.status === "FAIL") nextStatus = "FAIL";
      else if (result.status === "NEEDS_REVIEW") {
        // If previously reviewed at same hash, keep PASS (reviewed)
        if (item.reviewedHash && item.reviewedHash === result.inputHash) nextStatus = "PASS";
        else nextStatus = "NEEDS_REVIEW";
      }
    }

    if (result.exception && (nextStatus === "FAIL" || nextStatus === "NEEDS_REVIEW" || nextStatus === "STALE")) {
      exceptionId = upsertCloseException({
        clientId: run.clientId,
        periodId: run.periodId,
        closeRunId,
        checkKey: item.checkKey,
        type: result.exception.type,
        severity: result.exception.severity,
        title: result.exception.title,
        description: result.exception.description,
        blocking: result.blocking && nextStatus !== "NEEDS_REVIEW" ? result.blocking : result.blocking,
        actorId: actorId || "system",
      });
    }

    const evidence = { ...result.evidence, detail: result.detail || null };
    db().prepare(`
      UPDATE close_checklist_items SET
        status=?, blocking=?, evidence_json=?, input_hash=?, last_evaluated_at=?, exception_id=?,
        completed_by=CASE WHEN ? IN ('PASS','NOT_APPLICABLE') THEN COALESCE(completed_by, ?) ELSE completed_by END,
        completed_at=CASE WHEN ? IN ('PASS','NOT_APPLICABLE') THEN COALESCE(completed_at, ?) ELSE completed_at END
      WHERE id=?
    `).run(
      nextStatus, result.blocking ? 1 : 0, JSON.stringify(evidence), result.inputHash, now, exceptionId,
      nextStatus, actorId || null,
      nextStatus, now,
      item.id,
    );

    recordCloseEvent(closeRunId, "CLOSE_CHECK_EVALUATED", `${item.checkKey}=${nextStatus}`, actorId);
  }

  return finalizeRunStatus(closeRunId, actorId);
}

function finalizeRunStatus(closeRunId: string, actorId?: string): CloseRun {
  const runRow: any = db().prepare(`SELECT * FROM close_runs WHERE id=?`).get(closeRunId);
  const items = listChecklist(closeRunId);
  const period: any = db().prepare(`SELECT status FROM periods WHERE id=?`).get(runRow.period_id);

  const openEx: any[] = db().prepare(`
    SELECT * FROM accounting_exceptions
    WHERE client_id=? AND period_id=? AND status IN ('OPEN','ASSIGNED','UNDER_REVIEW')
  `).all(runRow.client_id, runRow.period_id);
  const blockingEx = openEx.filter((e) => e.blocking || e.severity === "CRITICAL");

  const readiness = evaluateCloseReadiness({
    items,
    openBlockingExceptions: blockingEx.length,
    periodPublished: period?.status === "PUBLISHED",
    releaseId: runRow.release_id,
    wasReopened: Boolean(runRow.reopened_at) && period?.status !== "PUBLISHED",
  });

  const summary = buildSummary(items, openEx.length, blockingEx.length);
  // Prefer CLOSED only when linked release exists
  let status = readiness.status;
  if (runRow.release_id && period?.status === "PUBLISHED") status = "CLOSED";

  const now = new Date().toISOString();
  db().prepare(`
    UPDATE close_runs SET status=?, summary_json=?, last_evaluated_at=?,
      completed_at=CASE WHEN ?= 'CLOSED' THEN COALESCE(completed_at, ?) ELSE completed_at END
    WHERE id=?
  `).run(status, JSON.stringify(summary), now, status, now, closeRunId);

  if (status === "READY_FOR_REVIEW") {
    recordCloseEvent(closeRunId, "CLOSE_READY_FOR_REVIEW", "all required checks clear of blockers", actorId);
  }

  return getCloseRun(closeRunId)!;
}

export function completeManualCheck(opts: {
  itemId: string;
  userId: string;
  note?: string;
}) {
  const item: any = db().prepare(`SELECT * FROM close_checklist_items WHERE id=?`).get(opts.itemId);
  if (!item) throw new Error("Checklist item not found.");
  if (item.kind !== "MANUAL") throw new Error("Only manual checks can be completed this way.");
  const now = new Date().toISOString();
  db().prepare(`
    UPDATE close_checklist_items SET
      status='PASS', completed_by=?, completed_at=?, note=?,
      reviewed_by=?, reviewed_at=?, reviewed_hash=COALESCE(input_hash, 'manual'),
      last_evaluated_at=?
    WHERE id=?
  `).run(
    opts.userId, now, opts.note || null, opts.userId, now, now, opts.itemId,
  );
  recordCloseEvent(item.close_run_id, "CLOSE_CHECK_COMPLETED", item.check_key, opts.userId);
  return finalizeRunStatus(item.close_run_id, opts.userId);
}

/** Human confirms a NEEDS_REVIEW / STALE automated check after investigation. */
export function reviewCheck(opts: { itemId: string; userId: string; note?: string }) {
  const item: any = db().prepare(`SELECT * FROM close_checklist_items WHERE id=?`).get(opts.itemId);
  if (!item) throw new Error("Checklist item not found.");
  const now = new Date().toISOString();
  db().prepare(`
    UPDATE close_checklist_items SET
      status='PASS', reviewed_by=?, reviewed_at=?, reviewed_hash=input_hash,
      completed_by=?, completed_at=?, note=COALESCE(?, note), last_evaluated_at=?
    WHERE id=?
  `).run(opts.userId, now, opts.userId, now, opts.note || null, now, opts.itemId);
  recordCloseEvent(item.close_run_id, "CLOSE_CHECK_COMPLETED", `${item.check_key} reviewed`, opts.userId);
  return finalizeRunStatus(item.close_run_id, opts.userId);
}

export function waiveCheck(opts: {
  itemId: string;
  userId: string;
  reason: string;
  role: string;
}) {
  if (!["ADMIN", "ADVISOR"].includes(opts.role)) {
    throw new Error("Only ADMIN or ADVISOR may waive blocking close checks.");
  }
  const reason = opts.reason.trim();
  if (reason.length < 8) throw new Error("Waiver reason required (min 8 characters).");
  const item: any = db().prepare(`SELECT * FROM close_checklist_items WHERE id=?`).get(opts.itemId);
  if (!item) throw new Error("Checklist item not found.");
  const now = new Date().toISOString();
  db().prepare(`
    UPDATE close_checklist_items SET
      status='WAIVED', waived_by=?, waived_at=?, waive_reason=?, last_evaluated_at=?
    WHERE id=?
  `).run(opts.userId, now, reason, now, opts.itemId);
  recordCloseEvent(item.close_run_id, "CLOSE_CHECK_WAIVED", `${item.check_key}: ${reason}`, opts.userId);
  return finalizeRunStatus(item.close_run_id, opts.userId);
}

export function linkCloseRunToRelease(periodId: string, releaseId: string, actorId: string) {
  const row: any = db().prepare(`SELECT id FROM close_runs WHERE period_id=?`).get(periodId);
  if (!row) return;
  const now = new Date().toISOString();
  db().prepare(`
    UPDATE close_runs SET release_id=?, status='CLOSED', completed_at=COALESCE(completed_at,?),
      approved_by=?, approved_at=?
    WHERE id=?
  `).run(releaseId, now, actorId, now, row.id);
  recordCloseEvent(row.id, "CLOSE_COMPLETED", `linked release ${releaseId}`, actorId);
}

export function reopenCloseRun(opts: {
  closeRunId: string;
  userId: string;
  role: string;
  reason: string;
}) {
  if (!["ADMIN", "ADVISOR"].includes(opts.role)) {
    throw new Error("Only ADMIN or ADVISOR may reopen a close.");
  }
  const reason = opts.reason.trim();
  if (reason.length < 8) throw new Error("Reopen reason required.");
  const run = getCloseRun(opts.closeRunId);
  if (!run) throw new Error("Close run not found.");
  // Do not mutate published releases — amendment is separate
  const period: any = db().prepare(`SELECT status FROM periods WHERE id=?`).get(run.periodId);
  if (period?.status === "PUBLISHED") {
    throw new Error("Published periods must use the amendment workflow; close reopen is blocked while PUBLISHED.");
  }
  const now = new Date().toISOString();
  db().prepare(`
    UPDATE close_runs SET status='REOPENED', reopen_reason=?, reopened_by=?, reopened_at=?,
      completed_at=NULL, release_id=NULL
    WHERE id=?
  `).run(reason, opts.userId, now, opts.closeRunId);
  recordCloseEvent(opts.closeRunId, "CLOSE_REOPENED", reason, opts.userId);
  return refreshCloseRun(opts.closeRunId, opts.userId);
}

export function listCloseEvents(closeRunId: string, limit = 40) {
  return db().prepare(`
    SELECT * FROM close_events WHERE close_run_id=? ORDER BY created_at DESC LIMIT ?
  `).all(closeRunId, limit).map((r: any) => ({
    id: r.id, eventType: r.event_type, detail: r.detail,
    actorId: r.actor_id, createdAt: r.created_at,
  }));
}

export function firmClosePortfolio(year: number, month: number) {
  const periods: any[] = db().prepare(`
    SELECT p.id period_id, p.client_id, p.year, p.month, p.status period_status, c.name client_name
    FROM periods p JOIN clients c ON c.id=p.client_id
    WHERE p.year=? AND p.month=?
    ORDER BY c.name
  `).all(year, month);

  const rows = periods.map((p) => {
    const run = getCloseRunForPeriod(p.client_id, p.period_id);
    return {
      clientId: p.client_id,
      clientName: p.client_name,
      periodId: p.period_id,
      year: p.year,
      month: p.month,
      periodStatus: p.period_status,
      closeStatus: run?.status || "NOT_STARTED",
      progressPct: run?.summary?.progressPct ?? 0,
      blockers: run?.summary?.blockers || [],
      whyNotClosed: run?.summary?.whyNotClosed || (run ? [] : ["Close not started."]),
      openExceptions: run?.summary?.openExceptions ?? 0,
      blockingExceptions: run?.summary?.blockingExceptions ?? 0,
      overdue: run?.overdue ?? false,
      targetCloseDate: run?.targetCloseDate ?? null,
      closeRunId: run?.id ?? null,
    };
  });

  const counts = {
    total: rows.length,
    closed: rows.filter((r) => r.closeStatus === "CLOSED" || r.periodStatus === "PUBLISHED").length,
    readyForReview: rows.filter((r) => r.closeStatus === "READY_FOR_REVIEW").length,
    readyToPublish: rows.filter((r) => r.closeStatus === "READY_TO_PUBLISH").length,
    inProgress: rows.filter((r) => ["IN_PROGRESS", "REOPENED"].includes(r.closeStatus)).length,
    blocked: rows.filter((r) => r.closeStatus === "BLOCKED").length,
    notStarted: rows.filter((r) => r.closeStatus === "NOT_STARTED").length,
    overdue: rows.filter((r) => r.overdue).length,
  };

  return { year, month, counts, clients: rows };
}

export function listFirmExceptions(opts: {
  clientId?: string;
  periodId?: string;
  severity?: string;
  status?: string;
  assignedTo?: string;
  blocking?: boolean;
  mineUserId?: string;
}) {
  let sql = `
    SELECT e.*, c.name client_name, p.year, p.month
    FROM accounting_exceptions e
    JOIN clients c ON c.id=e.client_id
    LEFT JOIN periods p ON p.id=e.period_id
    WHERE 1=1`;
  const params: any[] = [];
  if (opts.clientId) { sql += ` AND e.client_id=?`; params.push(opts.clientId); }
  if (opts.periodId) { sql += ` AND e.period_id=?`; params.push(opts.periodId); }
  if (opts.severity) { sql += ` AND e.severity=?`; params.push(opts.severity); }
  if (opts.status) { sql += ` AND e.status=?`; params.push(opts.status); }
  if (opts.assignedTo) { sql += ` AND e.assigned_to=?`; params.push(opts.assignedTo); }
  if (opts.mineUserId) { sql += ` AND e.assigned_to=? AND e.status IN ('OPEN','ASSIGNED','UNDER_REVIEW')`; params.push(opts.mineUserId); }
  if (opts.blocking === true) { sql += ` AND (e.blocking=1 OR e.severity='CRITICAL')`; }
  sql += ` ORDER BY e.created_at DESC LIMIT 200`;
  return db().prepare(sql).all(...params).map((r: any) => ({
    id: r.id,
    clientId: r.client_id,
    clientName: r.client_name,
    periodId: r.period_id,
    year: r.year,
    month: r.month,
    type: r.type,
    severity: r.severity,
    title: r.title,
    description: r.description,
    status: r.status,
    assignedTo: r.assigned_to,
    blocking: !!(r.blocking || r.severity === "CRITICAL"),
    subsystem: r.subsystem,
    closeRunId: r.close_run_id,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  }));
}

export function closeBundle(closeRunId: string) {
  const run = getCloseRun(closeRunId);
  if (!run) return null;
  const items = listChecklist(closeRunId);
  const events = listCloseEvents(closeRunId, 50);
  const exceptions = listFirmExceptions({ clientId: run.clientId, periodId: run.periodId });
  const client: any = db().prepare(`SELECT id, name FROM clients WHERE id=?`).get(run.clientId);
  const period: any = db().prepare(`SELECT * FROM periods WHERE id=?`).get(run.periodId);
  return {
    run,
    client,
    period: period ? { id: period.id, year: period.year, month: period.month, status: period.status } : null,
    items,
    exceptions,
    events,
    whyNotClosed: run.summary.whyNotClosed || [],
  };
}
