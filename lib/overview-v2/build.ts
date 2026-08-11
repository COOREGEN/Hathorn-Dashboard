/**
 * Serialize dashboard + intelligence inputs for Client Overview V2.
 * Prototype only — presentation layer. Financial math stays in metrics/comparison.
 */

import { db } from "@/lib/db";
import { loadDashboard } from "@/lib/dashboard-data";
import { marginDriverNotes, revenueDriverBridge, opexDriverBridge } from "@/lib/intelligence/drivers";
import { pctChange, pointsDelta, r1 } from "@/lib/intelligence/calc";
import type { PeriodMetrics } from "@/lib/metrics";
import { firmIdForClient } from "@/lib/tenancy";

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
  budgetRevenue: number | null;
};

export type OverviewV2Model = {
  firmName: string;
  client: { id: string; name: string; slug: string };
  userName: string;
  userRole: string;
  periodId: string;
  periods: OverviewV2Period[];
  cur: OverviewV2Period;
  priorMonth: OverviewV2Period | null;
  priorYear: OverviewV2Period | null;
  compare: {
    priorMonth: Record<OverviewLens, { delta: number | null; deltaPct: number | null; points: number | null }>;
    priorYear: Record<OverviewLens, { delta: number | null; deltaPct: number | null; points: number | null }>;
  };
  budget: {
    available: boolean;
    revenue: number | null;
    revenueVariance: number | null;
    revenueVariancePct: number | null;
  };
  narrative: {
    headline: string;
    body: string;
    signal: string | null;
    noteHeading: string | null;
    noteBody: string | null;
  };
  drivers: {
    /** Prefer YoY bridge when prior year exists (matches institutional research view). */
    mode: "YoY" | "MoM";
    fromLabel: string;
    toLabel: string;
    netIncome: { label: string; delta: number; kind: "start" | "end" | "up" | "down" }[];
    marginNotes: string[];
    revenueSlices: { label: string; delta: number }[];
    opexSlices: { label: string; delta: number }[];
  };
  insights: { label: string; value: string; detail: string; tone: "up" | "down" | "flat" }[];
  status: {
    books: string;
    close: string;
    connection: string;
    closeTrack: string;
    reconDone: number;
    reconTotal: number;
    openItems: number;
    docsMissing: number;
    partnerReview: string;
  };
};

