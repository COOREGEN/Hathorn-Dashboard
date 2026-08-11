/**
 * Curated client overview — 4–6 metrics, approved insights, actions, latest report.
 * Never pulls working books or internal signals.
 */

import { brandingForClient, firmIdForClient } from "../tenancy";
import { lockedStatements } from "../statement";
import { activeRelease } from "../release";
import { formatMoneyK, formatPct } from "../intelligence/calc";
import { ensureDefaultMetrics, getPortalConfig, getPortalMetrics } from "./config";
import { listInsights } from "./insights";
import { listQuestions } from "./questions";
import { listReports } from "./reports";
import { listSharedScenarios } from "./scenarios";
import { listDocumentRequests, listClientVisibleDocuments } from "./documents";

function metricValue(p: any, key: string): number {
  if (key === "cash") return p.cash?.total ?? 0;
  return Number(p[key] ?? 0);
}

function formatMetric(key: string, value: number): string {
  if (["laborPct", "grossMarginPct", "netMarginPct"].includes(key) || key.endsWith("Pct")) {
    return formatPct(value);
  }
  return formatMoneyK(value);
}

export function buildClientOverview(clientId: string) {
  ensureDefaultMetrics(clientId);
  const modules = getPortalConfig(clientId);
  const brand = brandingForClient(clientId);
  const firmId = firmIdForClient(clientId);
  const periods = lockedStatements(clientId);
  const latest = periods.length ? periods[periods.length - 1] : null;
  const prior = periods.length > 1 ? periods[periods.length - 2] : null;
  const yoy = latest
    ? periods.find((p) => p.year === latest.year - 1 && p.month === latest.month) || null
    : null;

  const metrics = latest
    ? getPortalMetrics(clientId).filter((m) => m.visible).slice(0, 6).map((m) => {
        const value = metricValue(latest, m.metricKey);
        const cmp = m.comparisonMode === "YoY" ? yoy : prior;
        let delta: string | null = null;
        if (cmp) {
          const prev = metricValue(cmp, m.metricKey);
          if (["laborPct", "grossMarginPct", "netMarginPct"].includes(m.metricKey)) {
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
          comparisonMode: m.comparisonMode,
        };
      })
    : [];

  const release = latest ? activeRelease(latest.periodId) : null;
  const whatChanged = latest?.notes?.find((n) => n.slot === "WHAT_CHANGED")?.body
    || latest?.notes?.[0]?.body
    || null;

  const insights = modules.showInsights
    ? listInsights({ clientId, forClient: true }).slice(0, 5)
    : [];
  const questions = listQuestions({ clientId, forClient: true })
    .filter((q) => q.status === "PUBLISHED" || (q.status === "ANSWERED" && !q.responseBody))
    .slice(0, 5);
  const unanswered = listQuestions({ clientId, forClient: true })
    .filter((q) => q.status === "PUBLISHED" && !q.responseBody);
  const openRequests = modules.showDocuments
    ? listDocumentRequests({ clientId, openOnly: true }).filter((r) => r.status === "OPEN")
    : [];
  const latestReport = modules.showReports
    ? listReports({ clientId, forClient: true })[0] || null
    : null;
  const sharedScenario = modules.showPlanning
    ? listSharedScenarios(clientId)[0] || null
    : null;
  const docs = modules.showDocuments ? listClientVisibleDocuments(clientId).slice(0, 5) : [];

  const attention: { kind: string; id: string; title: string; href: string }[] = [];
  for (const q of unanswered) {
    attention.push({
      kind: "question", id: q.id, title: q.question,
      href: "/portal/insights",
    });
  }
  for (const r of openRequests) {
    attention.push({
      kind: "document_request", id: r.id, title: r.title,
      href: "/portal/documents",
    });
  }

  return {
    firmId,
    clientId,
    brand,
    modules,
    period: latest
      ? {
          periodId: latest.periodId,
          label: latest.label,
          year: latest.year,
          month: latest.month,
          releaseId: release?.id || null,
          releaseVersion: release?.version ?? null,
          amended: (release?.version ?? 1) > 1,
        }
      : null,
    metrics,
    whatChanged,
    insights,
    questions: unanswered,
    latestReport: latestReport
      ? {
          id: latestReport.id,
          title: latestReport.title,
          publishedAt: latestReport.publishedAt,
          periodLabel: latestReport.content.periodLabel,
        }
      : null,
    sharedScenario: sharedScenario
      ? {
          id: sharedScenario.id,
          scenario: sharedScenario.scenario,
          totals: sharedScenario.snapshot?.totals || null,
          disclaimer: sharedScenario.snapshot?.disclaimer || null,
        }
      : null,
    documents: docs.map((d) => ({
      id: d.id, filename: d.originalFilename, type: d.documentType, uploadedAt: d.uploadedAt,
    })),
    attention,
    periods: periods.map((p) => ({
      periodId: p.periodId, label: p.label, year: p.year, month: p.month,
    })),
  };
}
