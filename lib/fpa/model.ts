/**
 * FP&A model runs — persistence and baseline assembly from trusted actuals.
 *
 * Reads PeriodMetrics / optional release id for provenance. Never writes actuals.
 */

import { db, uid } from "../db";
import { clientHistory, type PeriodMetrics } from "../metrics";
import { activeRelease } from "../release";
import { runForecast } from "./engine";
import {
  DEFAULT_ASSUMPTIONS, type Assumptions, type ActualPoint, type ModelRunRecord,
  type ModelRunInput, type ScenarioKey,
} from "./types";
import { validateAssumptions } from "./native-engine";

function toActual(p: PeriodMetrics): ActualPoint {
  return {
    year: p.year, month: p.month, label: p.label, periodId: p.periodId,
    revenue: p.revenue, directCost: p.directCost, grossProfit: p.grossProfit,
    opex: p.opex, netIncome: p.netIncome,
    cashTotal: p.cash?.total ?? null,
    kind: "ACTUAL",
  };
}

/** Latest published (or in-review for staff) periods for the planning baseline. */
export function loadBaseline(clientId: string, sourcePeriodId?: string) {
  const history = clientHistory(clientId, false)
    .filter((p) => ["PUBLISHED", "IN_REVIEW"].includes(p.status))
    .sort((a, b) => a.year - b.year || a.month - b.month);

  if (!history.length) return null;

  let baseline = history[history.length - 1];
  if (sourcePeriodId && sourcePeriodId.trim()) {
    const hit = history.find((p) => p.periodId === sourcePeriodId);
    if (!hit) throw new Error("Source period not found or not available for planning.");
    baseline = hit;
  }

  const throughBaseline = history.filter(
    (p) => p.year < baseline.year || (p.year === baseline.year && p.month <= baseline.month),
  );

  const release = activeRelease(baseline.periodId);
  return {
    clientId,
    history: throughBaseline.map(toActual),
    baseline: toActual(baseline),
    sourcePeriodId: baseline.periodId,
    sourceReleaseId: release?.id ?? null,
    sourceReleaseVersion: release?.version ?? null,
  };
}

export function defaultAssumptionsFromBaseline(baseline: ActualPoint): Assumptions {
  const margin = baseline.revenue > 0
    ? Math.round((baseline.grossProfit / baseline.revenue) * 1000) / 10
    : DEFAULT_ASSUMPTIONS.grossMarginPct;
  return {
    ...DEFAULT_ASSUMPTIONS,
    grossMarginPct: Math.min(95, Math.max(0, margin)),
  };
}

export async function createModelRun(
  input: ModelRunInput,
  actorId: string,
  preferForge = false,
): Promise<ModelRunRecord> {
  const base = loadBaseline(input.clientId, input.sourcePeriodId);
  if (!base) throw new Error("No actual periods available for this client.");

  const assumptionChecks = validateAssumptions({ ...input.assumptions, horizonMonths: 12 });
  const bad = assumptionChecks.find((c) => !c.pass);
  if (bad) throw new Error(bad.detail);

  // Freeze the release id that was current at run time.
  const sourceReleaseId = input.sourceReleaseId ?? base.sourceReleaseId;

  const engineOut = await runForecast({
    history: base.history,
    baseline: base.baseline,
    assumptions: input.assumptions,
    scenario: input.scenario,
    preferForge,
  });

  const ok = engineOut.checks.every((c) => c.pass) && engineOut.results.forecast.length > 0;
  const id = uid();
  const createdAt = new Date().toISOString();

  db().prepare(`
    INSERT INTO fpa_model_runs
      (id, client_id, source_period_id, source_release_id, scenario, engine, engine_version,
       assumptions_json, results_json, checks_json, status, analysis, created_by, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, input.clientId, base.sourcePeriodId, sourceReleaseId,
    input.scenario, engineOut.engine, engineOut.engineVersion,
    JSON.stringify(input.assumptions),
    JSON.stringify(engineOut.results),
    JSON.stringify(engineOut.checks),
    ok ? "OK" : "FAILED",
    null,
    actorId,
    createdAt,
  );

  return {
    id, clientId: input.clientId, sourcePeriodId: base.sourcePeriodId,
    sourceReleaseId, scenario: input.scenario,
    engine: engineOut.engine, engineVersion: engineOut.engineVersion,
    assumptions: input.assumptions, results: engineOut.results,
    checks: engineOut.checks, status: ok ? "OK" : "FAILED",
    analysis: null, createdBy: actorId, createdAt,
  };
}

export function getModelRun(id: string): ModelRunRecord | null {
  const r: any = db().prepare("SELECT * FROM fpa_model_runs WHERE id=?").get(id);
  if (!r) return null;
  return rowToRun(r);
}

export function listModelRuns(clientId: string, limit = 20): ModelRunRecord[] {
  const rows: any[] = db().prepare(
    `SELECT * FROM fpa_model_runs WHERE client_id=? ORDER BY created_at DESC LIMIT ?`,
  ).all(clientId, limit);
  return rows.map(rowToRun);
}

export function saveAnalysis(runId: string, analysis: string) {
  db().prepare("UPDATE fpa_model_runs SET analysis=? WHERE id=?").run(analysis, runId);
}

function rowToRun(r: any): ModelRunRecord {
  return {
    id: r.id, clientId: r.client_id, sourcePeriodId: r.source_period_id,
    sourceReleaseId: r.source_release_id, scenario: r.scenario as ScenarioKey,
    engine: r.engine, engineVersion: r.engine_version,
    assumptions: JSON.parse(r.assumptions_json),
    results: JSON.parse(r.results_json),
    checks: JSON.parse(r.checks_json),
    status: r.status, analysis: r.analysis, createdBy: r.created_by, createdAt: r.created_at,
  };
}

/** Probe: confirm no mutation of accounting tables after a run (used by tests). */
export function accountingFingerprint(clientId: string) {
  const d = db();
  const periods = (d.prepare("SELECT COUNT(*) n FROM periods WHERE client_id=?").get(clientId) as any).n;
  const pl = (d.prepare(
    `SELECT COUNT(*) n FROM pl_lines WHERE period_id IN (SELECT id FROM periods WHERE client_id=?)`,
  ).get(clientId) as any).n;
  const releases = (d.prepare(
    `SELECT COUNT(*) n, COALESCE(SUM(length(snapshot)),0) bytes FROM release_records WHERE client_id=?`,
  ).get(clientId) as any);
  return { periods, pl, releaseCount: releases.n, releaseBytes: releases.bytes };
}

