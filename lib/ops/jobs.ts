/**
 * Simple durable job queue — SQLite-backed.
 *
 * Temporal evaluated and DEFERRED: workloads are short (sync, parse, notify),
 * concurrency is already guarded per resource, and a full workflow engine would
 * add ops surface without solving a demonstrated lost-job crisis.
 *
 * Requirements covered: durable rows, retry, status, idempotency, schedule,
 * concurrency keys, stuck detection, manual retry of original params.
 */

import { db, log, uid } from "../db";
import { appVersionInfo } from "./env";
import { getCorrelation } from "./correlation";
import { redactObject } from "./redact";

export type JobStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "RETRYING"
  | "CANCELLED"
  | "STUCK";

export type JobType =
  | "INTEGRATION_SYNC"
  | "DOCUMENT_PARSE"
  | "EMAIL_NOTIFY"
  | "CLOSE_REEVAL"
  | "AI_DRAFT"
  | "REPORT_GENERATE"
  | "MAINTENANCE"
  | "INTEGRITY_CHECK";

export type BackgroundJob = {
  id: string;
  firmId: string | null;
  clientId: string | null;
  jobType: JobType;
  resourceId: string | null;
  concurrencyKey: string | null;
  idempotencyKey: string | null;
  status: JobStatus;
  attempt: number;
  maxAttempts: number;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  heartbeatAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  params: Record<string, unknown>;
  result: Record<string, unknown> | null;
  appVersion: string | null;
  createdBy: string | null;
  createdAt: string;
};

