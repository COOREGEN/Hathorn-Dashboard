/**
 * The data every dashboard view needs.
 *
 * One function so a view cannot accidentally load a different shape of the same
 * month, and so the expensive work — metrics, advisory, comparability — happens once
 * per request rather than once per component.
 */

import { db } from "./db";
import { clientHistory, type PeriodMetrics } from "./metrics";
import { balanceSheet, cashOutlook, openActions, budgetVariance } from "./advisory";
import { buildComparison, type ComparisonMode } from "./comparison";
import { periodContext, checkComparability, normalisePerDay } from "./comparability";
import { assessConfidence } from "./confidence";
import { getSession } from "./auth";
import { vertical, bandsFor } from "./verticals";
import { managementBasis, feeRecovery, channelMix } from "./management-basis";

export type DashboardContext = Awaited<ReturnType<typeof loadDashboard>>;

/**
 * `searchParams` drives which month, entity and comparison mode are in view. State
 * lives in the URL rather than component state, so a view is linkable and the back
 * button works — the thing that makes a dashboard usable in a meeting.
 */
export async function loadDashboard(params: {
  client?: string; month?: string; entity?: string; mode?: string;
}) {
  const session = await getSession();
  if (!session) return null;

  // A client user is pinned to their own tenant regardless of what the URL asks for.
  /**
   * With no client in the URL, land on the one with the most recent published period
   * rather than whichever sorts first alphabetically. The book an advisor wants on
   * opening the dashboard is the one that just closed.
   */
  const defaultClient = () => {
    const row: any = db().prepare(
      `SELECT c.id FROM clients c
         LEFT JOIN periods p ON p.client_id = c.id AND p.status = 'PUBLISHED'
        GROUP BY c.id
        ORDER BY MAX(COALESCE(p.year, 0)) DESC, MAX(COALESCE(p.month, 0)) DESC, c.name
        LIMIT 1`).get();
    return row?.id;
  };
  const clientId = session.role === "CLIENT" ? session.clientId! : params.client || defaultClient();
  if (!clientId) return null;

  const client: any = db().prepare("SELECT * FROM clients WHERE id=?").get(clientId);
  if (!client) return null;

  // Staff see drafts; clients only ever see published months.
  const publishedOnly = session.role === "CLIENT";
  const periods = clientHistory(clientId, publishedOnly);
  if (!periods.length) {
    return { session, client, clients: allClients(session), periods: [], cur: null } as const;
  }

  /**
   * Default to the most recent period that actually has figures, not simply the newest
   * row. An advisor opening the dashboard on the first of the month would otherwise land
   * on an empty shell for a month nobody has closed yet — every view blank, every alert
   * about missing data, and the real state of the book hidden one dropdown away.
   */
  const lastWithData = (() => {
    for (let i = periods.length - 1; i >= 0; i--) {
      if (periods[i].revenue !== 0 || periods[i].directCost !== 0) return i;
    }
    return periods.length - 1;
  })();

  const idx = params.month
    ? Math.max(0, periods.findIndex((p) => p.periodId === params.month))
    : lastWithData;
  const cur = periods[idx] ?? periods[periods.length - 1];
  const mode = (params.mode as ComparisonMode) || "PRIOR_MONTH";
  const entity = params.entity || "ALL";

  // The vertical carries the opinion; the client record overrides it where a business
  // genuinely differs from its industry.
  const profile = vertical(client.vertical);
  const bands = bandsFor(profile, client);
  const laborTarget = bands.labor ?? { lo: client.target_labor_lo, hi: client.target_labor_hi };
  const checkPair = (a: PeriodMetrics, b: PeriodMetrics, m: string) =>
    checkComparability(periodContext(a, clientId), periodContext(b, clientId),
      { mode: m, entityScope: entity });

  const volume = volumeFor(cur.periodId);
  const budget = budgetVariance(cur, clientId);
  const budgetBasis = budget.available
    ? {
        revenue: budget.lines.find((l) => l.label === "Revenue")?.budget ?? 0,
        directCost: budget.lines.find((l) => l.label === "Direct labor")?.budget ?? 0,
        opex: budget.lines.find((l) => l.label === "Overhead")?.budget ?? 0,
        netIncome: budget.lines.find((l) => l.label === "Net income")?.budget ?? 0,
      }
    : null;

  return {
    session,
    client,
    clients: allClients(session),
    periods,
    cur,
    idx,
    mode,
    entity,
    laborTarget,
    // Entity-filtered figures, so every view respects the pills identically.
    view: entityView(cur, entity),
    prev: idx > 0 ? periods[idx - 1] : null,
    profile,
    bands,
    volume,
    management: profile.directCostModel === "management_basis" ? managementBasis(cur) : null,
    fees: profile.directCostModel === "management_basis" ? feeRecovery(cur.periodId) : null,
    channels: profile.directCostModel === "management_basis" ? channelMix(cur.periodId) : null,
    comparison: buildComparison(cur, periods, mode, budgetBasis,
      { laborTarget, checkPair, entityScope: entity, language: profile.language }),
    confidence: assessConfidence(cur, clientId,
      checkPair(cur, periods[Math.max(idx - 1, 0)], mode)),
    balance: balanceSheet(cur.periodId, cur.netIncome),
    cash13: cashOutlook(cur, profile),
    actions: openActions(clientId, cur),
    budget,
    perDay: normalisePerDay(cur, periodContext(cur, clientId).daysCovered),
    priorYear: periods.filter((p) => p.year === cur.year - 1),
    thisYear: periods.filter((p) => p.year === cur.year && p.month <= cur.month),
  } as const;
}

