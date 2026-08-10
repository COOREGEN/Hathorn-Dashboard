/**
 * Raw → canonical staging with idempotent upsert by external_record_id.
 */

import { createHash } from "crypto";
import { db, uid } from "../db";

export function upsertRawRecord(opts: {
  connectionId: string;
  syncRunId: string;
  provider: string;
  recordType: string;
  externalRecordId: string;
  externalUpdatedAt?: string | null;
  payload: unknown;
}): { created: boolean; updated: boolean; skipped: boolean; id: string } {
  const payloadJson = JSON.stringify(opts.payload);
  const hash = createHash("sha256").update(payloadJson).digest("hex");
  const existing: any = db().prepare(`
    SELECT id, content_hash FROM integration_raw_records
    WHERE connection_id=? AND record_type=? AND external_record_id=?
  `).get(opts.connectionId, opts.recordType, opts.externalRecordId);

  if (existing && existing.content_hash === hash) {
    return { created: false, updated: false, skipped: true, id: existing.id };
  }

  if (existing) {
    db().prepare(`
      UPDATE integration_raw_records
      SET sync_run_id=?, payload_json=?, content_hash=?, external_updated_at=?, created_at=datetime('now')
      WHERE id=?
    `).run(
      opts.syncRunId, payloadJson, hash, opts.externalUpdatedAt || null, existing.id,
    );
    return { created: false, updated: true, skipped: false, id: existing.id };
  }

  const id = uid();
  db().prepare(`
    INSERT INTO integration_raw_records
      (id, connection_id, sync_run_id, provider, record_type, external_record_id,
       external_updated_at, payload_json, content_hash)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(
    id, opts.connectionId, opts.syncRunId, opts.provider, opts.recordType,
    opts.externalRecordId, opts.externalUpdatedAt || null, payloadJson, hash,
  );
  return { created: true, updated: false, skipped: false, id };
}

export function upsertCanonicalRecord(opts: {
  clientId: string;
  connectionId: string;
  syncRunId: string;
  recordType: string;
  externalRecordId: string;
  payload: unknown;
  currency?: string;
  periodKey?: string | null;
  sourceUpdatedAt?: string | null;
}): { created: boolean; updated: boolean } {
  const payloadJson = JSON.stringify(opts.payload);
  const now = new Date().toISOString();
  const existing: any = db().prepare(`
    SELECT id, payload_json FROM integration_canonical_records
    WHERE client_id=? AND connection_id=? AND record_type=? AND external_record_id=?
  `).get(opts.clientId, opts.connectionId, opts.recordType, opts.externalRecordId);

  if (existing) {
    if (existing.payload_json === payloadJson) {
      db().prepare(`UPDATE integration_canonical_records SET synced_at=?, sync_run_id=? WHERE id=?`)
        .run(now, opts.syncRunId, existing.id);
      return { created: false, updated: false };
    }
    db().prepare(`
      UPDATE integration_canonical_records
      SET payload_json=?, sync_run_id=?, currency=?, period_key=?, source_updated_at=?, synced_at=?
      WHERE id=?
    `).run(
      payloadJson, opts.syncRunId, opts.currency || "USD", opts.periodKey || null,
      opts.sourceUpdatedAt || null, now, existing.id,
    );
    return { created: false, updated: true };
  }

  db().prepare(`
    INSERT INTO integration_canonical_records
      (id, client_id, connection_id, sync_run_id, record_type, external_record_id,
       payload_json, currency, period_key, source_updated_at, synced_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    uid(), opts.clientId, opts.connectionId, opts.syncRunId, opts.recordType,
    opts.externalRecordId, payloadJson, opts.currency || "USD",
    opts.periodKey || null, opts.sourceUpdatedAt || null, now,
  );
  return { created: true, updated: false };
}

export function listCanonical(clientId: string, recordType?: string) {
  if (recordType) {
    return db().prepare(
      `SELECT * FROM integration_canonical_records WHERE client_id=? AND record_type=? ORDER BY synced_at DESC`,
    ).all(clientId, recordType);
  }
  return db().prepare(
    `SELECT * FROM integration_canonical_records WHERE client_id=? ORDER BY synced_at DESC LIMIT 200`,
  ).all(clientId);
}