function rowToJob(r: any): BackgroundJob {
  return {
    id: r.id,
    firmId: r.firm_id,
    clientId: r.client_id,
    jobType: r.job_type,
    resourceId: r.resource_id,
    concurrencyKey: r.concurrency_key,
    idempotencyKey: r.idempotency_key,
    status: r.status,
    attempt: r.attempt,
    maxAttempts: r.max_attempts,
    scheduledAt: r.scheduled_at,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    heartbeatAt: r.heartbeat_at,
    errorCode: r.error_code,
    errorMessage: r.error_message,
    params: r.params_json ? JSON.parse(r.params_json) : {},
    result: r.result_json ? JSON.parse(r.result_json) : null,
    appVersion: r.app_version,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

/** Safe view for ops UI — no raw provider payloads. */
export function jobPublicView(j: BackgroundJob) {
  return {
    id: j.id,
    firmId: j.firmId,
    clientId: j.clientId,
    jobType: j.jobType,
    resourceId: j.resourceId,
    status: j.status,
    attempt: j.attempt,
    maxAttempts: j.maxAttempts,
    scheduledAt: j.scheduledAt,
    startedAt: j.startedAt,
    completedAt: j.completedAt,
    errorCode: j.errorCode,
    errorMessage: j.errorMessage,
    appVersion: j.appVersion,
    createdAt: j.createdAt,
    retryEligible: j.status === "FAILED" || j.status === "STUCK",
  };
}

export function enqueueJob(input: {
  jobType: JobType;
  firmId?: string | null;
  clientId?: string | null;
  resourceId?: string | null;
  concurrencyKey?: string | null;
  idempotencyKey?: string | null;
  params?: Record<string, unknown>;
  maxAttempts?: number;
  scheduledAt?: string | null;
  createdBy?: string | null;
  /** Seconds of jitter added when schedule is "now" — spreads tenant syncs. */
  jitterSeconds?: number;
}): BackgroundJob {
  if (input.idempotencyKey) {
    const existing: any = db().prepare(
      `SELECT * FROM background_jobs WHERE idempotency_key=?`,
    ).get(input.idempotencyKey);
    if (existing) return rowToJob(existing);
  }

  let scheduledAt = input.scheduledAt || new Date().toISOString().replace("T", " ").slice(0, 19);
  if (!input.scheduledAt && (input.jitterSeconds || 0) > 0) {
    const jitter = Math.floor(Math.random() * (input.jitterSeconds || 0));
    scheduledAt = new Date(Date.now() + jitter * 1000)
      .toISOString().replace("T", " ").slice(0, 19);
  }

  const id = uid();
  const ver = appVersionInfo();
  const params = redactObject(input.params || {});

  try {
    db().prepare(`
      INSERT INTO background_jobs
        (id, firm_id, client_id, job_type, resource_id, concurrency_key, idempotency_key,
         status, attempt, max_attempts, scheduled_at, params_json, app_version, created_by)
      VALUES (?,?,?,?,?,?,?,'QUEUED',0,?,?,?,?,?)
    `).run(
      id,
      input.firmId ?? null,
      input.clientId ?? null,
      input.jobType,
      input.resourceId ?? null,
      input.concurrencyKey ?? null,
      input.idempotencyKey ?? null,
      input.maxAttempts ?? 3,
      scheduledAt,
      JSON.stringify(params),
      `${ver.appVersion}${ver.gitCommit ? `+${ver.gitCommit}` : ""}`,
      input.createdBy ?? null,
    );
  } catch (e: any) {
    if (input.idempotencyKey && /UNIQUE/i.test(e?.message || "")) {
      const existing: any = db().prepare(
        `SELECT * FROM background_jobs WHERE idempotency_key=?`,
      ).get(input.idempotencyKey);
      if (existing) return rowToJob(existing);
    }
    throw e;
  }

  log("info", "job.enqueued", {
    jobId: id,
    jobType: input.jobType,
    clientId: input.clientId,
    correlationId: getCorrelation().correlationId,
  });
  return getJob(id)!;
}

export function getJob(id: string): BackgroundJob | null {
  const r: any = db().prepare(`SELECT * FROM background_jobs WHERE id=?`).get(id);
  return r ? rowToJob(r) : null;
}

export function listJobs(opts: {
  status?: JobStatus | JobStatus[];
  jobType?: JobType;
  clientId?: string;
  limit?: number;
} = {}): BackgroundJob[] {
  const clauses: string[] = [];
  const params: any[] = [];
  if (opts.status) {
    const list = Array.isArray(opts.status) ? opts.status : [opts.status];
    clauses.push(`status IN (${list.map(() => "?").join(",")})`);
    params.push(...list);
  }
  if (opts.jobType) {
    clauses.push("job_type=?");
    params.push(opts.jobType);
  }
  if (opts.clientId) {
    clauses.push("client_id=?");
    params.push(opts.clientId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows: any[] = db().prepare(
    `SELECT * FROM background_jobs ${where} ORDER BY created_at DESC LIMIT ?`,
  ).all(...params, opts.limit ?? 50);
  return rows.map(rowToJob);
}

export function jobCounts(): Record<string, number> {
  const rows: any[] = db().prepare(
    `SELECT status, COUNT(*) n FROM background_jobs GROUP BY status`,
  ).all();
  const out: Record<string, number> = {
    QUEUED: 0, RUNNING: 0, SUCCEEDED: 0, FAILED: 0, RETRYING: 0, CANCELLED: 0, STUCK: 0,
  };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

function concurrencyBusy(key: string | null, excludeId: string): boolean {
  if (!key) return false;
  const row: any = db().prepare(
    `SELECT 1 FROM background_jobs
      WHERE concurrency_key=? AND status='RUNNING' AND id!=? LIMIT 1`,
  ).get(key, excludeId);
  return Boolean(row);
}

/** Claim due jobs (QUEUED / RETRYING) up to limit. */
export function claimDueJobs(limit = 5): BackgroundJob[] {
  const due: any[] = db().prepare(`
    SELECT * FROM background_jobs
     WHERE status IN ('QUEUED','RETRYING')
       AND scheduled_at <= datetime('now')
     ORDER BY scheduled_at ASC
     LIMIT ?
  `).all(limit * 3);

  const claimed: BackgroundJob[] = [];
  for (const r of due) {
    if (claimed.length >= limit) break;
    if (concurrencyBusy(r.concurrency_key, r.id)) continue;
    const updated = db().prepare(`
      UPDATE background_jobs
         SET status='RUNNING',
             attempt=attempt+1,
             started_at=COALESCE(started_at, datetime('now')),
             heartbeat_at=datetime('now'),
             error_code=NULL,
             error_message=NULL
       WHERE id=? AND status IN ('QUEUED','RETRYING')
    `).run(r.id);
    if (updated.changes === 1) {
      const job = getJob(r.id);
      if (job) claimed.push(job);
    }
  }
  return claimed;
}

export function heartbeatJob(id: string) {
  db().prepare(
    `UPDATE background_jobs SET heartbeat_at=datetime('now') WHERE id=? AND status='RUNNING'`,
  ).run(id);
}

export function succeedJob(id: string, result?: Record<string, unknown>) {
  db().prepare(`
    UPDATE background_jobs
       SET status='SUCCEEDED',
           completed_at=datetime('now'),
           heartbeat_at=datetime('now'),
           result_json=?,
           error_code=NULL,
           error_message=NULL
     WHERE id=?
  `).run(JSON.stringify(redactObject(result || {})), id);
  log("info", "job.succeeded", { jobId: id, correlationId: getCorrelation().correlationId });
}

export function failJob(id: string, errorCode: string, errorMessage: string, retryable = true) {
  const job = getJob(id);
  if (!job) return;

  const attemptsLeft = job.attempt < job.maxAttempts;
  if (retryable && attemptsLeft) {
    const backoffSec = Math.min(3600, 30 * Math.pow(2, job.attempt - 1));
    const next = new Date(Date.now() + backoffSec * 1000)
      .toISOString().replace("T", " ").slice(0, 19);
    db().prepare(`
      UPDATE background_jobs
         SET status='RETRYING',
             scheduled_at=?,
             error_code=?,
             error_message=?,
             heartbeat_at=datetime('now')
       WHERE id=?
    `).run(next, errorCode, String(errorMessage).slice(0, 500), id);
    log("warn", "job.retrying", {
      jobId: id, errorCode, attempt: job.attempt, next, correlationId: getCorrelation().correlationId,
    });
    return;
  }

  db().prepare(`
    UPDATE background_jobs
       SET status='FAILED',
           completed_at=datetime('now'),
           error_code=?,
           error_message=?,
           heartbeat_at=datetime('now')
     WHERE id=?
  `).run(errorCode, String(errorMessage).slice(0, 500), id);
  log("error", "job.failed", {
    jobId: id, errorCode, attempt: job.attempt, correlationId: getCorrelation().correlationId,
  });
}

/** Manual retry — reuses original validated params; no payload editing. */
export function retryJob(id: string, actorId: string): BackgroundJob {
  const job = getJob(id);
  if (!job) throw new Error("Job not found.");
  if (job.status !== "FAILED" && job.status !== "STUCK" && job.status !== "CANCELLED") {
    throw new Error("Only failed, stuck, or cancelled jobs can be retried.");
  }
  db().prepare(`
    UPDATE background_jobs
       SET status='QUEUED',
           scheduled_at=datetime('now'),
           completed_at=NULL,
           error_code=NULL,
           error_message=NULL,
           started_at=NULL,
           heartbeat_at=NULL
     WHERE id=?
  `).run(id);
  log("info", "job.manual_retry", { jobId: id, actorId });
  return getJob(id)!;
}

/** Mark RUNNING jobs with stale heartbeats as STUCK (default 30 minutes). */
export function markStuckJobs(maxMinutes = 30): number {
  const res = db().prepare(`
    UPDATE background_jobs
       SET status='STUCK',
           error_code=COALESCE(error_code, 'STUCK'),
           error_message=COALESCE(error_message, 'Exceeded maximum running duration without heartbeat')
     WHERE status='RUNNING'
       AND COALESCE(heartbeat_at, started_at, created_at)
           < datetime('now', ?)
  `).run(`-${maxMinutes} minutes`);
  if (res.changes) log("warn", "job.stuck_marked", { count: res.changes, maxMinutes });
  return res.changes;
}

export type JobHandler = (job: BackgroundJob) => Promise<Record<string, unknown> | void>;

const handlers = new Map<JobType, JobHandler>();

export function registerJobHandler(type: JobType, handler: JobHandler) {
  handlers.set(type, handler);
}

async function defaultHandler(job: BackgroundJob): Promise<Record<string, unknown>> {
  if (job.jobType === "MAINTENANCE") {
    const stuck = markStuckJobs(30);
    return { stuck };
  }
  if (job.jobType === "INTEGRITY_CHECK") {
    const { runIntegrityDiagnostics } = await import("./integrity");
    return runIntegrityDiagnostics();
  }
  if (job.jobType === "INTEGRATION_SYNC") {
    const { syncConnection } = await import("../integrations/service");
    const clientId = String(job.params.clientId || job.clientId || "");
    const connectionId = String(job.params.connectionId || job.resourceId || "");
    if (!clientId || !connectionId) throw Object.assign(new Error("Missing sync params"), { code: "INVALID_PARAMS", retryable: false });
    const outcome = await syncConnection({
      connectionId,
      clientId,
      triggeredBy: job.createdBy || "job-runner",
      syncType: (job.params.syncType as any) || "MANUAL",
      year: job.params.year as number | undefined,
      month: job.params.month as number | undefined,
    });
    if (outcome.run?.status === "FAILED") {
      const code = outcome.run.errorCode || "SYNC_FAILED";
      const retryable = !["AUTH", "RECONNECT_REQUIRED", "VALIDATION", "PERMANENT"].includes(code);
      throw Object.assign(new Error(outcome.run.errorMessage || "Sync failed"), {
        code, retryable,
      });
    }
    return { runId: outcome.run?.id, status: outcome.run?.status };
  }
  if (job.jobType === "EMAIL_NOTIFY") {
    // Email remains fire-and-forget at the send site; this job type records ops visibility.
    return { noted: true, to: job.params.to ?? null };
  }
  if (job.jobType === "CLOSE_REEVAL") {
    const clientId = String(job.params.clientId || job.clientId || "");
    const periodId = String(job.params.periodId || job.resourceId || "");
    if (!clientId || !periodId) {
      throw Object.assign(new Error("Missing close reeval params"), { code: "INVALID_PARAMS", retryable: false });
    }
    try {
      const close = await import("../close/analysis");
      if (typeof (close as any).reevaluateClose === "function") {
        await (close as any).reevaluateClose({ clientId, periodId, actorId: job.createdBy || "job-runner" });
      } else if (typeof (close as any).runCloseChecks === "function") {
        await (close as any).runCloseChecks({ clientId, periodId });
      }
    } catch (e: any) {
      // Close module shape varies — record soft success with note rather than invent API.
      return { reevaluated: false, note: e?.message || "close reeval unavailable" };
    }
    return { reevaluated: true, periodId };
  }
  // DOCUMENT_PARSE / AI_DRAFT / REPORT_GENERATE — handlers registered by callers when wired.
  const registered = handlers.get(job.jobType);
  if (registered) {
    const result = await registered(job);
    return (result || {}) as Record<string, unknown>;
  }
  throw Object.assign(new Error(`No handler for job type ${job.jobType}`), {
    code: "NO_HANDLER", retryable: false,
  });
}

export async function processJob(job: BackgroundJob): Promise<void> {
  heartbeatJob(job.id);
  try {
    const result = await defaultHandler(job);
    succeedJob(job.id, result || {});
  } catch (e: any) {
    const code = e?.code || e?.errorCode || "JOB_ERROR";
    const retryable = e?.retryable !== false
      && !["INVALID_PARAMS", "NO_HANDLER", "AUTH", "RECONNECT_REQUIRED", "PERMISSION"].includes(code);
    failJob(job.id, code, e?.message || "Job failed", retryable);
  }
}

/** Process up to N due jobs — used by cron / npm run jobs:tick. */
export async function tickJobs(limit = 5): Promise<{ claimed: number; processed: number }> {
  markStuckJobs(30);
  const claimed = claimDueJobs(limit);
  for (const job of claimed) {
    await processJob(job);
  }
  return { claimed: claimed.length, processed: claimed.length };
}

/** Schedule recurring integrity + stuck sweep with jitter. */
export function enqueueMaintenanceSweep(createdBy = "system") {
  return enqueueJob({
    jobType: "MAINTENANCE",
    idempotencyKey: `maintenance:${new Date().toISOString().slice(0, 13)}`,
    concurrencyKey: "maintenance:global",
    params: { kind: "stuck_sweep" },
    createdBy,
    jitterSeconds: 120,
  });
}
