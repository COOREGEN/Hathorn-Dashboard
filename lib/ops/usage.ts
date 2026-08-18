/**
 * Platform usage visibility — firms/clients/jobs/AI aggregates.
 * Never surfaces confidential client financial values.
 */

import { db, uid } from "../db";
import { jobCounts } from "./jobs";

export function recordAiUsage(input: {
  firmId?: string | null;
  clientId?: string | null;
  feature: string;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  status?: string;
  errorClass?: string | null;
  correlationId?: string | null;
}) {
  db().prepare(`
    INSERT INTO ai_usage_events
      (id, firm_id, client_id, feature, model, request_count,
       input_tokens, output_tokens, status, error_class, correlation_id)
    VALUES (?,?,?,?,?,1,?,?,?,?,?)
  `).run(
    uid(),
    input.firmId ?? null,
    input.clientId ?? null,
    input.feature,
    input.model ?? null,
    input.inputTokens ?? null,
    input.outputTokens ?? null,
    input.status || "ok",
    input.errorClass ?? null,
    input.correlationId ?? null,
  );
}

export function platformUsageSummary() {
  const firms = (db().prepare(`SELECT COUNT(*) n FROM firms WHERE status='ACTIVE'`).get() as any).n;
  const clients = (db().prepare(`SELECT COUNT(*) n FROM clients`).get() as any).n;
  const users = (db().prepare(`SELECT COUNT(*) n FROM users`).get() as any).n;
  const releases = (db().prepare(
    `SELECT COUNT(*) n FROM release_records WHERE superseded_by IS NULL`,
  ).get() as any).n;
  const docs = (db().prepare(`SELECT COUNT(*) n FROM source_documents`).get() as any).n;

  let storageBytes = 0;
  try {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const dir = process.env.DOCUMENTS_DIR
      || path.join(process.env.DATA_DIR || path.join(process.cwd(), "data"), "documents");
    if (fs.existsSync(dir)) {
      const walk = (d: string) => {
        for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, ent.name);
          if (ent.isDirectory()) walk(p);
          else storageBytes += fs.statSync(p).size;
        }
      };
      walk(dir);
    }
  } catch { /* estimate unavailable */ }

  const aiToday: any = db().prepare(`
    SELECT COUNT(*) requests,
           COALESCE(SUM(input_tokens),0) input_tokens,
           COALESCE(SUM(output_tokens),0) output_tokens
      FROM ai_usage_events
     WHERE created_at >= datetime('now', '-1 day')
  `).get();

  const aiByFeature: any[] = db().prepare(`
    SELECT feature, COUNT(*) requests, SUM(CASE WHEN status!='ok' THEN 1 ELSE 0 END) failures
      FROM ai_usage_events
     WHERE created_at >= datetime('now', '-7 day')
     GROUP BY feature
     ORDER BY requests DESC
  `).all();

  const syncs: any = db().prepare(`
    SELECT
      SUM(CASE WHEN status='SUCCESS' THEN 1 ELSE 0 END) success,
      SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) failed,
      COUNT(*) total
    FROM integration_sync_runs
    WHERE started_at >= datetime('now', '-1 day')
  `).get();

  const jobs = jobCounts();
  const jobsToday = (db().prepare(
    `SELECT COUNT(*) n FROM background_jobs WHERE created_at >= datetime('now', '-1 day')`,
  ).get() as any).n;

  return {
    firms: { active: firms },
    clients: { total: clients },
    users: { total: users },
    releases: { current: releases },
    documents: { count: docs, storageBytesApprox: storageBytes },
    jobs: { ...jobs, createdLast24h: jobsToday },
    integrations: {
      syncsLast24h: syncs?.total || 0,
      syncSuccess: syncs?.success || 0,
      syncFailed: syncs?.failed || 0,
      syncSuccessPct: syncs?.total
        ? Math.round((100 * (syncs.success || 0)) / syncs.total)
        : null,
    },
    ai: {
      requestsLast24h: aiToday?.requests || 0,
      inputTokensLast24h: aiToday?.input_tokens || 0,
      outputTokensLast24h: aiToday?.output_tokens || 0,
      byFeatureLast7d: aiByFeature,
    },
  };
}
