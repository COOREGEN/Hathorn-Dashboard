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
import {
  intelligenceConfigFor,
  type ClientIntelligenceConfig,
  type VitalKey,
} from "@/lib/overview-v2/intelligence-config";

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
  /** Operating volume — only when recorded. Never invented. */
  occupancyPct: number | null;
  adr: number | null;
  volumeSold: number | null;
  volumeCapacity: number | null;
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
  expenses: { label: string; amount: number; share: number }[];
  expenseTotal: number;
  qboConnected: boolean;
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
  /** Presentation config — emphasis only. */
  intelligence: ClientIntelligenceConfig;
  /** 6 vitals for the default screen. */
  vitals: {
    key: VitalKey;
    label: string;
    clientLabel: string;
    value: number | null;
    formatted: string;
    delta: string | null;
    tone: "up" | "down" | "flat";
    unit: "money" | "pct" | "rate";
    lens: OverviewLens | null;
  }[];
  /** 3 answers. */
  answers: {
    whatChanged: { title: string; body: string; items: { label: string; detail: string; tone: "up" | "down" | "flat" }[] };
    needsAttention: { title: string; body: string; items: { label: string; detail: string; tone: "up" | "down" | "flat" }[] };
    happensNext: { title: string; body: string; items: { label: string; detail: string; tone: "up" | "down" | "flat" }[] };
  };
  /** 1 recommendation — advisor-reviewed language preferred when notes exist. */
  recommendation: {
    headline: string;
    body: string;
    source: "advisor_note" | "deterministic_signal" | "plan_variance";
    readyForClient: boolean;
  };
  /** Plan vs reality — only where real data exists. */
  plan: {
    budgetAvailable: boolean;
    budgetRevenue: number | null;
    budgetVariance: number | null;
    budgetVariancePct: number | null;
    priorYearAvailable: boolean;
    forecastHint: string | null;
    cashWeeksOfCover: number | null;
    cashGoesNegative: boolean;
    cashLowestWeek: number | null;
  };
  agedAr: { amount: number; label: string; clientLabel: string } | null;
};

