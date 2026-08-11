/**
 * Durable financial signals — distinct from accounting exceptions.
 * Deduped by (client, period, signal_key). Recalculation supersedes stale rows.
 */

import { db, uid } from "../db";
import { audit } from "../auth";
import type { PeriodMetrics } from "../metrics";
import { detectAnomalies, DEFAULT_POLICIES, type SignalPolicy } from "./anomalies";
import { FI_ENGINE_VERSION, FI_POLICY_VERSION, type FinancialSignal, type SignalStatus } from "./types";

function rowSignal(r: any): FinancialSignal {
  const parse = <T>(s: string, fb: T): T => {
    try { return JSON.parse(s || "null") ?? fb; } catch { return fb; }
  };
  return {
    id: r.id,
    firmId: r.firm_id,
    clientId: r.client_id,
    periodId: r.period_id,
    signalKey: r.signal_key,
    signalType: r.signal_type,
    metricKey: r.metric_key,
    severity: r.severity,
    title: r.title,
    detectedValue: r.detected_value,
    referenceValue: r.reference_value,
    difference: r.difference,
    differencePct: r.difference_pct,
    method: r.method,
    threshold: r.threshold,
    status: r.status,
    sourceRefs: parse(r.source_refs_json, []),
    detail: parse(r.detail_json, {}),
    engineVersion: r.engine_version,
    detectedAt: r.detected_at,
  };
}

export function loadPolicies(firmId: string, clientId?: string | null): SignalPolicy[] {
  const rows: any[] = db().prepare(`
    SELECT * FROM financial_signal_policies
    WHERE firm_id=? AND enabled=1
      AND (client_id IS NULL OR client_id=?)
    ORDER BY client_id IS NOT NULL DESC
  `).all(firmId, clientId || null);
  if (!rows.length) return DEFAULT_POLICIES;
  // Client overrides replace same metric+method firm defaults
  const map = new Map<string, SignalPolicy>();
  for (const p of DEFAULT_POLICIES) map.set(`${p.metricKey}:${p.method}:${p.severity}`, p);
  for (const r of rows) {
    map.set(`${r.metric_key}:${r.method}:${r.severity}`, {
      metricKey: r.metric_key,
      method: r.method,
      threshold: r.threshold,
      severity: r.severity,
      enabled: !!r.enabled,
    });
  }
  return Array.from(map.values());
}

export function ensureDefaultPolicies(firmId: string) {
  for (const p of DEFAULT_POLICIES) {
    const existing = db().prepare(`
      SELECT id FROM financial_signal_policies
      WHERE firm_id=? AND client_id IS NULL AND metric_key=? AND method=?
    `).get(firmId, p.metricKey, p.method);
    if (existing) continue;
    db().prepare(`
      INSERT INTO financial_signal_policies
        (id, firm_id, client_id, metric_key, method, threshold, severity, enabled)
      VALUES (?,?,NULL,?,?,?,?,1)
    `).run(uid(), firmId, p.metricKey, p.method, p.threshold, p.severity);
  }
}

export function listSignals(opts: {
  firmId: string;
  clientId?: string;
  periodId?: string;
  status?: string;
}): FinancialSignal[] {
  let sql = `SELECT * FROM financial_signals WHERE firm_id=?`;
  const params: any[] = [opts.firmId];
  if (opts.clientId) { sql += ` AND client_id=?`; params.push(opts.clientId); }
  if (opts.periodId) { sql += ` AND period_id=?`; params.push(opts.periodId); }
  if (opts.status) { sql += ` AND status=?`; params.push(opts.status); }
  sql += ` ORDER BY detected_at DESC LIMIT 200`;
  return (db().prepare(sql).all(...params) as any[]).map(rowSignal);
}

