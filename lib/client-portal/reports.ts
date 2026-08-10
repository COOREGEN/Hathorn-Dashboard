/**
 * Client reports — Monthly Advisory Review with frozen content + branding snapshots.
 * Publishing a report does not republish financials.
 */

import { db, uid } from "../db";
import { audit } from "../auth";
import { brandingForClient, firmIdForClient } from "../tenancy";
import { activeRelease } from "../release";
import { lockedStatements } from "../statement";
import { formatMoneyK, formatPct } from "../intelligence/calc";
import { createInsight, listInsights } from "./insights";
import { listQuestions } from "./questions";
import { listSharedScenarios } from "./scenarios";
import {
  PORTAL_ENGINE_VERSION,
  type BrandingSnapshot,
  type MonthlyReviewContent,
  type ReportStatus,
} from "./types";
import { getPortalMetrics } from "./config";
import { recordPortalEvent } from "./events";

export type ClientReport = {
  id: string;
  firmId: string;
  clientId: string;
  periodId: string | null;
  reportType: string;
  title: string;
  status: ReportStatus;
  version: number;
  sourceReleaseId: string | null;
  content: MonthlyReviewContent;
  branding: BrandingSnapshot;
  publishedBy: string | null;
  publishedAt: string | null;
  createdAt: string;
};

function parseReport(r: any): ClientReport {
  return {
    id: r.id, firmId: r.firm_id, clientId: r.client_id,
    periodId: r.period_id, reportType: r.report_type, title: r.title,
    status: r.status, version: r.version,
    sourceReleaseId: r.source_release_id,
    content: JSON.parse(r.content_snapshot),
    branding: JSON.parse(r.branding_snapshot),
    publishedBy: r.published_by, publishedAt: r.published_at,
    createdAt: r.created_at,
  };
}

function metricValue(p: any, key: string): number {
  if (key === "cash") return p.cash?.total ?? 0;
  return Number(p[key] ?? 0);
}

function formatMetric(key: string, value: number): string {
  if (key.endsWith("Pct") || key === "laborPct" || key === "grossMarginPct" || key === "netMarginPct") {
    return formatPct(value);
  }
  return formatMoneyK(value);
}

export function buildMonthlyReviewContent(clientId: string, periodId: string): MonthlyReviewContent {
  const periods = lockedStatements(clientId);
  const cur = periods.find((p) => p.periodId === periodId);
  if (!cur) throw new Error("No published release for that period.");
  const idx = periods.findIndex((p) => p.periodId === periodId);
  const prior = idx > 0 ? periods[idx - 1] : null;
  const yoy = periods.find((p) => p.year === cur.year - 1 && p.month === cur.month) || null;
  const release = activeRelease(periodId);
  const metrics = getPortalMetrics(clientId).filter((m) => m.visible).slice(0, 6);

  const kpis = metrics.map((m) => {
    const value = metricValue(cur, m.metricKey);
    let delta: string | null = null;
    const cmp = m.comparisonMode === "YoY" ? yoy : prior;
    if (cmp) {
      const prev = metricValue(cmp, m.metricKey);
      if (m.metricKey.endsWith("Pct") || m.metricKey === "laborPct" || m.metricKey === "grossMarginPct") {
        const pts = Math.round((value - prev) * 10) / 10;
        delta = `${pts >= 0 ? "+" : ""}${pts} pts`;
      } else if (prev !== 0) {
        const pct = Math.round(((value - prev) / Math.abs(prev)) * 1000) / 10;
        delta = `${pct >= 0 ? "+" : ""}${pct}%`;
      }
    }
    return {
      key: m.metricKey,
      label: m.label,
      value,
      formatted: formatMetric(m.metricKey, value),
      delta,
    };
  });

  const whatChangedNotes = (cur.notes || [])
    .filter((n) => n.slot === "WHAT_CHANGED" || n.slot === "OVERVIEW")
    .map((n) => n.body)
    .filter(Boolean);
  const whatChanged = whatChangedNotes[0]
    || (prior
      ? `Revenue moved from ${formatMoneyK(prior.revenue)} to ${formatMoneyK(cur.revenue)}; gross margin from ${formatPct(prior.grossMarginPct)} to ${formatPct(cur.grossMarginPct)}.`
      : `Published results for ${cur.label}.`);

  const cashChange = prior ? Math.round((cur.cash.total - prior.cash.total) * 10) / 10 : null;
  const questions = listQuestions({ clientId, forClient: true })
    .filter((q) => !q.periodId || q.periodId === periodId)
    .slice(0, 6)
    .map((q) => q.question);

  const shared = listSharedScenarios(clientId)[0];
  const outlook = shared?.snapshot
    ? `${shared.snapshot.scenario} forecast: revenue ${formatMoneyK(shared.snapshot.totals.forecastRevenue)}. ${shared.snapshot.disclaimer}`
    : "No client-shared forecast for this engagement yet.";

  const commentary = (cur.notes || []).map((n) => ({
    heading: n.heading || n.slot, body: n.body,
  }));

  return {
    templateId: "tmpl_monthly_advisory_v1",
    periodLabel: cur.label,
    releaseId: release?.id || null,
    releaseVersion: release?.version ?? null,
    kpis,
    whatChanged,
    financialPerformance: [
      { label: "Revenue", value: cur.revenue, formatted: formatMoneyK(cur.revenue) },
      { label: "Direct cost", value: cur.directCost, formatted: formatMoneyK(cur.directCost) },
      { label: "Gross profit", value: cur.grossProfit, formatted: formatMoneyK(cur.grossProfit) },
      { label: "Overhead", value: cur.opex, formatted: formatMoneyK(cur.opex) },
      { label: "Net income", value: cur.netIncome, formatted: formatMoneyK(cur.netIncome) },
    ],
    cash: {
      current: cur.cash.total,
      change: cashChange,
      note: cashChange == null
        ? "Ending cash from the published release."
        : `Cash changed ${cashChange >= 0 ? "+" : ""}${formatMoneyK(cashChange)} vs prior published month.`,
    },
    outlook,
    managementQuestions: questions,
    advisorCommentary: commentary,
    disclaimer:
      "Figures are from the published financial release. Forecasts, where shown, are assumptions — not guarantees.",
    engineVersion: PORTAL_ENGINE_VERSION,
  };
}