/**
 * Volume for a period, if recorded. Absent is normal — a business that does not track
 * units still gets everything else.
 */
export function volumeFor(periodId: string) {
  const rows: any[] = db().prepare(
    `SELECT v.*, e.name entity_name FROM volume_lines v
       JOIN entities e ON e.id = v.entity_id WHERE v.period_id = ?`).all(periodId);
  if (!rows.length) return null;
  const sold = rows.reduce((s, r) => s + r.units_sold, 0);
  const available = rows.reduce((s, r) => s + (r.units_available ?? 0), 0);
  return {
    available: true,
    rows: rows.map((r) => ({
      entity: r.entity_name, sold: r.units_sold,
      capacity: r.units_available, note: r.note,
      utilisation: r.units_available ? (r.units_sold / r.units_available) * 100 : null,
    })),
    totalSold: sold,
    totalCapacity: available || null,
    utilisation: available ? Math.round((sold / available) * 1000) / 10 : null,
  };
}

function allClients(session: { role: string }) {
  if (session.role === "CLIENT") return [];
  return db().prepare("SELECT id, name FROM clients ORDER BY name").all() as { id: string; name: string }[];
}

/** Narrows a period to one business without recomputing anything. */
export function entityView(cur: PeriodMetrics, entityId: string) {
  if (entityId === "ALL") return cur;
  const e = cur.entities.find((x) => x.id === entityId);
  if (!e) return cur;
  return { ...cur, revenue: e.revenue, directCost: e.directCost, grossProfit: e.grossProfit,
    grossMarginPct: e.grossMarginPct, opex: e.opex, netIncome: e.netIncome,
    netMarginPct: e.netMarginPct, laborPct: e.laborPct };
}

