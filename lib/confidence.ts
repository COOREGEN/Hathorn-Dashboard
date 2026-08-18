/**
 * Confidence.
 *
 * Two different questions, deliberately not mixed:
 *
 *   1. What do the numbers say?
 *   2. How much should anyone rely on them?
 *
 * The idea is borrowed; the implementation departs on one point. A common approach
 * shrinks the result toward neutral in proportion to confidence — `50 + (raw − 50) × c`.
 * That is mathematically honest and psychologically misleading: a failing business with
 * poor data lands on "average", and a reader who glances at the number sees "fine" when
 * the truth is "we don't know". A displayed figure is the thing people act on.
 *
 * So figures are never adjusted. Revenue was $96.1K whatever the confidence. What
 * changes is what sits next to it: a confidence score, its components, and — when the
 * evidence does not support a conclusion — the removal of the comparison rather than a
 * quiet degradation of it.
 */

import { db } from "./db";
import type { PeriodMetrics } from "./metrics";
import type { ComparabilityResult } from "./comparability";

export type ConfidenceComponent = {
  name: string;
  score: number;        // 0–100
  weight: number;
  detail: string;
};

export type Confidence = {
  overall: number;      // 0–100
  band: "high" | "moderate" | "low";
  components: ConfidenceComponent[];
  /** The single biggest thing dragging confidence down, for the reader. */
  weakest: string | null;
};

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/**
 * Builds confidence for a period, optionally in the context of a comparison.
 *
 * Every component is returned with its own score and a plain-language reason, so a
 * reviewer can see whether low confidence came from an open period, a failed tie-out,
 * missing statements, or an incomparable basis — rather than being handed one number
 * with no way to act on it.
 */
export function assessConfidence(
  m: PeriodMetrics,
  clientId: string,
  comparability?: ComparabilityResult,
): Confidence {
  const components: ConfidenceComponent[] = [];

  // --- Close status ---
  const closeScore = m.status === "PUBLISHED" ? 100 : m.status === "IN_REVIEW" ? 70 : 35;
  components.push({
    name: "Close status", score: closeScore, weight: 0.22,
    detail: m.status === "PUBLISHED" ? "Period is closed and published."
      : m.status === "IN_REVIEW" ? "Period is drafted but not yet approved; figures may still change."
      : "Period has not cleared the gate.",
  });

  // --- Tie-out. The gate already ran; this reads its verdict rather than re-deriving it. ---
  const gate: any = db().prepare(
    "SELECT gate_pass, gate_detail FROM periods WHERE id = ?",
  ).get(m.periodId);
  const tieScore = gate?.gate_pass === 1 ? 100 : gate?.gate_pass === 0 ? 30 : 60;
  components.push({
    name: "Tie-out", score: tieScore, weight: 0.24,
    detail: gate?.gate_pass === 1 ? "Labor ties to payroll and the statements agree."
      : gate?.gate_pass === 0 ? "One or more tie-out checks failed."
      : "Tie-out has not been run for this period.",
  });

  // --- Reconciliation, asserted by the bookkeeper at close. ---
  const rec: any = db().prepare("SELECT reconciled FROM periods WHERE id = ?").get(m.periodId);
  components.push({
    name: "Reconciliation", score: rec?.reconciled ? 100 : 55, weight: 0.16,
    detail: rec?.reconciled
      ? "Marked reconciled against bank and payroll records."
      : "Not marked reconciled. The figures may be complete and still unverified.",
  });

  // --- Completeness of the statement set. ---
  const has = (table: string) =>
    (db().prepare(`SELECT COUNT(*) n FROM ${table} WHERE period_id = ?`).get(m.periodId) as any).n > 0;
  const present = [
    ["P&L", m.revenue !== 0 || m.directCost !== 0],
    ["payroll", m.totalPayroll !== 0],
    ["receivables", m.ar.length > 0],
    ["cash", m.cash.total !== 0],
    ["balance sheet", has("balance_lines")],
  ] as [string, boolean][];
  const missing = present.filter(([, ok]) => !ok).map(([n]) => n);
  components.push({
    name: "Completeness",
    score: clamp((present.filter(([, ok]) => ok).length / present.length) * 100),
    weight: 0.14,
    detail: missing.length ? `Missing: ${missing.join(", ")}.` : "All five statements present.",
  });

  // --- Freshness. A statement read six months late is history, not management information. ---
  const now = new Date();
  const age = (now.getFullYear() - m.year) * 12 + (now.getMonth() + 1 - m.month);
  const freshScore = age <= 1 ? 100 : age <= 2 ? 90 : age <= 4 ? 75 : age <= 8 ? 55 : 35;
  components.push({
    name: "Freshness", score: freshScore, weight: 0.10,
    detail: age <= 1 ? "Current period." : `${age} months old.`,
  });

  // --- Comparability, when a comparison is in play. ---
  if (comparability) {
    const blocking = comparability.issues.filter((i) => i.severity === "blocking");
    const score = blocking.length ? 0 : clamp(comparability.reliability * 100);
    components.push({
      name: "Comparability", score, weight: 0.14,
      detail: blocking.length
        ? `Comparison is not sound: ${blocking[0].message}`
        : comparability.issues.length
          ? comparability.issues[0].message
          : "The comparison basis is like-for-like.",
    });
  }

  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const overall = Math.round(
    components.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight,
  );

  const weakest = [...components].sort((a, b) => a.score - b.score)[0];

  return {
    overall,
    band: overall >= 80 ? "high" : overall >= 55 ? "moderate" : "low",
    components,
    weakest: weakest && weakest.score < 80 ? weakest.detail : null,
  };
}
