import { db, uid } from "../db";
import { firmIdForClient } from "../tenancy";
import { audit } from "../auth";
import {
  DEFAULT_PORTAL_METRICS,
  DEFAULT_PORTAL_MODULES,
  type PortalModules,
} from "./types";

export function getPortalConfig(clientId: string): PortalModules {
  const r: any = db().prepare(
    "SELECT * FROM client_portal_config WHERE client_id=?",
  ).get(clientId);
  if (!r) return { ...DEFAULT_PORTAL_MODULES };
  return {
    showPlanning: !!r.show_planning,
    showDocuments: !!r.show_documents,
    showInsights: !!r.show_insights,
    showCopilot: !!r.show_copilot,
    showFinancialStatements: !!r.show_financial_statements,
    showReports: !!r.show_reports,
  };
}

export function upsertPortalConfig(
  clientId: string,
  patch: Partial<PortalModules>,
  actorId: string,
): PortalModules {
  const firmId = firmIdForClient(clientId);
  if (!firmId) throw new Error("Client has no firm.");
  const cur = getPortalConfig(clientId);
  const next = { ...cur, ...patch };
  db().prepare(`
    INSERT INTO client_portal_config
      (client_id, firm_id, show_planning, show_documents, show_insights,
       show_copilot, show_financial_statements, show_reports, updated_by)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(client_id) DO UPDATE SET
      show_planning=excluded.show_planning,
      show_documents=excluded.show_documents,
      show_insights=excluded.show_insights,
      show_copilot=excluded.show_copilot,
      show_financial_statements=excluded.show_financial_statements,
      show_reports=excluded.show_reports,
      updated_by=excluded.updated_by,
      updated_at=datetime('now')
  `).run(
    clientId, firmId,
    next.showPlanning ? 1 : 0,
    next.showDocuments ? 1 : 0,
    next.showInsights ? 1 : 0,
    next.showCopilot ? 1 : 0,
    next.showFinancialStatements ? 1 : 0,
    next.showReports ? 1 : 0,
    actorId,
  );
  audit(actorId, "PORTAL_CONFIG_UPDATE", clientId, {
    firmId,
    clientId,
    resourceType: "portal_config",
    resourceId: clientId,
    metadata: patch as Record<string, unknown>,
  });
  return getPortalConfig(clientId);
}

export type PortalMetricRow = {
  metricKey: string;
  label: string;
  displayOrder: number;
  visible: boolean;
  comparisonMode: string;
};

export function getPortalMetrics(clientId: string): PortalMetricRow[] {
  const rows: any[] = db().prepare(`
    SELECT * FROM client_portal_metric_config
    WHERE client_id=? ORDER BY display_order
  `).all(clientId);
  if (!rows.length) {
    return DEFAULT_PORTAL_METRICS.map((m) => ({
      metricKey: m.metricKey,
      label: m.label,
      displayOrder: m.displayOrder,
      visible: true,
      comparisonMode: m.comparisonMode,
    }));
  }
  const labelOf = (key: string) =>
    DEFAULT_PORTAL_METRICS.find((m) => m.metricKey === key)?.label || key;
  return rows.map((r) => ({
    metricKey: r.metric_key,
    label: labelOf(r.metric_key),
    displayOrder: r.display_order,
    visible: !!r.visible,
    comparisonMode: r.comparison_mode,
  }));
}

export function ensureDefaultMetrics(clientId: string) {
  const existing = db().prepare(
    "SELECT COUNT(*) n FROM client_portal_metric_config WHERE client_id=?",
  ).get(clientId) as any;
  if (existing.n > 0) return;
  for (const m of DEFAULT_PORTAL_METRICS) {
    db().prepare(`
      INSERT INTO client_portal_metric_config
        (id, client_id, metric_key, display_order, visible, comparison_mode)
      VALUES (?,?,?,?,1,?)
    `).run(uid(), clientId, m.metricKey, m.displayOrder, m.comparisonMode);
  }
}