/** Live alert count for the rail badge. */
export function alertsFor(ctx: NonNullable<DashboardContext>) {
  if (!ctx.cur) return [];
  const { cur, client, comparison, confidence, actions } = ctx as any;
  const out: { sev: "critical" | "high" | "medium" | "low"; heading: string; body: string; meta: string }[] = [];

  // Only alert on a band the vertical actually defines. A short-term rental has no
  // labour ratio worth judging, and inventing one would be noise.
  const band = (ctx as any).bands?.labor;
  const lang = (ctx as any).profile?.language;
  if (band && cur.laborPct > band.hi)
    out.push({ sev: "high", heading: `${lang?.laborRatioLabel ?? "Labor ratio"} above the healthy band`,
      body: `${cur.laborPct.toFixed(1)}% against a ${band.lo}–${band.hi}% band. ${lang?.laborGuidance ?? ""}`.trim(),
      meta: `Metric · ${(lang?.laborRatioLabel ?? "labor ratio").toLowerCase()} · consolidated` });
  if (band && cur.revenue > 0 && cur.laborPct < band.lo)
    out.push({ sev: "high", heading: `${lang?.laborRatioLabel ?? "Labor ratio"} below the healthy band`,
      body: `${cur.laborPct.toFixed(1)}% is below the floor. ${lang?.laborGuidance ?? ""}`.trim(),
      meta: `Metric · ${(lang?.laborRatioLabel ?? "labor ratio").toLowerCase()} · consolidated` });

  // Occupancy and enrolment, where the vertical tracks capacity.
  const vol = (ctx as any).volume;
  const occBand = (ctx as any).bands?.occupancy;
  if (vol?.utilisation != null && occBand) {
    const unit = (ctx as any).profile?.volume?.label ?? "Utilisation";
    if (vol.utilisation < occBand.lo)
      out.push({ sev: "high", heading: `${unit} below target`,
        body: `${vol.utilisation}% against a ${occBand.lo}–${occBand.hi}% band. Unsold capacity is the fastest margin to recover.`,
        meta: "Metric · utilisation" });
    else if (vol.utilisation > occBand.hi)
      out.push({ sev: "low", heading: `${unit} above the band`,
        body: `${vol.utilisation}% — running near capacity. Consider whether rate can rise before volume does.`,
        meta: "Metric · utilisation" });
  }

  for (const e of cur.entities.filter((x: any) => x.netIncome < 0))
    out.push({ sev: "medium", heading: `${e.name} is loss-making`,
      body: `$${Math.abs(e.netIncome).toFixed(1)}K loss for ${cur.label}.`, meta: `Entity · ${e.name}` });

  const past90 = cur.ar.reduce((s: number, a: any) => s + a.b90p, 0);
  if (past90 > 0)
    out.push({ sev: "high", heading: "Receivables past ninety days",
      body: `$${past90.toFixed(1)}K outstanding beyond ninety days. Timely filing limits may apply.`,
      meta: "Metric · AR ageing" });

  for (const i of comparison.issues.filter((x: any) => x.severity !== "note"))
    out.push({ sev: i.severity === "blocking" ? "critical" : "low", heading: "Comparability",
      body: i.message, meta: "Engine · comparability gate" });

  for (const c of confidence.components.filter((x: any) => x.score < 80))
    out.push({ sev: "low", heading: `Evidence: ${c.name}`, body: c.detail, meta: "Engine · confidence" });

  // A subsidised service is invisible in a normal P&L and is usually the fastest
  // recoverable margin in a management business.
  const fees = (ctx as any).fees;
  if (fees?.available) {
    for (const l of fees.lines.filter((x: any) => x.margin < 0)) {
      out.push({ sev: "high", heading: `${l.feeType.charAt(0)}${l.feeType.slice(1).toLowerCase()} is billed below cost`,
        body: `$${l.billed}K billed against $${l.cost}K paid to vendors — a loss on every occurrence. ${l.note}`.trim(),
        meta: "Metric · fee recovery" });
    }
    if (fees.recoveryPct != null && fees.recoveryPct < 95)
      out.push({ sev: "medium", heading: "Fee recovery below target",
        body: `${fees.recoveryPct}% of billed fees collected. $${(fees.totalBilled - fees.totalCollected).toFixed(1)}K outstanding.`,
        meta: "Metric · fee recovery" });
  }
  const ch = (ctx as any).channels;
  if (ch?.available && ch.topChannelShare > 60)
    out.push({ sev: "medium", heading: "Booking channel concentration",
      body: `${ch.topChannelShare}% of gross bookings through ${ch.channels[0].channel}. A change to that platform's terms would land on most of the portfolio at once.`,
      meta: "Metric · channel mix" });
  const mb = (ctx as any).management;
  if (mb?.available && !mb.reconciles)
    out.push({ sev: "critical", heading: "Management bridge does not reconcile",
      body: `Out by $${mb.bridgeGap.toFixed(1)}K. A pass-through category is missing or double counted, so the owner-facing figure and the books disagree.`,
      meta: "Engine · management basis" });

  for (const a of actions)
    out.push({ sev: a.monthsOpen >= 3 ? "high" : "medium", heading: a.title, body: a.detail,
      meta: `Commitment · ${a.owner || "unassigned"} · raised ${a.openedLabel} · ${a.monthsOpen} months open` });

  return out;
}