function pack(p: PeriodMetrics, budgetRevenue: number | null): OverviewV2Period {
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
    budgetRevenue,
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

function budgetRevenueFor(clientId: string, year: number, month: number): number | null {
  const row: any = db().prepare(
    `SELECT SUM(amount) total FROM budget_lines
      WHERE client_id=? AND year=? AND month=? AND category='REVENUE'`,
  ).get(clientId, year, month);
  if (row?.total == null) return null;
  return r1(Number(row.total));
}

function buildNarrative(
  cur: OverviewV2Period,
  priorYear: OverviewV2Period | null,
  priorMonth: OverviewV2Period | null,
  note: { heading: string; body: string } | null,
): OverviewV2Model["narrative"] {
  const yoy = priorYear ? pctChange(cur.revenue, priorYear.revenue) : null;
  const marginPts = priorYear
    ? pointsDelta(cur.grossMarginPct, priorYear.grossMarginPct)
    : priorMonth
      ? pointsDelta(cur.grossMarginPct, priorMonth.grossMarginPct)
      : null;
  const laborPts = priorMonth ? pointsDelta(cur.laborPct, priorMonth.laborPct) : null;

  let signal: string | null = null;
  if (marginPts != null && marginPts <= -1) signal = "Margin pressure";
  else if (yoy != null && yoy <= -10) signal = "Revenue decline";
  else if (cur.netIncome < 0) signal = "Loss-making month";
  else if (laborPts != null && Math.abs(laborPts) >= 1.5) signal = "Labor movement";

  let headline = cur.label;
  if (yoy != null) {
    headline = yoy >= 0
      ? `Revenue grew ${Math.abs(yoy).toFixed(1)}% YoY`
      : `Revenue declined ${Math.abs(yoy).toFixed(1)}% YoY`;
  }

  const parts: string[] = [];
  if (yoy != null && marginPts != null) {
    if (yoy > 0 && marginPts < 0) {
      parts.push(
        `but gross margin declined ${Math.abs(marginPts).toFixed(1)} pts.`,
      );
    } else if (yoy > 0) {
      parts.push(`with gross margin ${marginPts === 0 ? "flat" : `up ${marginPts.toFixed(1)} pts`}.`);
    }
  }
  if (laborPts != null && Math.abs(laborPts) >= 0.5) {
    parts.push(`Labor ratio moved ${laborPts >= 0 ? "+" : ""}${laborPts.toFixed(1)} points versus prior month.`);
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

function niBridge(
  from: OverviewV2Period,
  to: OverviewV2Period,
  mode: "YoY" | "MoM",
): OverviewV2Model["drivers"]["netIncome"] {
  return [
    { label: mode === "YoY" ? from.label : "Starting NI", delta: from.netIncome, kind: "start" },
    { label: "Revenue", delta: r1(to.revenue - from.revenue), kind: to.revenue - from.revenue >= 0 ? "up" : "down" },
    { label: "Direct cost", delta: r1(-(to.directCost - from.directCost)), kind: to.directCost - from.directCost > 0 ? "down" : "up" },
    { label: "Overhead", delta: r1(-(to.opex - from.opex)), kind: to.opex - from.opex > 0 ? "down" : "up" },
    { label: mode === "YoY" ? to.label : "Ending NI", delta: to.netIncome, kind: "end" },
  ];
}

function opsStatus(clientId: string, periodId: string, curStatus: string) {
  const recon: any[] = db().prepare(
    `SELECT status FROM reconciliations WHERE client_id=? AND period_id=?`,
  ).all(clientId, periodId);
  const reconTotal = recon.length;
  const reconDone = recon.filter((r) => r.status === "RESOLVED" || r.status === "MATCHED").length;

  let docsMissing = 0;
  try {
    const d: any = db().prepare(
      `SELECT COUNT(*) n FROM source_documents
        WHERE client_id=? AND (period_id=? OR period_id IS NULL)
          AND status IN ('REQUESTED','MISSING','QUARANTINED')`,
    ).get(clientId, periodId);
    docsMissing = Number(d?.n || 0);
  } catch {
    docsMissing = 0;
  }

  let openItems = 0;
  try {
    const e: any = db().prepare(
      `SELECT COUNT(*) n FROM accounting_exceptions
        WHERE client_id=? AND status NOT IN ('CLOSED','RESOLVED','CLEARED')`,
    ).get(clientId);
    openItems = Number(e?.n || 0);
  } catch {
    openItems = 0;
  }

  const partnerReview =
    curStatus === "PUBLISHED" ? "Complete"
      : curStatus === "IN_REVIEW" ? "Waiting"
        : "Not started";

  const closeTrack =
    curStatus === "PUBLISHED" ? "On track"
      : curStatus === "IN_REVIEW" ? "In review"
        : curStatus === "GATED" ? "Blocked"
          : "In progress";

  return { reconDone, reconTotal, docsMissing, openItems, partnerReview, closeTrack };
}

export async function buildOverviewV2(
  searchParams: Record<string, string | undefined>,
): Promise<OverviewV2Model | null> {
  const ctx = await loadDashboard(searchParams);
  if (!ctx || !ctx.cur) return null;

  const clientId = ctx.client.id;
  const periods = ctx.periods.map((p) => pack(p, budgetRevenueFor(clientId, p.year, p.month)));
  const cur = pack(ctx.cur, budgetRevenueFor(clientId, ctx.cur.year, ctx.cur.month));
  const priorMonth = ctx.prev ? pack(ctx.prev, budgetRevenueFor(clientId, ctx.prev.year, ctx.prev.month)) : null;
  const priorYearRaw = ctx.periods.find((p) => p.year === cur.year - 1 && p.month === cur.month) || null;
  const priorYear = priorYearRaw
    ? pack(priorYearRaw, budgetRevenueFor(clientId, priorYearRaw.year, priorYearRaw.month))
    : null;

  const lenses: OverviewLens[] = ["revenue", "grossProfit", "grossMarginPct", "netIncome", "cash", "arTotal"];
  const compare = {
    priorMonth: Object.fromEntries(lenses.map((l) => [l, comparePair(cur, priorMonth, l)])) as OverviewV2Model["compare"]["priorMonth"],
    priorYear: Object.fromEntries(lenses.map((l) => [l, comparePair(cur, priorYear, l)])) as OverviewV2Model["compare"]["priorYear"],
  };

  const note = ctx.cur.notes.find((n) => n.slot === "WHAT_CHANGED") || null;
  const marginNotes = marginDriverNotes(ctx.cur, ctx.prev);
  const revBridge = revenueDriverBridge(ctx.cur, ctx.prev);
  const opexBridge = opexDriverBridge(ctx.cur, ctx.prev);

  const bridgeFrom = priorYear || priorMonth;
  const driverMode: "YoY" | "MoM" = priorYear ? "YoY" : "MoM";
  const niDrivers = bridgeFrom ? niBridge(bridgeFrom, cur, driverMode) : [];

  const books =
    cur.status === "PUBLISHED" ? "Books closed"
      : cur.status === "IN_REVIEW" ? "In review"
        : cur.status === "GATED" ? "Gate failing"
          : "Open";

  const bud = cur.budgetRevenue;
  const budget = {
    available: bud != null,
    revenue: bud,
    revenueVariance: bud != null ? r1(cur.revenue - bud) : null,
    revenueVariancePct: bud != null ? pctChange(cur.revenue, bud) : null,
  };

  const yoyRev = compare.priorYear.revenue;
  const yoyGm = compare.priorYear.grossMarginPct;
  const yoyNi = compare.priorYear.netIncome;
  const yoyCash = compare.priorYear.cash;

  const fmtMoney = (n: number) => {
    const s = n < 0 ? "−" : "";
    const v = Math.abs(n);
    return v >= 1000 ? `${s}$${(v / 1000).toFixed(2)}M` : `${s}$${v.toFixed(1)}K`;
  };

  const insights: OverviewV2Model["insights"] = [
    {
      label: "Revenue",
      value: yoyRev.delta != null ? `${yoyRev.delta >= 0 ? "+" : ""}${fmtMoney(yoyRev.delta)}` : fmtMoney(cur.revenue),
      detail: yoyRev.deltaPct != null ? `${yoyRev.deltaPct >= 0 ? "+" : ""}${yoyRev.deltaPct.toFixed(1)}% YoY` : "No prior year",
      tone: (yoyRev.deltaPct ?? 0) >= 0 ? "up" : "down",
    },
    {
      label: "Gross margin",
      value: `${cur.grossMarginPct.toFixed(1)}%`,
      detail: yoyGm.points != null ? `${yoyGm.points >= 0 ? "+" : ""}${yoyGm.points.toFixed(1)} pts YoY` : "No prior year",
      tone: (yoyGm.points ?? 0) >= 0 ? "up" : "down",
    },
    {
      label: "Cash",
      value: fmtMoney(cur.cash),
      detail: yoyCash.deltaPct != null ? `${yoyCash.deltaPct >= 0 ? "+" : ""}${yoyCash.deltaPct.toFixed(1)}% YoY` : "Balance",
      tone: (yoyCash.deltaPct ?? 0) >= 0 ? "up" : "down",
    },
    {
      label: "Net income",
      value: fmtMoney(cur.netIncome),
      detail: yoyNi.deltaPct != null ? `${yoyNi.deltaPct >= 0 ? "+" : ""}${yoyNi.deltaPct.toFixed(1)}% YoY` : "This month",
      tone: (yoyNi.deltaPct ?? 0) >= 0 ? "up" : "down",
    },
  ];

  const ops = opsStatus(clientId, cur.periodId, cur.status);
  let firmName = "Hathorn Advisory Group";
  try {
    const fid = firmIdForClient(clientId);
    if (fid) {
      const f: any = db().prepare("SELECT name FROM firms WHERE id=?").get(fid);
      if (f?.name) firmName = f.name;
    }
  } catch { /* keep default */ }

  return {
    firmName,
    client: { id: ctx.client.id, name: ctx.client.name, slug: ctx.client.slug },
    userName: ctx.session.name,
    userRole: ctx.session.role,
    periodId: cur.periodId,
    periods,
    cur,
    priorMonth,
    priorYear,
    compare,
    budget,
    narrative: buildNarrative(cur, priorYear, priorMonth, note),
    drivers: {
      mode: driverMode,
      fromLabel: bridgeFrom?.label ?? "—",
      toLabel: cur.label,
      netIncome: niDrivers,
      marginNotes,
      revenueSlices: revBridge.slices.map((s) => ({ label: s.label, delta: s.delta })),
      opexSlices: opexBridge.slices.map((s) => ({ label: s.label, delta: s.delta })),
    },
    insights,
    status: {
      books,
      close: cur.status === "PUBLISHED" ? "Complete" : cur.status === "IN_REVIEW" ? "Awaiting approval" : "In progress",
      connection: "Manual close",
      closeTrack: ops.closeTrack,
      reconDone: ops.reconDone,
      reconTotal: ops.reconTotal,
      openItems: ops.openItems,
      docsMissing: ops.docsMissing,
      partnerReview: ops.partnerReview,
    },
  };
}
