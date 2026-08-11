/**
 * Serialize dashboard + intelligence inputs for Client Overview V2.
 * Prototype only — presentation layer. Financial math stays in metrics/comparison.
 */

import { loadDashboard } from "@/lib/dashboard-data";
import { marginDriverNotes, revenueDriverBridge, opexDriverBridge } from "@/lib/intelligence/drivers";
import { pctChange, pointsDelta, r1 } from "@/lib/intelligence/calc";
import type { PeriodMetrics } from "@/lib/metrics";

export type OverviewLens = "revenue" | "grossProfit" | "grossMarginPct" | "netIncome" | "cash" | "arTotal";

export type OverviewV2Period = {
  periodId: string;
  year: number;
  month: number;
  label: string;
  status: string;
  revenue: number;
  grossProfit: number;
  grossMarginPct: number;
  netIncome: number;
  netMarginPct: number;
  laborPct: number;
  cash: number;
  arTotal: number;
  directCost: number;
  opex: number;
};

export type OverviewV2Model = {
  client: { id: string; name: string; slug: string };
  userName: string;
  periodId: string;
  periods: OverviewV2Period[];
  cur: OverviewV2Period;
  priorMonth: OverviewV2Period | null;
  priorYear: OverviewV2Period | null;
  compare: {
    priorMonth: Record<OverviewLens, { delta: number | null; deltaPct: number | null; points: number | null }>;
    priorYear: Record<OverviewLens, { delta: number | null; deltaPct: number | null; points: number | null }>;
  };
  narrative: {
    headline: string;
    body: string;
    signal: string | null;
    noteHeading: string | null;
    noteBody: string | null;
  };
  drivers: {
    netIncome: { label: string; delta: number }[];
    marginNotes: string[];
    revenueSlices: { label: string; delta: number }[];
    opexSlices: { label: string; delta: number }[];
  };
  status: {
    books: string;
    close: string;
    connection: string;
  };
};

function pack(p: PeriodMetrics): OverviewV2Period {
  return {
    periodId: p.periodId,
    year: p.year,
    month: p.month,
    label: p.label,
    status: p.status,
    revenue: p.revenue,
    grossProfit: p.grossProfit,
    grossMarginPct: p.grossMarginPct,
    netIncome: p.netIncome,
    netMarginPct: p.netMarginPct,
    laborPct: p.laborPct,
    cash: p.cash.total,
    arTotal: p.arTotal,
    directCost: p.directCost,
    opex: p.opex,
  };
}

function lensValue(p: OverviewV2Period, lens: OverviewLens): number {
  return p[lens];
}

function comparePair(cur: OverviewV2Period, prior: OverviewV2Period | null, lens: OverviewLens) {
  if (!prior) return { delta: null, deltaPct: null, points: null };
  const a = lensValue(cur, lens);
  const b = lensValue(prior, lens);
  if (lens === "grossMarginPct") {
    return { delta: null, deltaPct: null, points: pointsDelta(a, b) };
  }
  return {
    delta: r1(a - b),
    deltaPct: pctChange(a, b),
    points: null,
  };
}

