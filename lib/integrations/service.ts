/**
 * Integration service boundary — syncConnection() is callable without UI.
 */

import { audit } from "../auth";
import { db } from "../db";
import {
  completeSyncRun, getHubConnection, getHubConnectionByProvider,
  listConnections, startSyncRun, syncQboHubProjection,
} from "./model";
import { getProvider } from "./registry";
import type {
  HubConnection, ProviderKey, SyncOutcome, SyncRequest, SyncRun, SyncRunStatus, SyncType,
} from "./types";
import { getRun } from "./model";

export async function syncConnection(opts: {
  connectionId?: string;
  clientId: string;
  provider?: ProviderKey;
  triggeredBy: string;
  syncType?: SyncType;
  year?: number;
  month?: number;
  fullResync?: boolean;
  importPayload?: SyncRequest["importPayload"];
}): Promise<SyncOutcome> {
  let connection: HubConnection | null = null;
  if (opts.connectionId) connection = getHubConnection(opts.connectionId);
  else if (opts.provider) connection = getHubConnectionByProvider(opts.clientId, opts.provider);
  if (!connection || connection.clientId !== opts.clientId) {
    throw new Error("Connection not found for client.");
  }

  if (connection.provider === "quickbooks") syncQboHubProjection(opts.clientId);

  const syncType: SyncType = opts.fullResync ? "FULL" : (opts.syncType || "MANUAL");
  let run;
  try {
    run = startSyncRun({ connection, syncType, triggeredBy: opts.triggeredBy });
  } catch (e: any) {
    if (e?.message === "SYNC_IN_PROGRESS") {
      throw new Error("A sync is already in progress for this connection.");
    }
    throw e;
  }

  audit(opts.triggeredBy, "INTEGRATION_SYNC_STARTED", `${connection.provider} ${run.id}`);

  const provider = getProvider(connection.provider);
  const req: SyncRequest & { _runId: string } = {
    connectionId: connection.id,
    clientId: opts.clientId,
    triggeredBy: opts.triggeredBy,
    syncType,
    year: opts.year,
    month: opts.month,
    fullResync: opts.fullResync,
    importPayload: opts.importPayload,
    _runId: run.id,
  };

  const result = await provider.sync(req, connection);
  const failed = Boolean(result.errorMessage);
  const status: SyncRunStatus = failed
    ? "FAILED"
    : result.partial
      ? "PARTIAL"
      : "SUCCESS";

  completeSyncRun({
    runId: run.id,
    connectionId: connection.id,
    status,
    recordsReceived: result.recordsReceived,
    recordsCreated: result.recordsCreated,
    recordsUpdated: result.recordsUpdated,
    recordsSkipped: result.recordsSkipped,
    errorCode: result.errorCode || null,
    errorMessage: result.errorMessage || null,
    cursor: result.cursor || null,
    metadata: result.summary || {},
    reconnectRequired: result.errorClass === "AUTH",
  });

  // Refresh QBO projection timestamps after sync (preserves RECONNECT_REQUIRED/ERROR)
  if (connection.provider === "quickbooks") syncQboHubProjection(opts.clientId);

  const finalRun: SyncRun = getRun(run.id) || {
    ...run,
    status,
    completedAt: new Date().toISOString(),
    recordsReceived: result.recordsReceived,
    recordsCreated: result.recordsCreated,
    recordsUpdated: result.recordsUpdated,
    recordsSkipped: result.recordsSkipped,
    errorCode: result.errorCode || null,
    errorMessage: result.errorMessage || null,
    cursorOrCheckpoint: result.cursor || null,
    metadata: result.summary || {},
  };

  audit(
    opts.triggeredBy,
    failed ? "INTEGRATION_SYNC_FAILED" : "INTEGRATION_SYNC_COMPLETED",
    `${connection.provider} ${run.id} ${status}`,
  );

  return { run: finalRun, warnings: result.warnings || [], summary: result.summary || {} };
}

export async function disconnectProvider(opts: {
  clientId: string;
  provider: ProviderKey;
  userId: string;
}) {
  const connection = getHubConnectionByProvider(opts.clientId, opts.provider);
  const provider = getProvider(opts.provider);
  if (provider.disconnect) await provider.disconnect(opts.clientId);
  if (connection) {
    db().prepare(`
      UPDATE integration_connections
      SET status='DISCONNECTED', external_account_id=NULL, external_account_name=NULL,
          last_error_code=NULL, last_error_message=NULL
      WHERE id=?
    `).run(connection.id);
  }
  audit(opts.userId, "INTEGRATION_DISCONNECTED", `${opts.provider} ${opts.clientId}`);
}

export function listClientConnections(clientId: string) {
  return listConnections(clientId);
}
