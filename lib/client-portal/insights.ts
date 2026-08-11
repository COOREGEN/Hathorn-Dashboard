import { db, uid } from "../db";
import { audit } from "../auth";
import { firmIdForClient } from "../tenancy";
import type { InsightStatus } from "./types";

export type ClientInsight = {
  id: string;
  firmId: string;
  clientId: string;
  periodId: string | null;
  releaseId: string | null;
  title: string;
  section: string;
  body: string;
  sourceRefs: { type: string; id?: string; title: string }[];
  status: InsightStatus;
  version: number;
  createdBy: string;
  createdAt: string;
  publishedBy: string | null;
  publishedAt: string | null;
};

function row(r: any): ClientInsight {
  let refs: ClientInsight["sourceRefs"] = [];
  try { refs = JSON.parse(r.source_refs_json || "[]"); } catch { /* */ }
  return {
    id: r.id, firmId: r.firm_id, clientId: r.client_id,
    periodId: r.period_id, releaseId: r.release_id,
    title: r.title, section: r.section, body: r.body,
    sourceRefs: refs, status: r.status, version: r.version,
    createdBy: r.created_by, createdAt: r.created_at,
    publishedBy: r.published_by, publishedAt: r.published_at,
  };
}

export function listInsights(opts: {
  clientId: string;
  status?: InsightStatus | InsightStatus[];
  forClient?: boolean;
}): ClientInsight[] {
  const statuses = opts.forClient
    ? ["PUBLISHED"]
    : opts.status
      ? (Array.isArray(opts.status) ? opts.status : [opts.status])
      : null;
  let sql = `SELECT * FROM client_insights WHERE client_id=?`;
  const params: any[] = [opts.clientId];
  if (statuses) {
    sql += ` AND status IN (${statuses.map(() => "?").join(",")})`;
    params.push(...statuses);
  }
  sql += ` ORDER BY COALESCE(published_at, created_at) DESC LIMIT 100`;
  return (db().prepare(sql).all(...params) as any[]).map(row);
}

export function getInsight(id: string): ClientInsight | null {
  const r = db().prepare("SELECT * FROM client_insights WHERE id=?").get(id);
  return r ? row(r) : null;
}

export function createInsight(input: {
  clientId: string;
  periodId?: string | null;
  releaseId?: string | null;
  title: string;
  section?: string;
  body: string;
  sourceRefs?: ClientInsight["sourceRefs"];
  actorId: string;
}): ClientInsight {
  const firmId = firmIdForClient(input.clientId);
  if (!firmId) throw new Error("Client has no firm.");
  const id = uid();
  db().prepare(`
    INSERT INTO client_insights
      (id, firm_id, client_id, period_id, release_id, title, section, body,
       source_refs_json, status, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,'DRAFT',?)
  `).run(
    id, firmId, input.clientId, input.periodId || null, input.releaseId || null,
    input.title.trim(), input.section || "PERFORMANCE", input.body.trim(),
    JSON.stringify(input.sourceRefs || []), input.actorId,
  );
  audit(input.actorId, "CLIENT_INSIGHT_CREATED", id, {
    firmId, clientId: input.clientId,
  });
  return getInsight(id)!;
}

export function setInsightStatus(opts: {
  insightId: string;
  firmId: string;
  status: InsightStatus;
  actorId: string;
}): ClientInsight | null {
  const existing: any = db().prepare(
    "SELECT * FROM client_insights WHERE id=? AND firm_id=?",
  ).get(opts.insightId, opts.firmId);
  if (!existing) return null;
  if (opts.status === "PUBLISHED") {
    db().prepare(`
      UPDATE client_insights
      SET status='PUBLISHED', published_by=?, published_at=datetime('now')
      WHERE id=?
    `).run(opts.actorId, opts.insightId);
    audit(opts.actorId, "CLIENT_INSIGHT_PUBLISHED", opts.insightId, {
      firmId: opts.firmId, clientId: existing.client_id,
    });
  } else {
    db().prepare(`UPDATE client_insights SET status=? WHERE id=?`)
      .run(opts.status, opts.insightId);
    audit(opts.actorId, `CLIENT_INSIGHT_${opts.status}`, opts.insightId, {
      firmId: opts.firmId, clientId: existing.client_id,
    });
  }
  return getInsight(opts.insightId);
}
