/**
 * Deterministic driver bridges from pl_lines labels and entities.
 * AI must not invent these slices.
 */

import { db } from "../db";
import type { PeriodMetrics } from "../metrics";
import { r1 } from "./calc";
import type { DriverBridge, DriverSlice } from "./types";

function labelTotals(periodId: string, category: string): Map<string, number> {
  const rows: any[] = db().prepare(`
    SELECT label, SUM(amount) total
    FROM pl_lines
    WHERE period_id=? AND category=?
    GROUP BY label
  `).all(periodId, category);
  return new Map(rows.map((r) => [String(r.label || "Other"), Number(r.total) || 0]));
}

function bridgeFromMaps(
  metricKey: string,
  label: string,
  current: Map<string, number>,
  prior: Map<string, number>,
  topN = 6,
): DriverBridge {
  const keys = Array.from(new Set(Array.from(current.keys()).concat(Array.from(prior.keys()))));
  const slices: DriverSlice[] = [];
  for (const key of keys) {
    const c = current.get(key) || 0;
    const p = prior.get(key) || 0;
    const delta = r1(c - p);
    if (delta === 0) continue;
    slices.push({ key, label: key, current: r1(c), prior: r1(p), delta });
  }
  slices.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top = slices.slice(0, topN);
  const other = r1(slices.slice(topN).reduce((s, x) => s + x.delta, 0));
  const totalDelta = r1(slices.reduce((s, x) => s + x.delta, 0));
  return {
    metricKey,
    label,
    totalDelta,
    slices: top,
    other,
    method: "Label-level SUM(pl_lines.amount) current vs prior period",
    notes: slices.length
      ? []
      : ["No label-level movement (or no prior period)."],
  };
}

export function opexDriverBridge(cur: PeriodMetrics, prior: PeriodMetrics | null): DriverBridge {
  if (!prior) {
    return {
      metricKey: "opex", label: "Overhead", totalDelta: 0, slices: [], other: 0,
      method: "Label-level SUM(pl_lines.amount)",
      notes: ["No prior period — cannot decompose movement."],
    };
  }
  return bridgeFromMaps(
    "opex",
    "Overhead",
    labelTotals(cur.periodId, "OPEX"),
    labelTotals(prior.periodId, "OPEX"),
  );
}

export function revenueDriverBridge(cur: PeriodMetrics, prior: PeriodMetrics | null): DriverBridge {
  if (!prior) {
    return {
      metricKey: "revenue", label: "Revenue", totalDelta: 0, slices: [], other: 0,
      method: "Entity revenue current vs prior",
      notes: ["No prior period — cannot decompose movement."],
    };
  }
  // Prefer entity decomposition (reliable). Label revenue is secondary.
  const slices: DriverSlice[] = [];
  for (const e of cur.entities) {
    const pe = prior.entities.find((x) => x.id === e.id);
    const pRev = pe?.revenue || 0;
    const delta = r1(e.revenue - pRev);
    if (delta === 0) continue;
    slices.push({
      key: e.id, label: e.name, current: e.revenue, prior: pRev, delta,
    });
  }
  // Entities that disappeared
  for (const pe of prior.entities) {
    if (!cur.entities.find((e) => e.id === pe.id) && pe.revenue) {
      slices.push({
        key: pe.id, label: pe.name, current: 0, prior: pe.revenue, delta: r1(-pe.revenue),
      });
    }
  }
  slices.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top = slices.slice(0, 8);
  const other = r1(slices.slice(8).reduce((s, x) => s + x.delta, 0));
  return {
    metricKey: "revenue",
    label: "Revenue",
    totalDelta: r1(cur.revenue - prior.revenue),
    slices: top,
    other,
    method: "Entity-level revenue bridge (direct source). New/lost customer classification unavailable without a customer dimension.",
    notes: [
      "Expansion/contraction/new/lost customer buckets are UNAVAILABLE — no customer table.",
    ],
  };
}

export function marginDriverNotes(cur: PeriodMetrics, prior: PeriodMetrics | null): string[] {
  if (!prior) return ["No prior period for margin bridge."];
  const notes: string[] = [];
  const pts = r1(cur.grossMarginPct - prior.grossMarginPct);
  notes.push(`Gross margin moved ${pts >= 0 ? "+" : ""}${pts} points (${prior.grossMarginPct}% → ${cur.grossMarginPct}%).`);
  const laborPts = r1(cur.laborPct - prior.laborPct);
  if (Math.abs(laborPts) >= 0.5) {
    notes.push(`Labor ratio moved ${laborPts >= 0 ? "+" : ""}${laborPts} points.`);
  }
  const dcDelta = r1(cur.directCost - prior.directCost);
  const revDelta = r1(cur.revenue - prior.revenue);
  notes.push(`Revenue Δ ${revDelta >= 0 ? "+" : ""}${revDelta}K; direct cost Δ ${dcDelta >= 0 ? "+" : ""}${dcDelta}K.`);
  notes.push(
    "Price/mix/labor causal split requires transaction-level data not present in the monthly close — do not invent causes.",
  );
  return notes;
}
