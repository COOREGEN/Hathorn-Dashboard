/**
 * Approved Copilot tool registry — intentional, read-only, authorized.
 * The model never receives SQL, credentials, or write capabilities.
 */

import { db } from "../../db";
import { AuthError } from "../../auth";
import { ValidationError } from "../../validate";
import { config } from "../../config";
import { computePeriod, clientHistory } from "../../metrics";
import { activeRelease, releaseHistory } from "../../release";
import { listModelRuns, getModelRun } from "../../fpa/model";
import { forgeStatus } from "../../fpa/engine";
import { listDocuments, latestExtraction } from "../../documents/model";
import { documentIntelligenceStatus } from "../../documents/engine";
import {
  listReconciliations, packSummary, getReconciliation, reconciliationEnabled,
} from "../../reconciliation/model";
import {
  firmClosePortfolio, getCloseRunForPeriod, closeBundle, listFirmExceptions,
  closeAutomationEnabled,
} from "../../close";
import { hubDashboard, integrationHubEnabled, capabilityReadiness } from "../../integrations/model";
import { listIssues as listTaxIssues, issueBundle as taxIssueBundle, taxIntelligenceEnabled } from "../../tax/model";
import { factGraphStatus } from "../../tax/fact-graph";
import {
  listIssues as listResearchIssues, issueBundle as researchIssueBundle,
  listSources, accountingGuidanceEnabled,
} from "../../research/model";
import { ragflowStatus } from "../../research/ragflow";
import { loadPortfolio, assessClient } from "../../portfolio";
import { listClientsForFirm } from "../../tenancy";
import { cite, sanitizeForPrompt } from "./citations";
import { formatK, formatPct, marginPct, varianceBlock } from "./calc";
import type { CopilotContext, CopilotToolResult, ToolTrace } from "./types";
import { canUseTool } from "./permissions";

export type ToolArgs = Record<string, unknown>;

type ToolDef = {
  name: string;
  label: string;
  description: string;
  run: (ctx: CopilotContext, args: ToolArgs) => Promise<CopilotToolResult> | CopilotToolResult;
};

function requireClient(ctx: CopilotContext, clientId?: string | null): string {
  const id = clientId || ctx.clientId;
  if (!id) throw new ValidationError("clientId is required for this question.");
  // Ownership: client's firm must match session firm; staff membership already bound.
  const row: any = db().prepare("SELECT firm_id FROM clients WHERE id=?").get(id);
  if (!row?.firm_id || row.firm_id !== ctx.firmId) {
    throw new AuthError(403, "Resource not found.");
  }
  if (ctx.audience === "CLIENT" && ctx.clientId !== id) {
    throw new AuthError(403, "Resource not found.");
  }
  // Staff: membership already required to have firmId; verify membership still active.
  if (ctx.audience === "STAFF") {
    const mem: any = db().prepare(
      `SELECT 1 FROM firm_memberships WHERE user_id=? AND firm_id=? AND status='ACTIVE'`,
    ).get(ctx.userId, ctx.firmId);
    if (!mem) throw new AuthError(403, "Resource not found.");
  }
  return id;
}

function resolvePeriodId(clientId: string, args: ToolArgs, ctx: CopilotContext): {
  periodId: string; year: number; month: number; status: string; label: string;
} | null {
  if (args.periodId || ctx.periodId) {
    const pid = String(args.periodId || ctx.periodId);
    const p: any = db().prepare(
      "SELECT id, year, month, status FROM periods WHERE id=? AND client_id=?",
    ).get(pid, clientId);
    if (!p) return null;
    return {
      periodId: p.id, year: p.year, month: p.month, status: p.status,
      label: `${p.year}-${String(p.month).padStart(2, "0")}`,
    };
  }
  const y = args.year != null ? Number(args.year) : ctx.year;
  const m = args.month != null ? Number(args.month) : ctx.month;
  if (y && m) {
    const p: any = db().prepare(
      "SELECT id, year, month, status FROM periods WHERE client_id=? AND year=? AND month=?",
    ).get(clientId, y, m);
    if (!p) return null;
    return {
      periodId: p.id, year: p.year, month: p.month, status: p.status,
      label: `${p.year}-${String(p.month).padStart(2, "0")}`,
    };
  }
  // Latest with figures
  const hist = clientHistory(clientId, ctx.audience === "CLIENT");
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i].revenue || hist[i].directCost) {
      return {
        periodId: hist[i].periodId, year: hist[i].year, month: hist[i].month,
        status: hist[i].status, label: hist[i].label,
      };
    }
  }
  return hist.length
    ? {
        periodId: hist[hist.length - 1].periodId,
        year: hist[hist.length - 1].year,
        month: hist[hist.length - 1].month,
        status: hist[hist.length - 1].status,
        label: hist[hist.length - 1].label,
      }
    : null;
}

