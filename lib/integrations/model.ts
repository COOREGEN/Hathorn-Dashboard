/**
 * Integration Hub persistence — connections, sync runs, readiness.
 * QBO tokens stay in qbo_connections; hub never returns secrets.
 */

import { config } from "../config";
import { db, uid } from "../db";
import { getConnection as getQboConnection } from "../qbo";
import { computeHealth, sanitizeErrorMessage } from "./health";
import { getProvider, listProviderDefinitions } from "./registry";
import type {
  CapabilityReadiness, ConnectionStatus, HubConnection, ProviderKey,
  SyncRun, SyncRunStatus, SyncType,
} from "./types";

export function integrationHubEnabled(): boolean {
  return config.integrationHub.enabled;
}

function rowConn(r: any): HubConnection {
  const provider = r.provider as ProviderKey;
  // Legacy mock rows must not crash staging when the mock provider is disabled.
  let capabilities: HubConnection["capabilities"] = [];
  let status = r.status as ConnectionStatus;
  let lastErrorCode = r.last_error_code as string | null;
  let lastErrorMessage = r.last_error_message as string | null;
  try {
    capabilities = getProvider(provider).capabilities;
  } catch {
    status = "DISCONNECTED";
    lastErrorCode = lastErrorCode || "PROVIDER_DISABLED";
    lastErrorMessage = lastErrorMessage || "This provider is disabled in this environment.";
  }
  return {
    id: r.id,
    clientId: r.client_id,
    provider,
    externalAccountId: r.external_account_id,
    externalAccountName: r.external_account_name,
    status,
    connectedBy: r.connected_by,
    connectedAt: r.connected_at,
    lastSuccessfulSyncAt: r.last_successful_sync_at,
    lastAttemptedSyncAt: r.last_attempted_sync_at,
    lastErrorCode,
    lastErrorMessage,
    metadata: safeJson(r.metadata_json),
    health: computeHealth({
      status,
      lastSuccessfulSyncAt: r.last_successful_sync_at,
      lastErrorCode,
    }),
    capabilities,
  };
}

function safeJson(s: string | null): Record<string, unknown> {
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}

function rowRun(r: any): SyncRun {
  return {
    id: r.id,
    connectionId: r.connection_id,
    clientId: r.client_id,
    provider: r.provider,
    syncType: r.sync_type,
    status: r.status,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    recordsReceived: r.records_received,
    recordsCreated: r.records_created,
    recordsUpdated: r.records_updated,
    recordsSkipped: r.records_skipped,
    errorCode: r.error_code,
    errorMessage: r.error_message,
    cursorOrCheckpoint: r.cursor_or_checkpoint,
    triggeredBy: r.triggered_by,
    metadata: safeJson(r.metadata_json),
  };
}

/** Ensure file + mock hub rows exist; project QBO from qbo_connections. */
export function ensureClientIntegrations(clientId: string, userId?: string | null) {
  for (const provider of ["file", "mock"] as ProviderKey[]) {
    const exists = db().prepare(
      `SELECT id FROM integration_connections WHERE client_id=? AND provider=?`,
    ).get(clientId, provider);
    if (exists) continue;
    db().prepare(`
      INSERT INTO integration_connections
        (id, client_id, provider, status, connected_by, connected_at, metadata_json)
      VALUES (?,?,?,?,?,?,?)
    `).run(
      uid(), clientId, provider, "CONNECTED",
      userId || null, new Date().toISOString(),
      JSON.stringify({ always_on: true }),
    );
  }
  syncQboHubProjection(clientId);
}

/**
 * Project qbo_connections into the hub row. Never stores tokens here.
 * Does not clobber RECONNECT_REQUIRED / ERROR / SYNCING — those are hub-owned.
 */
