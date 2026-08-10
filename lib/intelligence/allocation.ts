/**
 * Deterministic cost allocation — policy-driven, never AI-chosen.
 * Methods implemented: REVENUE_SHARE, HOURS. DIRECT is pass-through (no allocation).
 */

import { db, uid } from "../db";
import { allocateByWeights, r1, sum } from "./calc";

export type AllocationMethod = "DIRECT" | "REVENUE_SHARE" | "HOURS";

export type AllocationRule = {
  id: string;
  firmId: string;
  clientId: string;
  costPool: string;
  targetDimension: string;
  allocationMethod: AllocationMethod;
  driverKey: string | null;
  version: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  reason: string;
  createdBy: string;
  status: string;
};

function rowRule(r: any): AllocationRule {
  return {
    id: r.id,
    firmId: r.firm_id,
    clientId: r.client_id,
    costPool: r.cost_pool,
    targetDimension: r.target_dimension,
    allocationMethod: r.allocation_method,
    driverKey: r.driver_key,
    version: r.version,
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to,
    reason: r.reason || "",
    createdBy: r.created_by,
    status: r.status,
  };
}

export function listAllocationRules(clientId: string): AllocationRule[] {
  return (db().prepare(`
    SELECT * FROM cost_allocation_rules
    WHERE client_id=? AND status='ACTIVE'
    ORDER BY effective_from DESC
  `).all(clientId) as any[]).map(rowRule);
}

export function activeAllocationRule(
  clientId: string,
  asOf = new Date().toISOString().slice(0, 10),
): AllocationRule | null {
  const r: any = db().prepare(`
    SELECT * FROM cost_allocation_rules
    WHERE client_id=? AND status='ACTIVE'
      AND effective_from <= ?
      AND (effective_to IS NULL OR effective_to >= ?)
    ORDER BY version DESC LIMIT 1
  `).get(clientId, asOf, asOf);
  return r ? rowRule(r) : null;
}

export function createAllocationRule(input: {
  firmId: string;
  clientId: string;
  costPool: string;
  allocationMethod: AllocationMethod;
  effectiveFrom: string;
  reason: string;
  createdBy: string;
  driverKey?: string | null;
}): AllocationRule {
  const prev = activeAllocationRule(input.clientId, input.effectiveFrom);
  const version = (prev?.version || 0) + 1;
  if (prev) {
    db().prepare(`
      UPDATE cost_allocation_rules
      SET status='SUPERSEDED', effective_to=?, superseded_by=NULL
      WHERE id=?
    `).run(input.effectiveFrom, prev.id);
  }
  const id = uid();
  db().prepare(`
    INSERT INTO cost_allocation_rules
      (id, firm_id, client_id, cost_pool, target_dimension, allocation_method,
       driver_key, version, effective_from, reason, created_by, status)
    VALUES (?,?,?,?, 'ENTITY', ?, ?, ?, ?, ?, ?, 'ACTIVE')
  `).run(
    id, input.firmId, input.clientId, input.costPool, input.allocationMethod,
    input.driverKey || null, version, input.effectiveFrom, input.reason || "",
    input.createdBy,
  );
  if (prev) {
    db().prepare("UPDATE cost_allocation_rules SET superseded_by=? WHERE id=?").run(id, prev.id);
  }
  return listAllocationRules(input.clientId).find((r) => r.id === id)!;
}

/**
 * Allocate opex (or another pool amount) to entities.
 * Returns amounts that sum to the pool (within 0.1) when weights exist.
 */
export function allocateCostPool(opts: {
  pool: number;
  method: AllocationMethod;
  entities: { id: string; revenue: number; hoursPaid: number }[];
}): { allocations: { entityId: string; amount: number }[]; ok: boolean; note: string } {
  if (opts.method === "DIRECT") {
    return {
      allocations: opts.entities.map((e) => ({ entityId: e.id, amount: 0 })),
      ok: true,
      note: "DIRECT means no allocation — entity direct costs only.",
    };
  }
  const weights = opts.entities.map((e) => ({
    key: e.id,
    weight: opts.method === "HOURS" ? e.hoursPaid : e.revenue,
  }));
  if (!weights.some((w) => w.weight > 0)) {
    return {
      allocations: opts.entities.map((e) => ({ entityId: e.id, amount: 0 })),
      ok: false,
      note: "Allocation drivers are zero — cannot allocate.",
    };
  }
  const allocated = allocateByWeights(opts.pool, weights);
  const total = sum(allocated.map((a) => a.amount));
  const ok = Math.abs(r1(total - opts.pool)) <= 0.1;
  return {
    allocations: allocated.map((a) => ({ entityId: a.key, amount: a.amount })),
    ok,
    note: ok
      ? `Allocated ${opts.pool} by ${opts.method}; totals reconcile.`
      : `Allocation residual ${r1(total - opts.pool)} exceeds tolerance.`,
  };
}