function buildNarrative(
  cur: OverviewV2Period,
  priorYear: OverviewV2Period | null,
  priorMonth: OverviewV2Period | null,
  note: { heading: string; body: string } | null,
): OverviewV2Model["narrative"] {
  const yoy = priorYear ? pctChange(cur.revenue, priorYear.revenue) : null;
  const marginPts = priorMonth ? pointsDelta(cur.grossMarginPct, priorMonth.grossMarginPct) : null;
  const laborPts = priorMonth ? pointsDelta(cur.laborPct, priorMonth.laborPct) : null;

  let signal: string | null = null;
  if (marginPts != null && marginPts <= -1) signal = "Margin pressure";
  else if (yoy != null && yoy <= -10) signal = "Revenue decline";
  else if (cur.netIncome < 0) signal = "Loss-making month";
  else if (laborPts != null && Math.abs(laborPts) >= 1.5) signal = "Labor movement";

  let headline = `${cur.label}`;
  if (yoy != null) {
    headline = yoy >= 0
      ? `Revenue is up ${Math.abs(yoy).toFixed(1)}% versus the same month last year`
      : `Revenue is down ${Math.abs(yoy).toFixed(1)}% versus the same month last year`;
  }

  const parts: string[] = [];
  if (yoy != null && marginPts != null) {
    if (yoy > 0 && marginPts < 0) {
      parts.push(
        `The business grew, but profitability did not. Gross margin moved ${marginPts.toFixed(1)} points.`,
      );
    } else if (yoy > 0 && marginPts >= 0) {
      parts.push(`Growth held with margin ${marginPts === 0 ? "flat" : `up ${marginPts.toFixed(1)} points`}.`);
    } else {
      parts.push(`Revenue and margin both need attention this month.`);
    }
  }
  if (laborPts != null && Math.abs(laborPts) >= 0.5) {
    parts.push(`Labor ratio moved ${laborPts >= 0 ? "+" : ""}${laborPts.toFixed(1)} points.`);
  }
  if (!parts.length && note?.body) parts.push(note.body);

  return {
    headline,
    body: parts.join(" ") || "Figures for this period are ready for review.",
    signal,
    noteHeading: note?.heading ?? null,
    noteBody: note?.body ?? null,
  };
}

export async function buildOverviewV2(
  searchParams: Record<string, string | undefined>,
): Promise<OverviewV2Model | null> {
  const ctx = await loadDashboard(searchParams);
  if (!ctx || !ctx.cur) return null;

  const periods = ctx.periods.map(pack);
  const cur = pack(ctx.cur);
  const priorMonth = ctx.prev ? pack(ctx.prev) : null;
  const priorYearRaw = ctx.periods.find((p) => p.year === cur.year - 1 && p.month === cur.month) || null;
  const priorYear = priorYearRaw ? pack(priorYearRaw) : null;

  const lenses: OverviewLens[] = ["revenue", "grossProfit", "grossMarginPct", "netIncome", "cash", "arTotal"];
  const compare = {
    priorMonth: Object.fromEntries(lenses.map((l) => [l, comparePair(cur, priorMonth, l)])) as OverviewV2Model["compare"]["priorMonth"],
    priorYear: Object.fromEntries(lenses.map((l) => [l, comparePair(cur, priorYear, l)])) as OverviewV2Model["compare"]["priorYear"],
  };

  const note = ctx.cur.notes.find((n) => n.slot === "WHAT_CHANGED") || null;
  const marginNotes = marginDriverNotes(ctx.cur, ctx.prev);
  const revBridge = revenueDriverBridge(ctx.cur, ctx.prev);
  const opexBridge = opexDriverBridge(ctx.cur, ctx.prev);

  const niDrivers: { label: string; delta: number }[] = [];
  if (priorMonth) {
    niDrivers.push({ label: "Starting NI", delta: priorMonth.netIncome });
    niDrivers.push({ label: "Revenue", delta: r1(cur.revenue - priorMonth.revenue) });
    niDrivers.push({ label: "Direct cost", delta: r1(-(cur.directCost - priorMonth.directCost)) });
    niDrivers.push({ label: "Overhead", delta: r1(-(cur.opex - priorMonth.opex)) });
    niDrivers.push({ label: "Ending NI", delta: cur.netIncome });
  }

  const books =
    cur.status === "PUBLISHED" ? "Books closed"
      : cur.status === "IN_REVIEW" ? "In review"
        : cur.status === "GATED" ? "Gate failing"
          : "Open";

  return {
    client: { id: ctx.client.id, name: ctx.client.name, slug: ctx.client.slug },
    userName: ctx.session.name,
    periodId: cur.periodId,
    periods,
    cur,
    priorMonth,
    priorYear,
    compare,
    narrative: buildNarrative(cur, priorYear, priorMonth, note),
  drivers: {
    netIncome: niDrivers,
    marginNotes,
    revenueSlices: revBridge.slices.map((s) => ({ label: s.label, delta: s.delta })),
    opexSlices: opexBridge.slices.map((s) => ({ label: s.label, delta: s.delta })),
  },
  status: {
    books,
    close: cur.status === "PUBLISHED" ? "Complete" : cur.status === "IN_REVIEW" ? "Awaiting approval" : "In progress",
    connection: "Manual close", // QBO not live in fixture — honest
  },
};
}