export function syncQboHubProjection(clientId: string) {
  const qbo = getQboConnection(clientId);
  const existing: any = db().prepare(
    `SELECT id, status FROM integration_connections WHERE client_id=? AND provider='quickbooks'`,
  ).get(clientId);

  if (!qbo) {
    if (existing) {
      db().prepare(`
        UPDATE integration_connections
        SET status='DISCONNECTED', external_account_id=NULL, external_account_name=NULL,
            last_error_code=NULL, last_error_message=NULL, metadata_json='{}'
        WHERE id=?
      `).run(existing.id);
    } else {
      db().prepare(`
        INSERT INTO integration_connections
          (id, client_id, provider, status, metadata_json)
        VALUES (?,?,?,'DISCONNECTED','{}')
      `).run(uid(), clientId, "quickbooks");
    }
    return;
  }

  const meta = JSON.stringify({ realmId: qbo.realm_id, source: "qbo_connections" });
  const preserveHubStatus = existing && ["RECONNECT_REQUIRED", "ERROR", "SYNCING"].includes(existing.status);
  const nextStatus = preserveHubStatus ? existing.status : "CONNECTED";

  if (existing) {
    db().prepare(`
      UPDATE integration_connections SET
        status=?,
        external_account_id=?,
        external_account_name=?,
        connected_by=COALESCE(connected_by, ?),
        connected_at=COALESCE(connected_at, ?),
        last_successful_sync_at=COALESCE(?, last_successful_sync_at),
        metadata_json=?
      WHERE id=?
    `).run(
      nextStatus,
      qbo.realm_id, `QBO ${qbo.realm_id}`, qbo.connected_by, qbo.connected_at,
      qbo.last_sync_at, meta, existing.id,
    );
  } else {
    db().prepare(`
      INSERT INTO integration_connections
        (id, client_id, provider, external_account_id, external_account_name, status,
         connected_by, connected_at, last_successful_sync_at, metadata_json)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(
      uid(), clientId, "quickbooks", qbo.realm_id, `QBO ${qbo.realm_id}`, "CONNECTED",
      qbo.connected_by, qbo.connected_at, qbo.last_sync_at, meta,
    );
  }
}

/**
 * After legacy `/api/qbo/sync` pulls Intuit once, record durable hub history
 * without calling Intuit again.
 */
export function recordCompletedQboSync(opts: {
  clientId: string;
  triggeredBy: string;
  plLines: number;
  arRows: number;
  periodId: string;
  year: number;
  month: number;
  warnings?: string[];
}) {
  syncQboHubProjection(opts.clientId);
  const connection = getHubConnectionByProvider(opts.clientId, "quickbooks");
  if (!connection || connection.status === "DISCONNECTED") return null;

  const runId = uid();
  const started = new Date().toISOString();
  const completed = started;
  const received = opts.plLines + opts.arRows;
  db().prepare(`
    INSERT INTO integration_sync_runs
      (id, connection_id, client_id, provider, sync_type, status, started_at, completed_at,
       records_received, records_created, records_updated, records_skipped,
       cursor_or_checkpoint, triggered_by, metadata_json)
    VALUES (?,?,?,?,?,'SUCCESS',?,?,?,?,0,0,?,?,?)
  `).run(
    runId, connection.id, opts.clientId, "quickbooks", "MANUAL",
    started, completed, received, received,
    `${opts.year}-${String(opts.month).padStart(2, "0")}`,
    opts.triggeredBy,
    JSON.stringify({
      periodId: opts.periodId,
      plLines: opts.plLines,
      arRows: opts.arRows,
      warnings: opts.warnings || [],
      source: "api/qbo/sync",
    }),
  );
  db().prepare(`
    UPDATE integration_connections SET
      status='CONNECTED', last_successful_sync_at=?, last_attempted_sync_at=?,
      last_error_code=NULL, last_error_message=NULL
    WHERE id=?
  `).run(completed, completed, connection.id);
  return runId;
}

export function listConnections(clientId: string): HubConnection[] {
  ensureClientIntegrations(clientId);
  return db().prepare(
    `SELECT * FROM integration_connections WHERE client_id=? ORDER BY provider`,
  ).all(clientId).map(rowConn);
}

export function getHubConnection(id: string): HubConnection | null {
  const r = db().prepare(`SELECT * FROM integration_connections WHERE id=?`).get(id);
  return r ? rowConn(r) : null;
}

export function getHubConnectionByProvider(clientId: string, provider: ProviderKey): HubConnection | null {
  ensureClientIntegrations(clientId);
  const r = db().prepare(
    `SELECT * FROM integration_connections WHERE client_id=? AND provider=?`,
  ).get(clientId, provider);
  return r ? rowConn(r) : null;
}

export function listSyncRuns(opts: { clientId: string; connectionId?: string; limit?: number }): SyncRun[] {
  const limit = opts.limit ?? 30;
  if (opts.connectionId) {
    return db().prepare(
      `SELECT * FROM integration_sync_runs WHERE connection_id=? ORDER BY started_at DESC LIMIT ?`,
    ).all(opts.connectionId, limit).map(rowRun);
  }
  return db().prepare(
    `SELECT * FROM integration_sync_runs WHERE client_id=? ORDER BY started_at DESC LIMIT ?`,
  ).all(opts.clientId, limit).map(rowRun);
}

/** Syncs older than this are treated as abandoned (crash / killed process). */
export const STALE_SYNC_MS = 15 * 60 * 1000;

/**
 * Reclaim abandoned RUNNING/PENDING syncs and reset SYNCING connections.
 * Called before starting a new sync so a crashed worker cannot block the hub forever.
 */
export function reclaimStaleSyncs(opts?: { connectionId?: string; maxAgeMs?: number }): number {
  const maxAgeMs = opts?.maxAgeMs ?? STALE_SYNC_MS;
  const maxMinutes = Math.max(1, Math.floor(maxAgeMs / 60_000));
  // Compare in SQLite datetime space — ISO strings with "T" sort incorrectly against
  // sqlite's "YYYY-MM-DD HH:MM:SS" and would treat every live run as stale.
  const params: unknown[] = [`-${maxMinutes} minutes`];
  let connClause = "";
  if (opts?.connectionId) {
    connClause = " AND connection_id=?";
    params.push(opts.connectionId);
  }
  const staleRuns = db().prepare(`
    UPDATE integration_sync_runs SET
      status='FAILED',
      completed_at=datetime('now'),
      error_code=COALESCE(error_code, 'STALE_SYNC'),
      error_message=COALESCE(error_message, 'Sync abandoned — exceeded maximum running duration')
    WHERE status IN ('PENDING','RUNNING')
      AND started_at < datetime('now', ?)
      ${connClause}
  `).run(...params);

  // Connections left SYNCING with no live run → ERROR so a retry can start.
  const connParams: unknown[] = [];
  let only = "";
  if (opts?.connectionId) {
    only = " AND id=?";
    connParams.push(opts.connectionId);
  }
  db().prepare(`
    UPDATE integration_connections SET
      status='ERROR',
      last_error_code=COALESCE(last_error_code, 'STALE_SYNC'),
      last_error_message=COALESCE(last_error_message, 'Previous sync did not finish; ready to retry')
    WHERE status='SYNCING'
      AND NOT EXISTS (
        SELECT 1 FROM integration_sync_runs r
        WHERE r.connection_id = integration_connections.id
          AND r.status IN ('PENDING','RUNNING')
      )
      ${only}
  `).run(...connParams);

  return Number(staleRuns.changes || 0);
}

export function findActiveSync(connectionId: string): SyncRun | null {
  reclaimStaleSyncs({ connectionId });
  const r = db().prepare(`
    SELECT * FROM integration_sync_runs
    WHERE connection_id=? AND status IN ('PENDING','RUNNING')
    ORDER BY started_at DESC LIMIT 1
  `).get(connectionId);
  return r ? rowRun(r) : null;
}

export function startSyncRun(opts: {
  connection: HubConnection;
  syncType: SyncType;
  triggeredBy: string;
}): SyncRun {
  const active = findActiveSync(opts.connection.id);
  if (active) throw new Error("SYNC_IN_PROGRESS");

  const id = uid();
  const started = new Date().toISOString();
  db().prepare(`
    INSERT INTO integration_sync_runs
      (id, connection_id, client_id, provider, sync_type, status, started_at, triggered_by)
    VALUES (?,?,?,?,?,'RUNNING',?,?)
  `).run(
    id, opts.connection.id, opts.connection.clientId, opts.connection.provider,
    opts.syncType, started, opts.triggeredBy,
  );
  db().prepare(`
    UPDATE integration_connections
    SET status='SYNCING', last_attempted_sync_at=? WHERE id=?
  `).run(started, opts.connection.id);
  return getRun(id)!;
}

export function getRun(id: string): SyncRun | null {
  const r = db().prepare(`SELECT * FROM integration_sync_runs WHERE id=?`).get(id);
  return r ? rowRun(r) : null;
}

export function completeSyncRun(opts: {
  runId: string;
  connectionId: string;
  status: SyncRunStatus;
  recordsReceived: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  cursor?: string | null;
  metadata?: Record<string, unknown>;
  reconnectRequired?: boolean;
}) {
  const completed = new Date().toISOString();
  db().prepare(`
    UPDATE integration_sync_runs SET
      status=?, completed_at=?, records_received=?, records_created=?,
      records_updated=?, records_skipped=?, error_code=?, error_message=?,
      cursor_or_checkpoint=?, metadata_json=?
    WHERE id=?
  `).run(
    opts.status, completed,
    opts.recordsReceived, opts.recordsCreated, opts.recordsUpdated, opts.recordsSkipped,
    opts.errorCode || null,
    opts.errorMessage ? sanitizeErrorMessage(opts.errorMessage) : null,
    opts.cursor || null,
    JSON.stringify(opts.metadata || {}),
    opts.runId,
  );

  if (opts.status === "SUCCESS" || opts.status === "PARTIAL") {
    db().prepare(`
      UPDATE integration_connections SET
        status=?, last_successful_sync_at=?, last_error_code=NULL, last_error_message=NULL
      WHERE id=?
    `).run(
      opts.status === "PARTIAL" ? "DEGRADED" : "CONNECTED",
      completed, opts.connectionId,
    );
  } else if (opts.reconnectRequired) {
    db().prepare(`
      UPDATE integration_connections SET
        status='RECONNECT_REQUIRED', last_error_code=?, last_error_message=?
      WHERE id=?
    `).run(opts.errorCode || "AUTH", sanitizeErrorMessage(opts.errorMessage || "Reconnect required"), opts.connectionId);
  } else {
    db().prepare(`
      UPDATE integration_connections SET
        status='ERROR', last_error_code=?, last_error_message=?
      WHERE id=?
    `).run(opts.errorCode || "ERROR", sanitizeErrorMessage(opts.errorMessage || "Sync failed"), opts.connectionId);
  }
}

export function capabilityReadiness(clientId: string): Record<string, CapabilityReadiness> {
  ensureClientIntegrations(clientId);
  const conns = listConnections(clientId);
  const out: Record<string, CapabilityReadiness> = {
    PROFIT_AND_LOSS: "NOT_AVAILABLE",
    ACCOUNTS_RECEIVABLE: "NOT_AVAILABLE",
    PAYROLL: "NOT_AVAILABLE",
    FILE_IMPORT: "NOT_AVAILABLE",
  };

  for (const c of conns) {
    for (const cap of c.capabilities) {
      if (c.status === "DISCONNECTED") continue;
      if (c.status === "RECONNECT_REQUIRED" || c.status === "ERROR") {
        out[cap] = "ERROR";
        continue;
      }
      if (c.health === "STALE" || !c.lastSuccessfulSyncAt) out[cap] = "STALE";
      else if (c.health === "DEGRADED") out[cap] = out[cap] === "CURRENT" ? "CURRENT" : "STALE";
      else out[cap] = "CURRENT";
    }
  }

  // Payroll is typically CSV — mark STALE/CURRENT from file provider if imported
  return out;
}

export function hubDashboard(clientId: string) {
  ensureClientIntegrations(clientId);
  const connections = listConnections(clientId);
  const runs = listSyncRuns({ clientId, limit: 20 });
  const counts = {
    connected: connections.filter((c) => c.status !== "DISCONNECTED").length,
    healthy: connections.filter((c) => c.health === "HEALTHY").length,
    needsReconnect: connections.filter((c) => c.health === "RECONNECT_REQUIRED").length,
    failedSyncs: runs.filter((r) => r.status === "FAILED").length,
    stale: connections.filter((c) => c.health === "STALE").length,
  };
  return {
    connections,
    recentRuns: runs,
    counts,
    readiness: capabilityReadiness(clientId),
    providers: listProviderDefinitions(),
  };
}

/** Public connection DTO — strips anything secret-like from metadata. */
export function publicConnection(c: HubConnection) {
  const meta = { ...c.metadata };
  for (const k of Object.keys(meta)) {
    if (/token|secret|password|key|credential/i.test(k)) delete meta[k];
  }
  return { ...c, metadata: meta };
}
