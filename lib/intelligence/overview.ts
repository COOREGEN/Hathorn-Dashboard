/**
 * Assemble Financial Intelligence overview for a client period.
 */

import { db, uid } from "../db";
import { audit } from "../auth";
import { computePeriod, clientHistory } from "../metrics";
import { activeRelease } from "../release";
import { detectAnomalies } from "./anomalies";
import { cashIntelligence } from "./cash";
import { marginDriverNotes, opexDriverBridge, revenueDriverBridge } from "./drivers";
import { forecastIntelligence } from "./forecast";
import { arPayerConcentration, dimensionAvailability, entityProfitability } from "./profitability";
import { syncSignalsForPeriod } from "./signals";
import { computeTrend, CORE_METRICS, formatTrendDelta } from "./trends";
import {
  FI_ENGINE_VERSION, FI_POLICY_VERSION,
  type IntelligenceOverview, type IntelligenceReadiness,
} from "./types";
import { formatMoneyK, formatPct } from "./calc";

export function intelligenceReadiness(clientId: string): IntelligenceReadiness {
  const dims = dimensionAvailability();
  const hist = clientHistory(clientId, false);
  const hasPlLabels = hist.length
    ? Boolean(db().prepare(
      `SELECT 1 FROM pl_lines WHERE period_id=? AND category='OPEX' LIMIT 1`,
    ).get(hist[hist.length - 1].periodId))
    : false;
  const hasFpa = Boolean(db().prepare(
    "SELECT 1 FROM fpa_model_runs WHERE client_id=? AND status='OK' LIMIT 1",
  ).get(clientId));

  const notes: string[] = [];
  notes.push("Entity profitability: WORKING (direct margin).");
  notes.push("Customer / project / job / location profitability: UNAVAILABLE — no ledger dimensions.");
  if (!hasPlLabels) notes.push("OPEX label drivers: incomplete until OPEX lines exist.");
  if (hist.length < 24) {
    notes.push(`Seasonality requires ≥24 months of history (${hist.length} available) — deferred.`);
  }

  return {
    trends: hist.length >= 2 ? "WORKING" : "PARTIAL",
    cash: hist.length >= 1 ? "WORKING" : "UNAVAILABLE",
    signals: hist.length >= 2 ? "WORKING" : "PARTIAL",
    entityProfitability: "WORKING",
    customerProfitability: dims.Customer.status,
    projectJobCosting: dims.Project.status,
    locationProfitability: dims.Location.status,
    opexDrivers: hasPlLabels ? "WORKING" : "PARTIAL",
    forecastCompare: hasFpa || hist.length >= 3 ? "WORKING" : "PARTIAL",
    arReceivables: "WORKING",
    notes,
  };
}