export function captureBranding(clientId: string): BrandingSnapshot {
  const brand = brandingForClient(clientId);
  const client: any = db().prepare("SELECT name FROM clients WHERE id=?").get(clientId);
  return {
    firmName: brand.firmName,
    clientName: client?.name || "Client",
    clientPortalName: brand.clientPortalName,
    reportFooter: brand.reportFooter,
    brandPrimary: brand.brandPrimary,
    brandAccent: brand.brandAccent,
    logoText: brand.logoText,
    showPlatformMark: brand.showPlatformMark,
    capturedAt: new Date().toISOString(),
  };
}

export function listReports(opts: {
  clientId: string;
  forClient?: boolean;
}): ClientReport[] {
  let sql = `SELECT * FROM client_reports WHERE client_id=?`;
  if (opts.forClient) sql += ` AND status='PUBLISHED'`;
  sql += ` ORDER BY COALESCE(published_at, created_at) DESC LIMIT 50`;
  return (db().prepare(sql).all(opts.clientId) as any[]).map(parseReport);
}

export function getReport(id: string): ClientReport | null {
  const r = db().prepare("SELECT * FROM client_reports WHERE id=?").get(id);
  return r ? parseReport(r) : null;
}

export function getPublishedReport(id: string, clientId: string): ClientReport | null {
  const r = db().prepare(`
    SELECT * FROM client_reports WHERE id=? AND client_id=? AND status='PUBLISHED'
  `).get(id, clientId);
  return r ? parseReport(r) : null;
}

