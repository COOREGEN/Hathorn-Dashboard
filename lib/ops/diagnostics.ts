/**
 * Support diagnostics — metadata only, never raw P&L / documents / tokens.
 */

import { db } from "../db";
import { getFirm, firmIdForClient, orphanReport } from "../tenancy";
import { listFirmCapabilities } from "./capabilities";
import { listJobs, jobPublicView } from "./jobs";
import { STALE_SYNC_HOURS } from "../integrations/types";

export function searchFirms(q: string, limit = 20) {
  const term = `%${String(q || "").trim()}%`;
  if (term === "%%") {
    return db().prepare(`
      SELECT f.id, f.name, f.slug, f.status,
        (SELECT COUNT(*) FROM clients c WHERE c.firm_id=f.id) client_count
      FROM firms f ORDER BY f.name LIMIT ?
    `).all(limit);
  }
  return db().prepare(`
    SELECT DISTINCT f.id, f.name, f.slug, f.status,
      (SELECT COUNT(*) FROM clients c WHERE c.firm_id=f.id) client_count
    FROM firms f
    LEFT JOIN firm_memberships m ON m.firm_id=f.id
    LEFT JOIN users u ON u.id=m.user_id
    WHERE f.name LIKE ? OR f.slug LIKE ? OR f.id LIKE ? OR u.email LIKE ?
    ORDER BY f.name
    LIMIT ?
  `).all(term, term, term, term, limit);
}

export function clientDiagnostics(clientId: string) {
  const client: any = db().prepare(
    `SELECT id, name, slug, firm_id, template FROM clients WHERE id=?`,
  ).get(clientId);
  if (!client) return null;

  const firm = getFirm(client.firm_id);
  const latestRelease: any = db().prepare(`
    SELECT r.id, r.version, r.published_at, r.period_id, p.year, p.month
      FROM release_records r
      JOIN periods p ON p.id=r.period_id
     WHERE r.client_id=? AND r.superseded_by IS NULL
     ORDER BY r.published_at DESC LIMIT 1
  `).get(clientId);

  const connectionRows = db().prepare(`
    SELECT id, provider, status, last_successful_sync_at, last_error_code
      FROM integration_connections WHERE client_id=?
  `).all(clientId) as any[];
  const connections = connectionRows.map((c: any) => ({
    id: c.id,
    provider: c.provider,
    status: c.status,
    lastSyncAt: c.last_successful_sync_at,
    lastErrorCode: c.last_error_code,
    stale: c.last_successful_sync_at
      ? (Date.now() - new Date(c.last_successful_sync_at).getTime()) / 3600000 > STALE_SYNC_HOURS
      : c.status === "CONNECTED",
  }));

  const failedJobs = listJobs({ clientId, status: ["FAILED", "STUCK", "RETRYING"], limit: 10 })
    .map(jobPublicView);

  const docRows = db().prepare(`
    SELECT id, original_filename, status, uploaded_at
      FROM source_documents
     WHERE client_id=? AND status IN ('FAILED','QUARANTINED','ERROR')
     ORDER BY uploaded_at DESC LIMIT 10
  `).all(clientId) as any[];
  const docFailures = docRows.map((d: any) => ({
    id: d.id,
    filename: d.original_filename,
    status: d.status,
    createdAt: d.uploaded_at,
  }));

  const close: any = db().prepare(`
    SELECT id, status, period_id, last_evaluated_at FROM close_runs
     WHERE client_id=? ORDER BY COALESCE(last_evaluated_at, started_at, completed_at) DESC LIMIT 1
  `).get(clientId);

  const capabilities = firm ? listFirmCapabilities(firm.id) : [];

  return {
    firm: firm ? { id: firm.id, name: firm.name, slug: firm.slug, status: firm.status } : null,
    client: { id: client.id, name: client.name, slug: client.slug, template: client.template },
    featureFlags: capabilities,
    latestRelease: latestRelease
      ? {
          id: latestRelease.id,
          version: latestRelease.version,
          publishedAt: latestRelease.published_at,
          period: `${latestRelease.year}-${String(latestRelease.month).padStart(2, "0")}`,
        }
      : null,
    integrations: connections,
    recentFailedJobs: failedJobs,
    documentProcessingFailures: docFailures,
    close: close
      ? {
          id: close.id,
          status: close.status,
          periodId: close.period_id,
          updatedAt: close.last_evaluated_at,
        }
      : null,
  };
}

export function platformIntegritySnapshot() {
  return orphanReport();
}

export function assertClientInFirm(clientId: string, firmId: string): boolean {
  return firmIdForClient(clientId) === firmId;
}
