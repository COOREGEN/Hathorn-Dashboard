/**
 * FILE_IMPORT provider — first-class CSV/Excel ingestion under the hub.
 * Reuses existing close-upload / document paths; records sync history + provenance.
 */

import { db, uid } from "../../db";
import { upsertCanonicalRecord, upsertRawRecord } from "../staging";
import type { HubConnection, IntegrationProvider, SyncRequest } from "../types";

export const fileProvider: IntegrationProvider = {
  key: "file",
  name: "CSV / Excel",
  capabilities: ["FILE_IMPORT", "PROFIT_AND_LOSS", "ACCOUNTS_RECEIVABLE", "PAYROLL"],
  isConfigured() {
    return true;
  },
  async getConnectionHealth(clientId) {
    const row: any = db().prepare(
      `SELECT last_successful_sync_at, status FROM integration_connections
       WHERE client_id=? AND provider='file'`,
    ).get(clientId);
    if (!row || row.status === "DISCONNECTED") {
      return { status: "CONNECTED", health: "STALE", detail: "File import available — no imports recorded yet." };
    }
    return { status: "CONNECTED", health: row.last_successful_sync_at ? "HEALTHY" : "STALE" };
  },
  async sync(req: SyncRequest, connection: HubConnection) {
    const payload = req.importPayload;
    if (!payload) {
      return {
        recordsReceived: 0, recordsCreated: 0, recordsUpdated: 0, recordsSkipped: 0,
        warnings: [],
        errorClass: "VALIDATION",
        errorCode: "VALIDATION",
        errorMessage: "File import requires importPayload (filename, sha256, docType).",
        summary: {},
      };
    }

    // Idempotent: same client + sha256 + docType → skip duplicate
    const prior: any = db().prepare(`
      SELECT id FROM integration_raw_records
      WHERE connection_id=? AND record_type=? AND external_record_id=?
    `).get(connection.id, "FILE_IMPORT", payload.sha256);

    const runId = (req as any)._runId || "pending";
    let created = 0, updated = 0, skipped = 0;

    if (prior) {
      skipped = 1;
    } else {
      const raw = upsertRawRecord({
        connectionId: connection.id,
        syncRunId: runId,
        provider: "file",
        recordType: "FILE_IMPORT",
        externalRecordId: payload.sha256,
        payload: {
          filename: payload.filename,
          sha256: payload.sha256,
          docType: payload.docType,
          periodId: payload.periodId || null,
          rowCount: payload.rowCount ?? null,
        },
      });
      if (raw.created) created += 1;
      else if (raw.updated) updated += 1;
      else skipped += 1;

      const canon = upsertCanonicalRecord({
        clientId: req.clientId,
        connectionId: connection.id,
        syncRunId: runId,
        recordType: "FILE_IMPORT",
        externalRecordId: payload.sha256,
        periodKey: payload.periodId || null,
        payload: {
          filename: payload.filename,
          docType: payload.docType,
          rowCount: payload.rowCount ?? null,
          source: "FILE_IMPORT",
        },
      });
      if (canon.created) created += 1;
      else if (canon.updated) updated += 1;
    }

    // Also stamp import_runs if the table exists (schema was unused — now lightly used)
    try {
      db().prepare(`
        INSERT INTO import_runs
          (id, client_id, period_id, doc_type, filename, row_count, accepted, rejected,
           detected_as, confidence, issues, raw_sample, status, uploaded_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'APPROVED', ?)
      `).run(
        uid(), req.clientId, payload.periodId || null, payload.docType, payload.filename,
        payload.rowCount ?? 0, payload.rowCount ?? 0, 0,
        payload.docType, 1, JSON.stringify([]), null, req.triggeredBy,
      );
    } catch {
      // import_runs may have stricter constraints — sync history is source of truth
    }

    return {
      recordsReceived: 1,
      recordsCreated: created,
      recordsUpdated: updated,
      recordsSkipped: skipped,
      warnings: skipped ? ["Duplicate file hash — import recorded as skipped (idempotent)."] : [],
      summary: {
        filename: payload.filename,
        sha256: payload.sha256.slice(0, 12) + "…",
        docType: payload.docType,
      },
    };
  },
};