const TOOLS: ToolDef[] = [
  {
    name: "resolvePeriod",
    label: "Period resolution",
    description: "Resolve this month / last month / explicit year-month to a period id.",
    run: (ctx, args) => {
      const clientId = requireClient(ctx, args.clientId as string | undefined);
      const phrase = String(args.phrase || "").toLowerCase();
      const now = new Date();
      let year = args.year != null ? Number(args.year) : ctx.year || null;
      let month = args.month != null ? Number(args.month) : ctx.month || null;
      if (!year || !month) {
        if (phrase.includes("last month") || phrase.includes("prior month")) {
          const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          year = d.getFullYear();
          month = d.getMonth() + 1;
        } else if (phrase.includes("this month") || phrase.includes("current month")) {
          year = now.getFullYear();
          month = now.getMonth() + 1;
        }
      }
      const resolved = resolvePeriodId(clientId, { ...args, year, month }, ctx);
      if (!resolved) {
        return {
          ok: true, sourceStatus: "INSUFFICIENT_DATA",
          data: { clientId, year, month, found: false },
          warnings: ["No matching period found for that client."],
        };
      }
      return {
        ok: true,
        data: { clientId, ...resolved, found: true },
        citations: [cite({
          sourceType: "financial_period", sourceId: resolved.periodId,
          title: `Period ${resolved.label}`, clientId, period: resolved.label,
        })],
      };
    },
  },
  {
    name: "getFinancialSummary",
    label: "Financials",
    description: "Working/current financial summary for a client period (ledger figures).",
    run: (ctx, args) => {
      const clientId = requireClient(ctx, args.clientId as string | undefined);
      if (ctx.audience === "CLIENT") {
        return { ok: false, error: "Working books are not available in the client Copilot.", sourceStatus: "UNAVAILABLE" };
      }
      const period = resolvePeriodId(clientId, args, ctx);
      if (!period) {
        return { ok: true, sourceStatus: "INSUFFICIENT_DATA", data: null, warnings: ["No period available."] };
      }
      const m = computePeriod(period.periodId);
      const hist = clientHistory(clientId, false);
      const idx = hist.findIndex((p) => p.periodId === period.periodId);
      const prior = idx > 0 ? hist[idx - 1] : null;
      const gm = marginPct(m.grossProfit, m.revenue);
      const priorGm = prior ? marginPct(prior.grossProfit, prior.revenue) : null;
      const variances = prior ? [
        varianceBlock({ label: "Revenue", current: m.revenue, prior: prior.revenue }),
        varianceBlock({ label: "Direct cost", current: m.directCost, prior: prior.directCost }),
        varianceBlock({
          label: "Gross margin",
          current: gm ?? 0,
          prior: priorGm ?? 0,
          unit: "points",
        }),
        varianceBlock({ label: "Net income", current: m.netIncome, prior: prior.netIncome }),
      ] : [];
      const release = activeRelease(period.periodId);
      const warnings: string[] = [];
      if (release && period.status === "PUBLISHED") {
        /* ok */
      } else if (period.status !== "PUBLISHED") {
        warnings.push(`These are working/current figures (${period.status}), not a published client release.`);
      }
      return {
        ok: true,
        sourceStatus: "SUPPORTED_BY_SOURCE_DATA",
        data: {
          sourceKind: "working_ledger",
          clientId,
          period: period.label,
          periodId: period.periodId,
          status: period.status,
          revenue: m.revenue,
          directCost: m.directCost,
          grossProfit: m.grossProfit,
          grossMarginPct: gm,
          opex: m.opex,
          netIncome: m.netIncome,
          laborPct: m.laborPct,
          cash: m.cash,
          arTotal: m.arTotal,
          formatted: {
            revenue: formatK(m.revenue),
            directCost: formatK(m.directCost),
            grossProfit: formatK(m.grossProfit),
            grossMarginPct: formatPct(gm),
            netIncome: formatK(m.netIncome),
            cash: formatK(m.cash.total),
            arTotal: formatK(m.arTotal),
          },
          vsPrior: variances,
          priorPeriod: prior?.label ?? null,
          publishedReleaseActive: Boolean(release),
        },
        citations: [cite({
          sourceType: "financial_period", sourceId: period.periodId,
          title: `Working figures ${period.label}`, clientId, period: period.label,
        })],
        warnings,
      };
    },
  },
  {
    name: "getPublishedRelease",
    label: "Published release",
    description: "Immutable published financial release for a period.",
    run: (ctx, args) => {
      const clientId = requireClient(ctx, args.clientId as string | undefined);
      const period = resolvePeriodId(clientId, args, ctx);
      if (!period) {
        return { ok: true, sourceStatus: "INSUFFICIENT_DATA", data: null, warnings: ["No period available."] };
      }
      const rel = activeRelease(period.periodId);
      if (!rel) {
        const hist = releaseHistory(period.periodId);
        return {
          ok: true,
          sourceStatus: "INSUFFICIENT_DATA",
          data: { periodId: period.periodId, published: false, historyCount: hist.length },
          warnings: ["No active published release for that period."],
        };
      }
      const snap: any = rel.snapshot && typeof rel.snapshot === "object"
        ? rel.snapshot
        : (() => { try { return JSON.parse(String(rel.snapshot)); } catch { return {}; } })();
      const figures = snap.figures || {};
      return {
        ok: true,
        sourceStatus: "SUPPORTED_BY_SOURCE_DATA",
        data: {
          sourceKind: "financial_release",
          clientId,
          period: period.label,
          periodId: period.periodId,
          releaseId: rel.id,
          version: rel.version,
          publishedAt: rel.publishedAt,
          checksum: rel.checksum,
          revenue: figures.revenue,
          directCost: figures.directCost,
          grossProfit: figures.grossProfit,
          grossMarginPct: figures.grossMarginPct,
          netIncome: figures.netIncome,
          cash: figures.cash,
          arTotal: figures.arTotal,
          commentary: (snap.commentary || []).slice(0, 6),
          disclosure: snap.disclosure || null,
        },
        citations: [cite({
          sourceType: "financial_release", sourceId: rel.id,
          title: `Financial Release ${period.label} v${rel.version}`,
          clientId, period: period.label,
        })],
      };
    },
  },
  {
    name: "getMetricHistory",
    label: "Metric history",
    description: "Monthly series for revenue, margin, labor, cash from client history.",
    run: (ctx, args) => {
      const clientId = requireClient(ctx, args.clientId as string | undefined);
      const publishedOnly = ctx.audience === "CLIENT" || Boolean(args.publishedOnly);
      const hist = clientHistory(clientId, publishedOnly).slice(-12);
      const series = hist.map((p) => ({
        periodId: p.periodId,
        label: p.label,
        status: p.status,
        revenue: p.revenue,
        grossMarginPct: p.grossMarginPct,
        laborPct: p.laborPct,
        netIncome: p.netIncome,
        cash: p.cash.total,
        arTotal: p.arTotal,
      }));
      return {
        ok: true,
        sourceStatus: series.length ? "SUPPORTED_BY_SOURCE_DATA" : "INSUFFICIENT_DATA",
        data: { clientId, publishedOnly, months: series },
        citations: series.slice(-3).map((s) => cite({
          sourceType: publishedOnly ? "financial_release" : "financial_period",
          sourceId: s.periodId,
          title: s.label,
          clientId,
          period: s.label,
        })),
      };
    },
  },
  {
    name: "getPlanningScenario",
    label: "Planning",
    description: "Read saved FP&A model runs (not freeform formula execution).",
    run: (ctx, args) => {
      const clientId = requireClient(ctx, args.clientId as string | undefined);
      const runId = args.runId ? String(args.runId) : null;
      const forge = forgeStatus();
      if (runId) {
        const run = getModelRun(runId);
        if (!run || run.clientId !== clientId) {
          return { ok: false, error: "Model run not found.", sourceStatus: "INSUFFICIENT_DATA" };
        }
        return {
          ok: true,
          sourceStatus: run.engine === "forge" ? "SOURCE_VERIFICATION_REQUIRED" : "SUPPORTED_BY_SOURCE_DATA",
          warnings: run.engine === "forge"
            ? ["Forge is an experimental pilot — treat as non-authoritative."]
            : undefined,
          data: {
            id: run.id, scenario: run.scenario, engine: run.engine,
            assumptions: run.assumptions,
            baseline: run.results.baseline,
            totals: run.results.totals,
            checks: run.checks,
            createdAt: run.createdAt,
          },
          citations: [cite({
            sourceType: "fpa_model_run", sourceId: run.id,
            title: `FP&A ${run.scenario} (${run.engine})`, clientId,
          })],
        };
      }
      const runs = listModelRuns(clientId, 5).map((r) => ({
        id: r.id, scenario: r.scenario, engine: r.engine, createdAt: r.createdAt,
        status: r.status,
      }));
      return {
        ok: true,
        sourceStatus: runs.length ? "SUPPORTED_BY_SOURCE_DATA" : "INSUFFICIENT_DATA",
        data: { clientId, runs, forge: { enabled: forge.enabled, available: forge.available, reason: forge.reason } },
        warnings: forge.enabled && !forge.available
          ? [`Forge pilot blocked: ${forge.reason}`]
          : undefined,
      };
    },
  },
  {
    name: "searchDocuments",
    label: "Documents",
    description: "List/search source documents and latest extraction summaries.",
    run: (ctx, args) => {
      const clientId = requireClient(ctx, args.clientId as string | undefined);
      const q = String(args.query || "").toLowerCase().trim();
      const docs = listDocuments(clientId).slice(0, 40);
      const filtered = q
        ? docs.filter((d) =>
          d.originalFilename.toLowerCase().includes(q)
          || d.documentType.toLowerCase().includes(q)
          || (d.notes || "").toLowerCase().includes(q))
        : docs.slice(0, 12);
      const rows = filtered.slice(0, 8).map((d) => {
        const ext = latestExtraction(d.id);
        const structured = ext?.structuredResult as any;
        return {
          id: d.id,
          filename: d.originalFilename,
          type: d.documentType,
          status: d.status,
          periodId: d.periodId,
          uploadedAt: d.uploadedAt,
          extractionStatus: ext?.status ?? null,
          extractionSummary: structured
            ? sanitizeForPrompt(JSON.stringify(structured).slice(0, 400))
            : null,
        };
      });
      const intel = documentIntelligenceStatus();
      return {
        ok: true,
        sourceStatus: rows.length ? "SUPPORTED_BY_SOURCE_DATA" : "INSUFFICIENT_DATA",
        data: { clientId, documents: rows, intelligence: intel },
        citations: rows.map((r) => cite({
          sourceType: "document", sourceId: r.id,
          title: r.filename, clientId,
        })),
        warnings: rows.some((r) => r.extractionStatus && r.extractionStatus !== "OK")
          ? ["Some extractions are drafts or incomplete — never treat as posted actuals."]
          : undefined,
      };
    },
  },
  {
    name: "getReconciliationStatus",
    label: "Reconciliations",
    description: "Reconciliation pack / detail for a client period.",
    run: (ctx, args) => {
      const clientId = requireClient(ctx, args.clientId as string | undefined);
      if (!reconciliationEnabled()) {
        return { ok: false, error: "Reconciliation is disabled.", sourceStatus: "UNAVAILABLE" };
      }
      const period = resolvePeriodId(clientId, args, ctx);
      if (!period) {
        return { ok: true, sourceStatus: "INSUFFICIENT_DATA", warnings: ["No period."], data: null };
      }
      if (args.reconciliationId) {
        const bundle = reconciliationBundleSafe(String(args.reconciliationId), clientId);
        return bundle;
      }
      const pack = packSummary(clientId, period.periodId);
      const list = listReconciliations(clientId).filter((r) => r.periodId === period.periodId);
      return {
        ok: true,
        sourceStatus: "SUPPORTED_BY_SOURCE_DATA",
        data: {
          clientId,
          period: period.label,
          pack,
          reconciliations: list.map((r) => ({
            id: r.id, type: r.type, status: r.status,
            controlAmountCents: r.controlAmountCents,
            supportingAmountCents: r.supportingAmountCents,
            differenceCents: r.differenceCents,
          })),
        },
        citations: list.slice(0, 6).map((r) => cite({
          sourceType: "reconciliation", sourceId: r.id,
          title: `${r.type} reconciliation`, clientId, period: period.label,
        })),
      };
    },
  },
  {
    name: "getCloseStatus",
    label: "Close",
    description: "Close readiness for a client period or firm portfolio.",
    run: (ctx, args) => {
      if (!closeAutomationEnabled()) {
        return { ok: false, error: "Close automation is disabled.", sourceStatus: "UNAVAILABLE" };
      }
      if (args.firmWide || (!args.clientId && !ctx.clientId)) {
        const year = Number(args.year || ctx.year || new Date().getFullYear());
        const month = Number(args.month || ctx.month || new Date().getMonth() + 1);
        const portfolio = firmClosePortfolio(year, month, ctx.firmId);
        return {
          ok: true,
          sourceStatus: "SUPPORTED_BY_SOURCE_DATA",
          data: {
            firmWide: true, year, month,
            counts: portfolio.counts,
            clients: portfolio.clients.map((c) => ({
              clientId: c.clientId,
              clientName: c.clientName,
              closeStatus: c.closeStatus,
              blockers: c.blockers,
              whyNotClosed: c.whyNotClosed,
              progressPct: c.progressPct,
              closeRunId: c.closeRunId,
            })),
          },
          citations: [cite({
            sourceType: "close_run",
            title: `Close portfolio ${year}-${String(month).padStart(2, "0")}`,
          })],
        };
      }
      const clientId = requireClient(ctx, args.clientId as string | undefined);
      const period = resolvePeriodId(clientId, args, ctx);
      if (!period) {
        return { ok: true, sourceStatus: "INSUFFICIENT_DATA", warnings: ["No period."], data: null };
      }
      const run = getCloseRunForPeriod(clientId, period.periodId);
      if (!run) {
        return {
          ok: true,
          sourceStatus: "SUPPORTED_BY_SOURCE_DATA",
          data: {
            clientId, period: period.label, closeStatus: "NOT_STARTED",
            whyNotClosed: ["Close not started."],
          },
        };
      }
      const bundle = closeBundle(run.id);
      return {
        ok: true,
        sourceStatus: "SUPPORTED_BY_SOURCE_DATA",
        data: {
          clientId,
          period: period.label,
          closeRunId: run.id,
          closeStatus: run.status,
          summary: run.summary,
          whyNotClosed: run.summary?.whyNotClosed || [],
          blockers: (bundle?.items || [])
            .filter((i) => i.blocking && !["PASS", "WAIVED"].includes(i.status))
            .map((i) => ({ key: i.checkKey, title: i.title, status: i.status })),
          overdue: run.overdue,
        },
        citations: [cite({
          sourceType: "close_run", sourceId: run.id,
          title: `Close ${period.label}`, clientId, period: period.label,
        })],
      };
    },
  },
  {
    name: "getExceptions",
    label: "Exceptions",
    description: "Open/assigned accounting exceptions (staff internal).",
    run: (ctx, args) => {
      const clientId = args.clientId || ctx.clientId
        ? requireClient(ctx, args.clientId as string | undefined)
        : null;
      const rows = listFirmExceptions({
        firmId: ctx.firmId,
        clientId: clientId || undefined,
        status: args.status ? String(args.status) : undefined,
        blocking: args.blocking === true ? true : undefined,
        mineUserId: args.mine === true ? ctx.userId : undefined,
      }).slice(0, 40);
      return {
        ok: true,
        sourceStatus: "SUPPORTED_BY_SOURCE_DATA",
        data: {
          exceptions: rows.map((e) => ({
            id: e.id,
            clientId: e.clientId,
            clientName: e.clientName,
            type: e.type,
            severity: e.severity,
            title: e.title,
            status: e.status,
            blocking: e.blocking,
            subsystem: e.subsystem,
            period: e.year && e.month ? `${e.year}-${String(e.month).padStart(2, "0")}` : null,
          })),
        },
        citations: rows.slice(0, 8).map((e) => cite({
          sourceType: "exception", sourceId: e.id,
          title: e.title, clientId: e.clientId,
        })),
      };
    },
  },
  {
    name: "getIntegrationHealth",
    label: "Integrations",
    description: "Integration hub health and freshness (never credentials).",
    run: (ctx, args) => {
      if (!integrationHubEnabled()) {
        return { ok: false, error: "Integration Hub is disabled.", sourceStatus: "UNAVAILABLE" };
      }
      const clientId = requireClient(ctx, args.clientId as string | undefined);
      const dash = hubDashboard(clientId);
      const readiness = capabilityReadiness(clientId);
      const warnings: string[] = [];
      for (const c of dash.connections) {
        if (c.health === "STALE" || c.status === "RECONNECT_REQUIRED") {
          warnings.push(`${c.provider} is ${c.health || c.status}` +
            (c.lastSuccessfulSyncAt ? ` (last success ${c.lastSuccessfulSyncAt})` : ""));
        }
      }
      return {
        ok: true,
        sourceStatus: warnings.length ? "PARTIALLY_SUPPORTED" : "SUPPORTED_BY_SOURCE_DATA",
        data: {
          clientId,
          counts: dash.counts,
          readiness,
          connections: dash.connections.map((c) => ({
            id: c.id,
            provider: c.provider,
            status: c.status,
            health: c.health,
            lastSuccessfulSyncAt: c.lastSuccessfulSyncAt,
            lastErrorCode: c.lastErrorCode,
          })),
        },
        citations: dash.connections.map((c) => cite({
          sourceType: "integration", sourceId: c.id,
          title: `${c.provider} connection`, clientId,
        })),
        warnings,
      };
    },
  },
  {
    name: "getTaxIssue",
    label: "Tax research",
    description: "Tax Intelligence issues and authorities (staff).",
    run: (ctx, args) => {
      if (!taxIntelligenceEnabled()) {
        return { ok: false, error: "Tax Intelligence is disabled.", sourceStatus: "UNAVAILABLE" };
      }
      const fg = factGraphStatus();
      if (args.issueId) {
        const bundle = taxIssueBundle(String(args.issueId));
        if (!bundle) return { ok: false, error: "Not found.", sourceStatus: "INSUFFICIENT_DATA" };
        requireClient(ctx, bundle.issue.clientId);
        const draft = !["REVIEWED", "CLOSED", "FINAL"].includes(String(bundle.issue.status || "").toUpperCase());
        return {
          ok: true,
          sourceStatus: draft ? "DRAFT_NOT_FINAL" : "SUPPORTED_BY_SOURCE_DATA",
          warnings: [
            ...(draft ? ["This tax analysis is not finalized — draft only."] : []),
            ...(fg.enabled && !fg.available ? [`Fact Graph pilot blocked: ${fg.reason}`] : []),
          ],
          data: {
            issue: {
              id: bundle.issue.id,
              title: bundle.issue.title,
              taxYear: bundle.issue.taxYear,
              status: bundle.issue.status,
              entityType: bundle.issue.entityType,
            },
            facts: bundle.facts,
            authorities: bundle.authorities,
            ruleRuns: bundle.ruleRuns,
            missingFacts: bundle.missingFacts,
          },
          citations: [
            cite({
              sourceType: "tax_issue", sourceId: bundle.issue.id,
              title: bundle.issue.title, clientId: bundle.issue.clientId,
            }),
            ...bundle.authorities.slice(0, 6).map((a: any) => cite({
              sourceType: "tax_authority", sourceId: a.id || a.authorityId,
              title: a.title || a.citation || "Tax authority",
            })),
          ],
        };
      }
      const clientId = requireClient(ctx, args.clientId as string | undefined);
      const issues = listTaxIssues(clientId).slice(0, 10);
      return {
        ok: true,
        sourceStatus: issues.length ? "SUPPORTED_BY_SOURCE_DATA" : "INSUFFICIENT_DATA",
        data: { issues, factGraph: fg },
        citations: issues.map((i) => cite({
          sourceType: "tax_issue", sourceId: i.id, title: i.title, clientId,
        })),
      };
    },
  },
  {
    name: "searchAccountingGuidance",
    label: "Accounting guidance",
    description: "Technical accounting research sources/issues with rights.",
    run: (ctx, args) => {
      if (!accountingGuidanceEnabled()) {
        return { ok: false, error: "Accounting Guidance is disabled.", sourceStatus: "UNAVAILABLE" };
      }
      const rag = ragflowStatus();
      if (args.issueId) {
        const bundle = researchIssueBundle(String(args.issueId));
        if (!bundle) return { ok: false, error: "Not found.", sourceStatus: "INSUFFICIENT_DATA" };
        if (bundle.issue.clientId) requireClient(ctx, bundle.issue.clientId);
        const draft = !["REVIEWED", "CLOSED", "FINAL"].includes(String(bundle.issue.status || "").toUpperCase());
        const analysis = bundle.analysis;
        return {
          ok: true,
          sourceStatus: draft ? "DRAFT_NOT_FINAL" : (analysis ? "SUPPORTED_BY_SOURCE_DATA" : "INSUFFICIENT_DATA"),
          warnings: [
            ...(draft ? ["This technical analysis is a draft and has not been finalized."] : []),
            ...(rag.enabled ? ["RAGFlow retrieval is experimental/deferred — native sources preferred."] : []),
          ],
          data: {
            issue: {
              id: bundle.issue.id,
              title: bundle.issue.title,
              category: bundle.issue.category,
              status: bundle.issue.status,
            },
            sources: bundle.sources,
            analysis: analysis ? {
              status: (analysis as any).status,
              conclusion: (analysis as any).conclusion,
              citations: (analysis as any).citations,
            } : null,
          },
          citations: [
            cite({
              sourceType: "accounting_issue", sourceId: bundle.issue.id,
              title: bundle.issue.title, clientId: bundle.issue.clientId || undefined,
            }),
            ...bundle.sources.slice(0, 6).map((s: any) => cite({
              sourceType: "accounting_source", sourceId: s.id,
              title: s.title,
              section: s.sourceType || s.contentRights,
            })),
          ],
        };
      }
      const clientId = args.clientId || ctx.clientId
        ? requireClient(ctx, args.clientId as string | undefined)
        : null;
      const issues = listResearchIssues(clientId).slice(0, 10);
      const sources = listSources({ clientId }).slice(0, 12).map((s) => ({
        id: s.id, title: s.title, sourceType: s.sourceType, contentRights: s.contentRights, scope: s.scope,
      }));
      return {
        ok: true,
        sourceStatus: (issues.length || sources.length) ? "SUPPORTED_BY_SOURCE_DATA" : "INSUFFICIENT_DATA",
        data: { issues, sources, ragflow: rag },
        citations: sources.slice(0, 6).map((s) => cite({
          sourceType: "accounting_source", sourceId: s.id, title: s.title,
        })),
        warnings: !sources.length && !issues.length
          ? ["No authorized guidance sources found. Additional research required."]
          : undefined,
      };
    },
  },
  {
    name: "getClientPortfolioStatus",
    label: "Portfolio",
    description: "Firm-scoped client attention / status rows.",
    run: (ctx, args) => {
      const nameQ = String(args.clientName || args.query || "").toLowerCase().trim();
      const clients = listClientsForFirm(ctx.firmId);
      let ids = clients.map((c) => c.id);
      if (nameQ) {
        const matches = clients.filter((c) => c.name.toLowerCase().includes(nameQ));
        if (matches.length > 1) {
          return {
            ok: true,
            sourceStatus: "PARTIALLY_SUPPORTED",
            data: { ambiguous: true, matches: matches.map((m) => ({ id: m.id, name: m.name })) },
            warnings: ["Multiple clients match that name. Specify which client."],
          };
        }
        if (matches.length === 1) ids = [matches[0].id];
        else ids = [];
      }
      if (args.clientId) {
        const id = requireClient(ctx, String(args.clientId));
        ids = [id];
      }
      const rows = ids.slice(0, 30).map((id) => assessClient(id)).filter(Boolean);
      return {
        ok: true,
        sourceStatus: rows.length ? "SUPPORTED_BY_SOURCE_DATA" : "INSUFFICIENT_DATA",
        data: {
          clients: rows.map((r: any) => ({
            clientId: r.clientId,
            name: r.name,
            band: r.band,
            attention: r.attention,
            periodLabel: r.periodLabel,
            revenue: r.revenue,
            monthsBehind: r.monthsBehind,
            reasons: (r.reasons || []).slice(0, 4),
          })),
        },
        citations: [cite({ sourceType: "portfolio", title: "Firm portfolio assessment" })],
      };
    },
  },
  {
    name: "getAttentionDigest",
    label: "Attention digest",
    description: "What needs attention — blocked closes, exceptions, stale integrations.",
    run: (ctx, args) => {
      const year = Number(args.year || ctx.year || new Date().getFullYear());
      const month = Number(args.month || ctx.month || new Date().getMonth() + 1);
      const portfolio = closeAutomationEnabled()
        ? firmClosePortfolio(year, month, ctx.firmId)
        : { counts: {}, clients: [] as any[] };
      const exceptions = listFirmExceptions({
        firmId: ctx.firmId,
        mineUserId: args.mine === false ? undefined : ctx.userId,
        status: "OPEN",
      }).slice(0, 30);
      const blocking = listFirmExceptions({ firmId: ctx.firmId, blocking: true }).slice(0, 20);
      const clients = listClientsForFirm(ctx.firmId);
      const staleIntegrations: { clientId: string; clientName: string; provider: string; health: string }[] = [];
      if (integrationHubEnabled()) {
        for (const c of clients.slice(0, 40)) {
          try {
            const dash = hubDashboard(c.id);
            for (const conn of dash.connections) {
              if (conn.health === "STALE" || conn.status === "RECONNECT_REQUIRED") {
                staleIntegrations.push({
                  clientId: c.id, clientName: c.name,
                  provider: conn.provider, health: conn.health || conn.status,
                });
              }
            }
          } catch { /* skip */ }
        }
      }
      const book = loadPortfolio({}, new Date(), ctx.firmId);
      const urgent = book.rows.filter((r) => r.band === "urgent").slice(0, 10);
      return {
        ok: true,
        sourceStatus: "SUPPORTED_BY_SOURCE_DATA",
        data: {
          year, month,
          close: portfolio.counts,
          blockedCloses: (portfolio.clients || [])
            .filter((c: any) => c.closeStatus === "BLOCKED" || (c.whyNotClosed || []).length)
            .slice(0, 15),
          assignedExceptions: exceptions.length,
          blockingExceptions: blocking.length,
          exceptionSample: [...exceptions, ...blocking].slice(0, 12).map((e) => ({
            id: e.id, title: e.title, severity: e.severity, clientName: e.clientName,
          })),
          staleIntegrations,
          urgentClients: urgent.map((u) => ({
            clientId: u.clientId, name: u.name, attention: u.attention,
            headlines: u.reasons.slice(0, 3).map((r) => r.headline),
          })),
        },
        citations: [cite({ sourceType: "portfolio", title: "Attention digest" })],
      };
    },
  },
];

