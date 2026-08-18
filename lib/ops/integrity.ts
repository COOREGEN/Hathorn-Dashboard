/**
 * Data integrity diagnostics — orphans, stuck states, broken storage refs.
 * Never mutates financial history.
 */

import { db, log } from "../db";
import { orphanReport } from "../tenancy";
import { markStuckJobs } from "./jobs";

export function runIntegrityDiagnostics(): Record<string, unknown> {
  const orphans = orphanReport();
  const stuckJobs = markStuckJobs(30);

  const stuckDocs = (db().prepare(`
    SELECT COUNT(*) n FROM source_documents
     WHERE status IN ('PROCESSING','PARSING','SCANNING')
       AND datetime(uploaded_at) < datetime('now', '-2 hours')
  `).get() as any).n;

  const stuckSyncs = (db().prepare(`
    SELECT COUNT(*) n FROM integration_sync_runs
     WHERE status IN ('RUNNING','PENDING')
       AND datetime(started_at) < datetime('now', '-2 hours')
  `).get() as any).n;

  // Storage reference check — DB rows whose files are missing.
  let brokenStorage = 0;
  try {
    const fs = require("fs") as typeof import("fs");
    const { resolveStoredAbsolute } = require("../documents/storage") as typeof import("../documents/storage");
    const rows: any[] = db().prepare(
      `SELECT id, storage_reference FROM source_documents
        WHERE storage_reference IS NOT NULL LIMIT 500`,
    ).all();
    for (const r of rows) {
      try {
        const p = resolveStoredAbsolute(r.storage_reference);
        if (!fs.existsSync(p)) brokenStorage += 1;
      } catch {
        brokenStorage += 1;
      }
    }
  } catch { /* storage module optional during early boot */ }

  // Release structural validity — readable snapshot JSON
  let brokenReleases = 0;
  const releases: any[] = db().prepare(
    `SELECT id, snapshot FROM release_records WHERE superseded_by IS NULL LIMIT 200`,
  ).all();
  for (const r of releases) {
    try {
      if (!r.snapshot) { brokenReleases += 1; continue; }
      const snap = typeof r.snapshot === "string" ? JSON.parse(r.snapshot) : r.snapshot;
      if (!snap || typeof snap !== "object") brokenReleases += 1;
    } catch {
      brokenReleases += 1;
    }
  }

  const result = {
    orphans,
    stuckJobs,
    stuckDocuments: stuckDocs,
    stuckSyncRuns: stuckSyncs,
    storageReferenceBroken: brokenStorage,
    releaseSnapshotInvalid: brokenReleases,
    checkedAt: new Date().toISOString(),
  };
  log("info", "ops.integrity", result as any);
  return result;
}
