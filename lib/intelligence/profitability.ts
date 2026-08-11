/**
 * Profitability — entity direct margins are WORKING.
 * Customer / project / job / location are UNAVAILABLE (no schema).
 * AR payer rows are receivable concentration, not customer P&L.
 */

import type { PeriodMetrics } from "../metrics";
import { activeAllocationRule, allocateCostPool } from "./allocation";
import { marginPct, r1 } from "./calc";
import type { DimensionAvailability, ProfitabilityReport, SourceQuality } from "./types";

export function dimensionAvailability(): Record<string, { status: DimensionAvailability; reason: string }> {
  return {
    Company: { status: "WORKING", reason: "Consolidated period metrics." },
    Entity: { status: "WORKING", reason: "Business entities with P&L and payroll." },
    Customer: {
      status: "UNAVAILABLE",
      reason: "No customer dimension in the ledger. AR payers are not costed customers.",
    },
    Project: { status: "UNAVAILABLE", reason: "No project/job costing tables." },
    Job: { status: "UNAVAILABLE", reason: "Volume units may be labeled jobs; they are not job P&Ls." },
    Location: { status: "UNAVAILABLE", reason: "No location dimension." },
    Department: { status: "UNAVAILABLE", reason: "No department dimension." },
  };
}

export function entityProfitability(
  m: PeriodMetrics,
  clientId: string,
  opts?: { allocateOpex?: boolean },
): ProfitabilityReport {
  const revenueTotal = m.revenue || 0;
  const rule = opts?.allocateOpex ? activeAllocationRule(clientId) : null;
  let allocMap = new Map<string, number>();
  let sourceQuality: SourceQuality = "DIRECT_SOURCE_DATA";
  let allocationMeta: ProfitabilityReport["allocation"] = {
    method: null, ruleId: null, version: null, pool: null,
  };

  if (rule && rule.allocationMethod !== "DIRECT" && m.opex) {
    const result = allocateCostPool({
      pool: m.opex,
      method: rule.allocationMethod as "REVENUE_SHARE" | "HOURS",
      entities: m.entities.map((e) => ({
        id: e.id, revenue: e.revenue, hoursPaid: e.payroll.hoursPaid,
      })),
    });
    if (result.ok) {
      allocMap = new Map(result.allocations.map((a) => [a.entityId, a.amount]));
      sourceQuality = "FULLY_ALLOCATED_DATA";
      allocationMeta = {
        method: rule.allocationMethod,
        ruleId: rule.id,
        version: rule.version,
        pool: m.opex,
      };
    } else {
      sourceQuality = "PARTIALLY_ALLOCATED_DATA";
      allocationMeta = {
        method: rule.allocationMethod,
        ruleId: rule.id,
        version: rule.version,
        pool: m.opex,
      };
    }
  }

  const rows = m.entities.map((e) => {
    const allocated = allocMap.has(e.id) ? allocMap.get(e.id)! : null;
    const gp = e.grossProfit;
    return {
      dimension: "ENTITY" as const,
      key: e.id,
      name: e.name,
      revenue: e.revenue,
      directCost: e.directCost,
      grossProfit: gp,
      grossMarginPct: marginPct(gp, e.revenue),
      allocatedOpex: allocated,
      contributionAfterAlloc: allocated == null ? null : r1(gp - allocated),
      revenueSharePct: revenueTotal ? r1((e.revenue / revenueTotal) * 100) : null,
      sourceQuality: allocated == null ? "DIRECT_SOURCE_DATA" as const : sourceQuality,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  const topShares = rows.map((r) => r.revenueSharePct || 0);
  const top1 = topShares[0] ?? null;
  const top5 = r1(topShares.slice(0, 5).reduce((s, n) => s + n, 0)) || null;

  return {
    dimension: "ENTITY",
    availability: "WORKING",
    sourceQuality,
    rows,
    concentration: {
      top1Pct: top1,
      top5Pct: top5,
      basis: "Entity share of consolidated revenue (not customer concentration).",
    },
    allocation: allocationMeta,
  };
}

/** Receivable concentration by payer — NOT customer profitability. */
export function arPayerConcentration(m: PeriodMetrics): ProfitabilityReport {
  const total = m.arTotal || 0;
  if (!m.ar.length) {
    return {
      dimension: "PAYER_AR",
      availability: "PARTIAL",
      reason: "No AR aging rows for this period.",
      sourceQuality: "INCOMPLETE_DATA",
      rows: [],
    };
  }
  // AR balance stored in `revenue` field for table reuse — UI labels it as AR, not revenue.
  const withBal = m.ar
    .map((a) => ({
      dimension: "PAYER_AR" as const,
      key: a.payer,
      name: a.payer,
      revenue: a.total, // AR balance, not revenue — UI must label
      directCost: 0,
      grossProfit: 0,
      grossMarginPct: null,
      allocatedOpex: null,
      contributionAfterAlloc: null,
      revenueSharePct: total ? r1((a.total / total) * 100) : null,
      sourceQuality: "DIRECT_SOURCE_DATA" as const,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const shares = withBal.map((r) => r.revenueSharePct || 0);

  return {
    dimension: "PAYER_AR",
    availability: "WORKING",
    reason: "AR payer aging concentration — not customer P&L. Direct costs are not payer-tagged.",
    sourceQuality: "DIRECT_SOURCE_DATA",
    rows: withBal,
    concentration: {
      top1Pct: shares[0] ?? null,
      top5Pct: r1(shares.slice(0, 5).reduce((s, n) => s + n, 0)) || null,
      basis: "Share of ending AR by payer.",
    },
  };
}