function reconciliationBundleSafe(id: string, clientId: string): CopilotToolResult {
  const recon = getReconciliation(id);
  if (!recon || recon.clientId !== clientId) {
    return { ok: false, error: "Not found.", sourceStatus: "INSUFFICIENT_DATA" };
  }
  return {
    ok: true,
    sourceStatus: "SUPPORTED_BY_SOURCE_DATA",
    data: {
      id: recon.id,
      type: recon.type,
      status: recon.status,
      controlAmountCents: recon.controlAmountCents,
      supportingAmountCents: recon.supportingAmountCents,
      differenceCents: recon.differenceCents,
      absoluteDifferenceCents: recon.absoluteDifferenceCents,
      percentageDifference: recon.percentageDifference,
      toleranceCents: recon.toleranceCents,
      toleranceSource: recon.toleranceSource,
    },
    citations: [cite({
      sourceType: "reconciliation", sourceId: recon.id,
      title: `${recon.type} reconciliation`, clientId,
    })],
  };
}

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

export function listToolCatalog(ctx: CopilotContext): { name: string; label: string; description: string }[] {
  return TOOLS
    .filter((t) => canUseTool(ctx, t.name))
    .map((t) => ({ name: t.name, label: t.label, description: t.description }));
}

export async function executeTool(
  ctx: CopilotContext,
  name: string,
  args: ToolArgs = {},
): Promise<{ result: CopilotToolResult; trace: ToolTrace }> {
  const start = Date.now();
  const def = BY_NAME.get(name);
  if (!def || !canUseTool(ctx, name)) {
    return {
      result: { ok: false, error: "Tool not available.", sourceStatus: "UNAVAILABLE" },
      trace: { tool: name, ok: false, ms: 0, error: "not available", label: name },
    };
  }
  try {
    const result = await def.run(ctx, args || {});
    return {
      result,
      trace: { tool: name, ok: result.ok, ms: Date.now() - start, label: def.label, error: result.error },
    };
  } catch (e: any) {
    const msg = e instanceof AuthError
      ? "Resource not found."
      : e instanceof ValidationError
        ? e.message
        : (e?.message || "Tool failed");
    return {
      result: { ok: false, error: msg, sourceStatus: "UNAVAILABLE" },
      trace: { tool: name, ok: false, ms: Date.now() - start, label: def.label, error: msg },
    };
  }
}

export function capabilityHealth() {
  return {
    planning: { state: "AVAILABLE" as const },
    documents: {
      state: config.documentIntelligence.enabled ? "AVAILABLE" as const : "AVAILABLE" as const,
      detail: "Extractions are drafts",
    },
    tax: {
      state: config.taxIntelligence.enabled ? "AVAILABLE" as const : "UNAVAILABLE" as const,
      factGraph: factGraphStatus(),
    },
    accountingGuidance: {
      state: config.accountingGuidance.enabled ? "AVAILABLE" as const : "UNAVAILABLE" as const,
      ragflow: ragflowStatus(),
    },
    reconciliations: {
      state: config.reconciliation.enabled ? "AVAILABLE" as const : "UNAVAILABLE" as const,
    },
    integrations: {
      state: config.integrationHub.enabled ? "AVAILABLE" as const : "UNAVAILABLE" as const,
    },
    close: {
      state: config.closeAutomation.enabled ? "AVAILABLE" as const : "UNAVAILABLE" as const,
    },
    forge: forgeStatus(),
    anthropic: { enabled: config.anthropic.enabled, model: config.anthropic.model },
  };
}