export function buildIntelligenceOverview(opts: {
  firmId: string;
  clientId: string;
  periodId: string;
  actorId: string;
  sourceKind?: "working_ledger" | "financial_release";
  persistRun?: boolean;
  syncSignals?: boolean;
}): IntelligenceOverview {
  const sourceKind = opts.sourceKind || "working_ledger";
  const history = clientHistory(opts.clientId, sourceKind === "financial_release");
  let m = history.find((p) => p.periodId === opts.periodId);
  if (!m && sourceKind === "working_ledger") {
    m = computePeriod(opts.periodId);
  }
  if (!m) {
    throw new Error("Period not found or has no figures for the requested source.");
  }

  // When asking for release-based intelligence, prefer frozen figures if available
  let releaseId: string | null = null;
  if (sourceKind === "financial_release") {
    const rel = activeRelease(opts.periodId);
    releaseId = rel?.id || null;
    if (!rel) {
      throw new Error("No active published release for that period.");
    }
  }

  const idx = history.findIndex((p) => p.periodId === opts.periodId);
  const histThrough = idx >= 0 ? history.slice(0, idx + 1) : [...history, m];
  const prior = idx > 0 ? history[idx - 1] : null;

  const kpis = ["revenue", "grossMarginPct", "cash", "arTotal", "netIncome", "totalPayroll"]
    .map((key) => {
      const metric = CORE_METRICS.find((x) => x.key === key)!;
      const trend = computeTrend(histThrough, metric, "MoM", opts.periodId);
      const value = metric.get(m!);
      return {
        key,
        label: metric.label,
        value,
        formatted: metric.unit === "percent" ? formatPct(value) : formatMoneyK(value),
        trend,
      };
    });

  const anomalies = detectAnomalies(histThrough, opts.periodId);
  if (opts.syncSignals !== false) {
    syncSignalsForPeriod({
      firmId: opts.firmId,
      clientId: opts.clientId,
      periodId: opts.periodId,
      history: histThrough,
      actorId: opts.actorId,
    });
  }

  const profitability = entityProfitability(m, opts.clientId, { allocateOpex: true });
  const cash = cashIntelligence(histThrough, opts.periodId, "3m_avg");
  const drivers = [
    revenueDriverBridge(m, prior),
    opexDriverBridge(m, prior),
  ];
  // Attach margin notes onto opex bridge notes for advisor context
  drivers[1].notes.push(...marginDriverNotes(m, prior));

  const forecast = forecastIntelligence(opts.clientId, histThrough);
  const readiness = intelligenceReadiness(opts.clientId);
  const seasonality = histThrough.length >= 24
    ? {
        available: true as const,
        reason: "≥24 months available.",
        note: seasonalityNote(histThrough, m.month),
      }
    : {
        available: false as const,
        reason: `Seasonality requires ≥24 months; ${histThrough.length} available.`,
      };

  const overview: IntelligenceOverview = {
    clientId: opts.clientId,
    periodId: opts.periodId,
    periodLabel: m.label,
    sourceKind,
    engineVersion: FI_ENGINE_VERSION,
    kpis: kpis.map((k) => ({
      ...k,
      // expose delta string via trend
    })),
    signals: anomalies,
    profitability,
    cash,
    drivers,
    forecast,
    readiness,
    seasonality,
  };

  // Attach payer concentration into readiness notes (not fake customer P&L)
  const arConc = arPayerConcentration(m);
  if (arConc.concentration?.top1Pct != null) {
    overview.readiness.notes.push(
      `Top AR payer is ${arConc.concentration.top1Pct}% of ending receivables (not revenue concentration).`,
    );
  }

  if (opts.persistRun) {
    const sourceVersion = releaseId
      || `working:${opts.periodId}:${m.revenue}:${m.directCost}:${m.opex}:${m.cash.total}`;
    const id = uid();
    db().prepare(`
      INSERT INTO financial_intelligence_runs
        (id, firm_id, client_id, period_id, source_kind, source_release_id,
         source_data_version, engine_version, policy_version, results_json, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      id, opts.firmId, opts.clientId, opts.periodId, sourceKind, releaseId,
      String(sourceVersion), FI_ENGINE_VERSION, FI_POLICY_VERSION,
      JSON.stringify({
        kpis: overview.kpis.map((k) => ({
          key: k.key, value: k.value, delta: k.trend ? formatTrendDelta(k.trend) : null,
        })),
        signalCount: overview.signals.length,
        cash: overview.cash,
        forecastAvailable: overview.forecast.available,
      }),
      opts.actorId,
    );
    audit(opts.actorId, "INTELLIGENCE_ANALYSIS_RUN", id, {
      firmId: opts.firmId, clientId: opts.clientId,
    });
  }

  return overview;
}

function seasonalityNote(history: PeriodMetrics[], month: number): string {
  const same = history.filter((p) => p.month === month).map((p) => p.revenue);
  const all = history.map((p) => p.revenue).filter((r) => r > 0);
  if (same.length < 2 || !all.length) return "Insufficient same-month observations.";
  const avgMonth = same.reduce((a, b) => a + b, 0) / same.length;
  const avgAll = all.reduce((a, b) => a + b, 0) / all.length;
  if (!avgAll) return "Average revenue is zero.";
  const pct = Math.round(((avgMonth - avgAll) / avgAll) * 1000) / 10;
  const name = history.find((p) => p.month === month)?.label.split(" ")[0] || `Month ${month}`;
  return `${name} revenue historically runs ${pct >= 0 ? "+" : ""}${pct}% vs the monthly average across available history.`;
}