function pack(
  p: PeriodMetrics,
  budgetRevenue: number | null,
  volume: { sold: number; capacity: number; utilisation: number | null } | null,
): OverviewV2Period {
  const occupancyPct = volume?.utilisation ?? null;
  const adr =
    volume && volume.sold > 0 && p.revenue > 0
      ? r1(p.revenue / volume.sold) // $K per unit — format as dollars in UI
      : null;
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
    occupancyPct,
    adr,
    volumeSold: volume?.sold ?? null,
    volumeCapacity: volume?.capacity ?? null,
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
  const { volumeFor } = await import("@/lib/dashboard-data");

  const volPack = (periodId: string) => {
    const raw = volumeFor(periodId);
    if (!raw || !raw.available) return null;
    return {
      sold: Number(raw.totalSold ?? 0),
      capacity: Number(raw.totalCapacity ?? 0),
      utilisation: raw.utilisation != null ? Number(raw.utilisation) : null,
    };
  };

  const periods = ctx.periods.map((p) =>
    pack(p, budgetRevenueFor(clientId, p.year, p.month), volPack(p.periodId)),
  );
  const cur = pack(ctx.cur, budgetRevenueFor(clientId, ctx.cur.year, ctx.cur.month), volPack(ctx.cur.periodId));
  const priorMonth = ctx.prev
    ? pack(ctx.prev, budgetRevenueFor(clientId, ctx.prev.year, ctx.prev.month), volPack(ctx.prev.periodId))
    : null;
  const priorYearRaw = ctx.periods.find((p) => p.year === cur.year - 1 && p.month === cur.month) || null;
  const priorYear = priorYearRaw
    ? pack(priorYearRaw, budgetRevenueFor(clientId, priorYearRaw.year, priorYearRaw.month), volPack(priorYearRaw.periodId))
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

  const expenseRows: any[] = db().prepare(`
    SELECT label, SUM(amount) amount
      FROM pl_lines
     WHERE period_id=? AND category IN ('DIRECT_COST','OPEX')
     GROUP BY label
     ORDER BY SUM(amount) DESC
  `).all(cur.periodId);
  const expenseTotal = r1(expenseRows.reduce((s, r) => s + Number(r.amount || 0), 0));
  const expenses = expenseRows.map((r) => {
    const amount = r1(Number(r.amount || 0));
    return {
      label: String(r.label || "Other"),
      amount,
      share: expenseTotal ? r1((amount / expenseTotal) * 100) : 0,
    };
  });

  let qboConnected = false;
  try {
    qboConnected = Boolean(db().prepare(
      "SELECT 1 FROM qbo_connections WHERE client_id=? LIMIT 1",
    ).get(clientId));
  } catch { qboConnected = false; }

  const intelligence = intelligenceConfigFor(ctx.profile);
  const narrative = buildNarrative(cur, priorYear, priorMonth, note);
  const cash13 = ctx.cash13;

  const aged61 = ctx.cur.ar.reduce((s, a) => s + a.b61_90 + a.b90p, 0);
  const agedAr = aged61 > 0.5
    ? {
        amount: r1(aged61),
        label: `AR 61+ Days — ${fmtMoney(aged61)}`,
        clientLabel: `${fmtMoney(aged61)} has been outstanding for more than 60 days.`,
      }
    : null;

  const laborBand = ctx.laborTarget;
  const laborTone: "up" | "down" | "flat" =
    laborBand && cur.laborPct > laborBand.hi
      ? "down"
      : laborBand && cur.laborPct < laborBand.lo
        ? "down"
        : "up";

  const vitalValue = (key: VitalKey): { value: number | null; unit: "money" | "pct" | "rate"; lens: OverviewLens | null } => {
    switch (key) {
      case "revenue": return { value: cur.revenue, unit: "money", lens: "revenue" };
      case "grossMarginPct": return { value: cur.grossMarginPct, unit: "pct", lens: "grossMarginPct" };
      case "netIncome": return { value: cur.netIncome, unit: "money", lens: "netIncome" };
      case "cash": return { value: cur.cash, unit: "money", lens: "cash" };
      case "arTotal": return { value: cur.arTotal, unit: "money", lens: "arTotal" };
      case "laborPct": return { value: cur.laborPct, unit: "pct", lens: null };
      case "occupancy": return { value: cur.occupancyPct, unit: "pct", lens: null };
      case "adr": return { value: cur.adr, unit: "rate", lens: null };
    }
  };

  const formatVital = (value: number | null, unit: "money" | "pct" | "rate") => {
    if (value == null) return "—";
    if (unit === "pct") return `${value.toFixed(1)}%`;
    if (unit === "rate") return `$${(value * 1000).toFixed(0)}`;
    return fmtMoney(value);
  };

  const vitalDelta = (key: VitalKey): { text: string | null; tone: "up" | "down" | "flat" } => {
    if (key === "laborPct") {
      const pts = priorMonth ? pointsDelta(cur.laborPct, priorMonth.laborPct) : null;
      if (pts == null) return { text: laborBand ? `Band ${laborBand.lo}–${laborBand.hi}%` : null, tone: laborTone };
      return { text: `${pts >= 0 ? "+" : ""}${pts.toFixed(1)} pts MoM`, tone: laborTone };
    }
    if (key === "occupancy" || key === "adr") {
      return { text: cur.volumeSold != null ? `${cur.volumeSold} ${intelligence.terminology.volume.toLowerCase()}` : null, tone: "flat" };
    }
    const lens = vitalValue(key).lens;
    if (!lens) return { text: null, tone: "flat" };
    const c = compare.priorYear[lens];
    if (c.points != null) {
      return {
        text: `${c.points >= 0 ? "+" : ""}${c.points.toFixed(1)} pts YoY`,
        tone: c.points >= 0 ? "up" : "down",
      };
    }
    if (c.deltaPct != null) {
      return {
        text: `${c.deltaPct >= 0 ? "+" : ""}${c.deltaPct.toFixed(1)}% YoY`,
        tone: c.deltaPct >= 0 ? "up" : "down",
      };
    }
    return { text: null, tone: "flat" };
  };

  const { vitalLabel } = await import("@/lib/overview-v2/intelligence-config");
  const vitals = intelligence.primaryVitals
    .map((key) => {
      const { value, unit, lens } = vitalValue(key);
      if (value == null && (key === "occupancy" || key === "adr")) return null;
      const d = vitalDelta(key);
      return {
        key,
        label: vitalLabel(key, intelligence, "advisor"),
        clientLabel: vitalLabel(key, intelligence, "client"),
        value,
        formatted: formatVital(value, unit),
        delta: d.text,
        tone: d.tone,
        unit,
        lens,
      };
    })
    .filter(Boolean) as OverviewV2Model["vitals"];

  const moved = niDrivers
    .filter((d) => d.kind === "up" || d.kind === "down")
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const whatChangedItems = [
    ...moved.slice(0, 3).map((d) => ({
      label: d.label,
      detail: `${d.delta >= 0 ? "+" : "−"}${fmtMoney(Math.abs(d.delta))} on the ${driverMode} bridge`,
      tone: (d.kind === "up" ? "up" : "down") as "up" | "down",
    })),
    ...(marginNotes.slice(0, 1).map((n) => ({
      label: "Margin note",
      detail: n,
      tone: "flat" as const,
    }))),
  ].slice(0, 4);

  const attentionItems: OverviewV2Model["answers"]["needsAttention"]["items"] = [];
  if (agedAr) {
    attentionItems.push({ label: agedAr.label, detail: agedAr.clientLabel, tone: "down" });
  }
  if (laborBand && (cur.laborPct > laborBand.hi || cur.laborPct < laborBand.lo)) {
    attentionItems.push({
      label: `${intelligence.terminology.labor} ${cur.laborPct.toFixed(1)}%`,
      detail: `Outside the agreed ${laborBand.lo}–${laborBand.hi}% band.`,
      tone: "down",
    });
  }
  if (cash13.goesNegative) {
    attentionItems.push({
      label: "Cash outlook",
      detail: `13-week projection dips negative around week ${cash13.lowestWeek}.`,
      tone: "down",
    });
  }
  if (budget.revenueVariancePct != null && budget.revenueVariancePct < -3) {
    attentionItems.push({
      label: "Behind plan",
      detail: `Revenue ${budget.revenueVariancePct.toFixed(1)}% vs budget.`,
      tone: "down",
    });
  }
  if (!attentionItems.length) {
    attentionItems.push({
      label: "No blocking alerts",
      detail: "Nothing on this close requires urgent intervention — keep the monthly conversation on the story.",
      tone: "up",
    });
  }

  const nextItems: OverviewV2Model["answers"]["happensNext"]["items"] = [];
  if (cash13.weeksOfCover != null) {
    nextItems.push({
      label: "Cash cover",
      detail: `${cash13.weeksOfCover.toFixed(1)} weeks of operating cover at current burn.`,
      tone: cash13.weeksOfCover < 6 ? "down" : "up",
    });
  }
  if (budget.available && budget.revenueVariance != null) {
    nextItems.push({
      label: "vs budget",
      detail: `Revenue ${budget.revenueVariance >= 0 ? "ahead" : "behind"} plan by ${fmtMoney(Math.abs(budget.revenueVariance))}.`,
      tone: budget.revenueVariance >= 0 ? "up" : "down",
    });
  }
  if (yoyRev.deltaPct != null) {
    nextItems.push({
      label: "Trajectory",
      detail: yoyRev.deltaPct >= 0
        ? `Holding a ${yoyRev.deltaPct.toFixed(1)}% YoY lift — protect collections so the growth sticks.`
        : `Down ${Math.abs(yoyRev.deltaPct).toFixed(1)}% YoY — next month needs a named recovery lever.`,
      tone: yoyRev.deltaPct >= 0 ? "up" : "down",
    });
  }
  if (!nextItems.length) {
    nextItems.push({
      label: "Next close",
      detail: "Keep the books tied; the advisory conversation follows the published release.",
      tone: "flat",
    });
  }

  let recommendation: OverviewV2Model["recommendation"];
  if (note?.body) {
    recommendation = {
      headline: note.heading || "Advisor perspective",
      body: note.body,
      source: "advisor_note",
      readyForClient: cur.status === "PUBLISHED",
    };
  } else if (agedAr) {
    recommendation = {
      headline: "Open with collections",
      body: `${agedAr.clientLabel} That is the conversation — not the headline revenue figure.`,
      source: "deterministic_signal",
      readyForClient: false,
    };
  } else if (budget.revenueVariance != null && budget.revenueVariance < 0) {
    recommendation = {
      headline: "Name the plan gap",
      body: `Revenue is ${fmtMoney(Math.abs(budget.revenueVariance))} behind the agreed plan. Agree one operational lever before the next close.`,
      source: "plan_variance",
      readyForClient: false,
    };
  } else {
    recommendation = {
      headline: intelligence.advisorFocus,
      body: narrative.body,
      source: "deterministic_signal",
      readyForClient: cur.status === "PUBLISHED",
    };
  }

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
    narrative,
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
    expenses,
    expenseTotal,
    qboConnected,
    status: {
      books,
      close: cur.status === "PUBLISHED" ? "Complete" : cur.status === "IN_REVIEW" ? "Awaiting approval" : "In progress",
      connection: qboConnected ? "QuickBooks Online connected" : "Manual close",
      closeTrack: ops.closeTrack,
      reconDone: ops.reconDone,
      reconTotal: ops.reconTotal,
      openItems: ops.openItems,
      docsMissing: ops.docsMissing,
      partnerReview: ops.partnerReview,
    },
    intelligence,
    vitals,
    answers: {
      whatChanged: {
        title: "What changed",
        body: whatChangedItems[0]?.detail ?? narrative.body,
        items: whatChangedItems,
      },
      needsAttention: {
        title: "What needs attention",
        body: attentionItems[0]?.detail ?? "No blocking items.",
        items: attentionItems,
      },
      happensNext: {
        title: "What happens next",
        body: nextItems[0]?.detail ?? "",
        items: nextItems,
      },
    },
    recommendation,
    plan: {
      budgetAvailable: budget.available,
      budgetRevenue: budget.revenue,
      budgetVariance: budget.revenueVariance,
      budgetVariancePct: budget.revenueVariancePct,
      priorYearAvailable: priorYear != null,
      forecastHint: cash13.weeksOfCover != null
        ? `${cash13.weeksOfCover.toFixed(1)} weeks cash cover (13-week outlook)`
        : null,
      cashWeeksOfCover: cash13.weeksOfCover,
      cashGoesNegative: cash13.goesNegative,
      cashLowestWeek: cash13.goesNegative ? cash13.lowestWeek : null,
    },
    agedAr,
  };
}

