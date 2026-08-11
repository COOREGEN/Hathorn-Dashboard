/**
 * Client-shared FP&A scenarios. Internal runs stay INTERNAL until explicitly shared.
 * Sharing freezes a client-safe snapshot so later edits do not rewrite what the client saw.
 */

import { db } from "../db";
import { audit } from "../auth";
import { getModelRun } from "../fpa/model";
import type { ScenarioVisibility } from "./types";

export type SharedScenario = {
  id: string;
  clientId: string;
  scenario: string;
  visibility: ScenarioVisibility;
  sharedAt: string | null;
  snapshot: {
    scenario: string;
    assumptions: Record<string, unknown>;
    totals: {
      forecastRevenue: number;
      forecastGrossProfit: number;
      forecastNetIncome: number;
      endingCash: number | null;
    };
    forecast: { year: number; month: number; label: string; revenue: number; netIncome: number }[];
    disclaimer: string;
    engine: string;
  } | null;
};

const DISCLAIMER =
  "Forecasts are based on assumptions and are not guarantees of future results.";

function parseShared(r: any): SharedScenario {
  let snapshot: SharedScenario["snapshot"] = null;
  if (r.shared_snapshot_json) {
    try { snapshot = JSON.parse(r.shared_snapshot_json); } catch { /* */ }
  }
  return {
    id: r.id,
    clientId: r.client_id,
    scenario: r.scenario,
    visibility: (r.visibility || "INTERNAL") as ScenarioVisibility,
    sharedAt: r.shared_at,
    snapshot,
  };
}

export function listSharedScenarios(clientId: string): SharedScenario[] {
  return (db().prepare(`
    SELECT * FROM fpa_model_runs
    WHERE client_id=? AND visibility='CLIENT_SHARED' AND status='OK'
    ORDER BY COALESCE(shared_at, created_at) DESC LIMIT 20
  `).all(clientId) as any[]).map(parseShared);
}

export function getSharedScenario(id: string, clientId: string): SharedScenario | null {
  const r: any = db().prepare(`
    SELECT * FROM fpa_model_runs
    WHERE id=? AND client_id=? AND visibility='CLIENT_SHARED' AND status='OK'
  `).get(id, clientId);
  return r ? parseShared(r) : null;
}

export function shareScenario(opts: {
  runId: string;
  firmId: string;
  actorId: string;
}): SharedScenario {
  const run = getModelRun(opts.runId);
  if (!run || run.status !== "OK") throw new Error("Model run not found or not OK.");
  const client: any = db().prepare("SELECT firm_id FROM clients WHERE id=?").get(run.clientId);
  if (!client || client.firm_id !== opts.firmId) throw new Error("Not found.");

  const last = run.results.forecast[run.results.forecast.length - 1];
  const snapshot = {
    scenario: run.scenario,
    assumptions: run.assumptions as unknown as Record<string, unknown>,
    totals: {
      forecastRevenue: run.results.totals.forecastRevenue,
      forecastGrossProfit: run.results.totals.forecastGrossProfit ?? 0,
      forecastNetIncome: run.results.totals.forecastNetIncome,
      endingCash: (last as any)?.cashTotal ?? run.results.totals.baselineCash ?? null,
    },
    forecast: run.results.forecast.map((f) => ({
      year: f.year, month: f.month, label: f.label,
      revenue: f.revenue, netIncome: f.netIncome,
    })),
    disclaimer: DISCLAIMER,
    engine: run.engine,
  };

  db().prepare(`
    UPDATE fpa_model_runs
    SET visibility='CLIENT_SHARED', shared_snapshot_json=?,
        shared_at=datetime('now'), shared_by=?
    WHERE id=?
  `).run(JSON.stringify(snapshot), opts.actorId, opts.runId);

  audit(opts.actorId, "CLIENT_SCENARIO_SHARED", opts.runId, {
    firmId: opts.firmId, clientId: run.clientId,
  });
  return getSharedScenario(opts.runId, run.clientId)!;
}

export function unshareScenario(opts: {
  runId: string; firmId: string; actorId: string;
}): boolean {
  const r: any = db().prepare("SELECT * FROM fpa_model_runs WHERE id=?").get(opts.runId);
  if (!r) return false;
  const client: any = db().prepare("SELECT firm_id FROM clients WHERE id=?").get(r.client_id);
  if (!client || client.firm_id !== opts.firmId) return false;
  db().prepare(`
    UPDATE fpa_model_runs SET visibility='INTERNAL' WHERE id=?
  `).run(opts.runId);
  audit(opts.actorId, "CLIENT_SCENARIO_UNSHARED", opts.runId, {
    firmId: opts.firmId, clientId: r.client_id,
  });
  return true;
}
