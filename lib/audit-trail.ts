/**
 * Activity audit trail — query + structured write helpers.
 *
 * Design inspired by proven open-source patterns (trailkit, drizzle-audit,
 * nestjs-audit-log, Bemi): append-only events with actor, action, resource,
 * tenant, and optional request context. Hathorn already wrote to `audit_logs`;
 * this module makes those rows queryable for firm/platform monitoring without
 * changing financial engines or client intelligence UX.
 */

import { db } from "./db";

export type AuditResourceType =
  | "period"
  | "client"
  | "user"
  | "close"
  | "document"
  | "reconciliation"
  | "portal_config"
  | "release"
  | "firm"
  | "session"
  | "other";

export type AuditWriteOpts = {
  firmId?: string | null;
  clientId?: string | null;
  resourceType?: AuditResourceType | string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
};

export type AuditRow = {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
  action: string;
  detail: string;
  firmId: string | null;
  clientId: string | null;
  clientName: string | null;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  correlationId: string | null;
  createdAt: string;
};

export type AuditQuery = {
  firmId?: string | null;
  clientId?: string | null;
  userId?: string | null;
  action?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  q?: string | null;
  since?: string | null;
  limit?: number;
};

/** Persist one append-only activity event. Never throws into the caller path. */
export function recordAudit(
  userId: string,
  action: string,
  detail = "",
  opts: AuditWriteOpts = {},
): void {
  try {
    const id = crypto.randomUUID();
    const meta = opts.metadata ? JSON.stringify(opts.metadata) : null;
    const firmId = opts.firmId ?? null;
    const clientId = opts.clientId ?? null;
    try {
      db().prepare(`
        INSERT INTO audit_logs (
          id, user_id, action, detail, firm_id, client_id,
          resource_type, resource_id, metadata_json, ip, user_agent, correlation_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        userId,
        action,
        detail,
        firmId,
        clientId,
        opts.resourceType ?? null,
        opts.resourceId ?? null,
        meta,
        opts.ip ?? null,
        opts.userAgent ?? null,
        opts.correlationId ?? null,
      );
    } catch (colErr: any) {
      // Pre-migration 31 databases: fall back to the original column set.
      const msg = String(colErr?.message || colErr);
      if (!/no such column/i.test(msg)) throw colErr;
      db().prepare(`
        INSERT INTO audit_logs (id, user_id, action, detail, firm_id, client_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, userId, action, detail, firmId, clientId);
    }
  } catch (err) {
    // Audit must not break the business write. Structured stderr for ops.
    try {
      const { log } = require("./db") as typeof import("./db");
      log("error", "audit.write_failed", {
        action,
        message: err instanceof Error ? err.message : String(err),
      });
    } catch { /* ignore */ }
  }
}

function parseMeta(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** Firm- or platform-scoped activity feed. Newest first. */
export function queryAuditTrail(q: AuditQuery): AuditRow[] {
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
  const where: string[] = ["1=1"];
  const params: unknown[] = [];

  if (q.firmId) {
    // Include legacy rows that never stored firm_id but were written by a firm member.
    where.push(`(
      a.firm_id = ?
      OR (
        a.firm_id IS NULL
        AND a.user_id IN (
          SELECT user_id FROM firm_memberships WHERE firm_id = ? AND status = 'ACTIVE'
        )
      )
    )`);
    params.push(q.firmId, q.firmId);
  }
  if (q.clientId) {
    where.push("a.client_id = ?");
    params.push(q.clientId);
  }
  if (q.userId) {
    where.push("a.user_id = ?");
    params.push(q.userId);
  }
  if (q.action) {
    where.push("a.action = ?");
    params.push(q.action);
  }
  if (q.resourceType) {
    where.push("a.resource_type = ?");
    params.push(q.resourceType);
  }
  if (q.resourceId) {
    where.push("a.resource_id = ?");
    params.push(q.resourceId);
  }
  if (q.since) {
    where.push("a.created_at >= ?");
    params.push(q.since);
  }
  if (q.q) {
    const like = `%${String(q.q).slice(0, 80)}%`;
    where.push("(a.action LIKE ? OR a.detail LIKE ? OR u.email LIKE ? OR u.name LIKE ? OR c.name LIKE ?)");
    params.push(like, like, like, like, like);
  }

  params.push(limit);

  const rows: any[] = db().prepare(`
    SELECT
      a.id, a.user_id, a.action, a.detail, a.firm_id, a.client_id,
      a.resource_type, a.resource_id, a.metadata_json, a.ip, a.user_agent,
      a.correlation_id, a.created_at,
      u.name AS user_name, u.email AS user_email, u.role AS user_role,
      c.name AS client_name
    FROM audit_logs a
    LEFT JOIN users u ON u.id = a.user_id
    LEFT JOIN clients c ON c.id = a.client_id
    WHERE ${where.join(" AND ")}
    ORDER BY a.created_at DESC
    LIMIT ?
  `).all(...params);

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user_name ?? null,
    userEmail: r.user_email ?? null,
    userRole: r.user_role ?? null,
    action: r.action,
    detail: r.detail || "",
    firmId: r.firm_id ?? null,
    clientId: r.client_id ?? null,
    clientName: r.client_name ?? null,
    resourceType: r.resource_type ?? null,
    resourceId: r.resource_id ?? null,
    metadata: parseMeta(r.metadata_json ?? null),
    ip: r.ip ?? null,
    userAgent: r.user_agent ?? null,
    correlationId: r.correlation_id ?? null,
    createdAt: r.created_at,
  }));
}

/** Distinct actions for filter chips — scoped when firmId set. */
export function auditActionCatalog(firmId?: string | null): string[] {
  const rows: any[] = firmId
    ? db().prepare(`
        SELECT DISTINCT action FROM audit_logs
        WHERE firm_id=? ORDER BY action LIMIT 80
      `).all(firmId)
    : db().prepare(`
        SELECT DISTINCT action FROM audit_logs ORDER BY action LIMIT 80
      `).all();
  return rows.map((r) => String(r.action));
}

/** Pull IP / UA from a Request when available. */
export function requestAuditContext(req?: Request | null): Pick<AuditWriteOpts, "ip" | "userAgent" | "correlationId"> {
  if (!req) return {};
  const fwd = req.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
  return {
    ip,
    userAgent: req.headers.get("user-agent"),
    correlationId: req.headers.get("x-request-id"),
  };
}

/** Human labels for common actions — advisory / bookkeeper / admin. */
export function describeAuditAction(action: string): string {
  const map: Record<string, string> = {
    LOGIN: "Signed in",
    LOGOUT: "Signed out",
    CLOSE_UPLOAD: "Uploaded close",
    PERIOD_PUBLISH: "Published period",
    PERIOD_AMEND: "Opened amendment",
    PERIOD_REVOKE: "Unpublished period",
    STORY_DRAFT: "Drafted story notes",
    NOTE_SAVE: "Saved commentary",
    PORTAL_CONFIG_UPDATE: "Updated portal config",
    STATEMENT_PDF_EXPORTED: "Exported statement PDF",
    RECONCILIATION_RUN: "Ran reconciliation",
    CLOSE_START: "Started close",
    CLOSE_COMPLETE: "Completed close check",
    USER_CREATE: "Created user",
    USER_UPDATE: "Updated user",
    CLIENT_CREATE: "Created client",
    CLIENT_UPDATE: "Updated client",
  };
  return map[action] || action.replace(/_/g, " ").toLowerCase();
}