export function syncSignalsForPeriod(opts: {
  firmId: string;
  clientId: string;
  periodId: string;
  history: PeriodMetrics[];
  actorId: string;
}): FinancialSignal[] {
  ensureDefaultPolicies(opts.firmId);
  const policies = loadPolicies(opts.firmId, opts.clientId);
  const findings = detectAnomalies(opts.history, opts.periodId, policies);
  const liveKeys = new Set<string>();

  for (const f of findings) {
    const signalKey = `${f.metricKey}:${f.method}:${f.severity}`;
    liveKeys.add(signalKey);
    const existing: any = db().prepare(`
      SELECT id, status FROM financial_signals
      WHERE client_id=? AND period_id=? AND signal_key=?
    `).get(opts.clientId, opts.periodId, signalKey);

    const sourceRefs = JSON.stringify([
      { type: "financial_period", id: opts.periodId, title: f.label },
    ]);
    const detail = JSON.stringify({
      detail: f.detail,
      unit: f.unit,
      policyVersion: FI_POLICY_VERSION,
    });

    if (existing) {
      if (existing.status === "DISMISSED" || existing.status === "REVIEWED") {
        // Keep human disposition; refresh values
        db().prepare(`
          UPDATE financial_signals SET
            detected_value=?, reference_value=?, difference=?, difference_pct=?,
            title=?, threshold=?, source_refs_json=?, detail_json=?,
            engine_version=?, detected_at=datetime('now')
          WHERE id=?
        `).run(
          f.currentValue, f.referenceValue, f.difference, f.differencePct,
          f.title, f.threshold, sourceRefs, detail, FI_ENGINE_VERSION, existing.id,
        );
      } else {
        db().prepare(`
          UPDATE financial_signals SET
            severity=?, title=?, detected_value=?, reference_value=?, difference=?,
            difference_pct=?, threshold=?, status='NEW', source_refs_json=?,
            detail_json=?, engine_version=?, detected_at=datetime('now')
          WHERE id=?
        `).run(
          f.severity, f.title, f.currentValue, f.referenceValue, f.difference,
          f.differencePct, f.threshold, sourceRefs, detail, FI_ENGINE_VERSION, existing.id,
        );
      }
    } else {
      const id = uid();
      db().prepare(`
        INSERT INTO financial_signals
          (id, firm_id, client_id, period_id, signal_key, signal_type, metric_key,
           severity, title, detected_value, reference_value, difference, difference_pct,
           method, threshold, status, source_refs_json, detail_json, policy_version, engine_version)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'NEW',?,?,?,?)
      `).run(
        id, opts.firmId, opts.clientId, opts.periodId, signalKey, f.method, f.metricKey,
        f.severity, f.title, f.currentValue, f.referenceValue, f.difference, f.differencePct,
        f.method, f.threshold, sourceRefs, detail, FI_POLICY_VERSION, FI_ENGINE_VERSION,
      );
      audit(opts.actorId, "FINANCIAL_SIGNAL_DETECTED", `${signalKey}:${opts.periodId}`, {
        firmId: opts.firmId, clientId: opts.clientId,
      });
    }
  }

  // Supersede signals that no longer fire
  const existing = listSignals({
    firmId: opts.firmId, clientId: opts.clientId, periodId: opts.periodId,
  });
  for (const s of existing) {
    if (!liveKeys.has(s.signalKey) && s.status !== "SUPERSEDED" && s.status !== "DISMISSED") {
      db().prepare(`
        UPDATE financial_signals SET status='SUPERSEDED' WHERE id=?
      `).run(s.id);
    }
  }

  return listSignals({
    firmId: opts.firmId, clientId: opts.clientId, periodId: opts.periodId,
  }).filter((s) => s.status !== "SUPERSEDED");
}

export function setSignalStatus(opts: {
  signalId: string;
  firmId: string;
  status: SignalStatus;
  userId: string;
}): FinancialSignal | null {
  const row: any = db().prepare(
    "SELECT * FROM financial_signals WHERE id=? AND firm_id=?",
  ).get(opts.signalId, opts.firmId);
  if (!row) return null;
  db().prepare(`
    UPDATE financial_signals
    SET status=?, reviewed_by=?, reviewed_at=datetime('now')
    WHERE id=?
  `).run(opts.status, opts.userId, opts.signalId);
  audit(opts.userId, `FINANCIAL_SIGNAL_${opts.status}`, opts.signalId, {
    firmId: opts.firmId, clientId: row.client_id,
  });
  return rowSignal(db().prepare("SELECT * FROM financial_signals WHERE id=?").get(opts.signalId));
}