export function createMonthlyReport(opts: {
  clientId: string;
  periodId: string;
  actorId: string;
  publish?: boolean;
}): ClientReport {
  const firmId = firmIdForClient(opts.clientId);
  if (!firmId) throw new Error("Client has no firm.");
  const content = buildMonthlyReviewContent(opts.clientId, opts.periodId);
  const branding = captureBranding(opts.clientId);
  const release = activeRelease(opts.periodId);
  const id = uid();
  const status: ReportStatus = opts.publish ? "PUBLISHED" : "DRAFT";
  const title = `${content.periodLabel} Monthly Financial Review`;

  // Version: next for this period type
  const prev: any = db().prepare(`
    SELECT MAX(version) v FROM client_reports
    WHERE client_id=? AND period_id=? AND report_type='MONTHLY_ADVISORY_REVIEW'
  `).get(opts.clientId, opts.periodId);
  const version = (prev?.v || 0) + 1;

  db().prepare(`
    INSERT INTO client_reports
      (id, firm_id, client_id, period_id, report_type, title, status, version,
       source_release_id, template_id, content_snapshot, branding_snapshot,
       created_by, published_by, published_at)
    VALUES (?,?,?,?, 'MONTHLY_ADVISORY_REVIEW', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, firmId, opts.clientId, opts.periodId, title, status, version,
    release?.id || null, content.templateId,
    JSON.stringify(content), JSON.stringify(branding),
    opts.actorId,
    opts.publish ? opts.actorId : null,
    opts.publish ? new Date().toISOString() : null,
  );

  audit(opts.actorId, opts.publish ? "CLIENT_REPORT_PUBLISHED" : "CLIENT_REPORT_CREATED", id, {
    firmId, clientId: opts.clientId,
  });
  return getReport(id)!;
}

export function publishReport(opts: {
  reportId: string; firmId: string; actorId: string;
}): ClientReport | null {
  const existing: any = db().prepare(
    "SELECT * FROM client_reports WHERE id=? AND firm_id=?",
  ).get(opts.reportId, opts.firmId);
  if (!existing || existing.status === "RETRACTED") return null;
  db().prepare(`
    UPDATE client_reports
    SET status='PUBLISHED', published_by=?, published_at=datetime('now')
    WHERE id=?
  `).run(opts.actorId, opts.reportId);
  audit(opts.actorId, "CLIENT_REPORT_PUBLISHED", opts.reportId, {
    firmId: opts.firmId, clientId: existing.client_id,
  });
  return getReport(opts.reportId);
}

export function retractReport(opts: {
  reportId: string; firmId: string; actorId: string;
}): ClientReport | null {
  const existing: any = db().prepare(
    "SELECT * FROM client_reports WHERE id=? AND firm_id=?",
  ).get(opts.reportId, opts.firmId);
  if (!existing || existing.status !== "PUBLISHED") return null;
  db().prepare(`
    UPDATE client_reports
    SET status='RETRACTED', retracted_by=?, retracted_at=datetime('now')
    WHERE id=?
  `).run(opts.actorId, opts.reportId);
  audit(opts.actorId, "CLIENT_REPORT_RETRACTED", opts.reportId, {
    firmId: opts.firmId, clientId: existing.client_id,
  });
  return getReport(opts.reportId);
}

export function markReportViewed(opts: {
  reportId: string; clientId: string; userId: string; firmId: string;
}) {
  const report = getPublishedReport(opts.reportId, opts.clientId);
  if (!report) return;
  recordPortalEvent({
    firmId: opts.firmId,
    clientId: opts.clientId,
    userId: opts.userId,
    eventType: "CLIENT_REPORT_VIEWED",
    resourceType: "client_report",
    resourceId: opts.reportId,
  });
}

/** Snapshot integrity: content JSON must not change after publish when books change. */
export function reportContentFingerprint(reportId: string): string {
  const r: any = db().prepare(
    "SELECT content_snapshot, branding_snapshot FROM client_reports WHERE id=?",
  ).get(reportId);
  if (!r) return "";
  return `${r.content_snapshot.length}:${r.branding_snapshot.length}`;
}

export function draftInsightsFromRelease(clientId: string, periodId: string, actorId: string) {
  const periods = lockedStatements(clientId);
  const cur = periods.find((p) => p.periodId === periodId);
  if (!cur) throw new Error("No published period.");
  const release = activeRelease(periodId);
  const existing = listInsights({ clientId }).filter(
    (i) => i.periodId === periodId && i.status !== "ARCHIVED",
  );
  if (existing.length) return existing;

  const body = (cur.notes.find((n) => n.slot === "WHAT_CHANGED")?.body)
    || `Published performance for ${cur.label}: revenue ${formatMoneyK(cur.revenue)}, gross margin ${formatPct(cur.grossMarginPct)}.`;
  return [createInsight({
    clientId,
    periodId,
    releaseId: release?.id || null,
    title: `${cur.label} performance`,
    section: "PERFORMANCE",
    body,
    sourceRefs: [{ type: "financial_release", id: release?.id || undefined, title: cur.label }],
    actorId,
  })];
}
