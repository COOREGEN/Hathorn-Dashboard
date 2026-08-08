/**
 * Frozen statement reads.
 *
 * Staff prep surfaces (/dash, /review) use live tables. Client-facing surfaces read
 * active release snapshots so a statement that has been published cannot change
 * underneath the reader — including advisory sections frozen at publish time.
 */
import { db } from "./db";
import { activeRelease, publishedPeriods } from "./release";
import type { PeriodMetrics } from "./metrics";
import { yearOverYear, budgetVariance, balanceSheet, cashOutlook, closedSince } from "./advisory";

/** Reconstruct a PeriodMetrics-shaped object from a frozen release snapshot. */
export function periodFromRelease(periodId: string): PeriodMetrics | null {
  const release = activeRelease(periodId);
  if (!release) return null;
  const s = release.snapshot;
  const f = s.figures;
  return {
    periodId: s.period.id,
    year: s.period.year,
    month: s.period.month,
    label: s.period.label,
    status: "PUBLISHED",
    revenue: f.revenue,
    directCost: f.directCost,
    grossProfit: f.grossProfit,
    grossMarginPct: f.grossMarginPct,
    opex: f.opex,
    netIncome: f.netIncome,
    netMarginPct: f.netMarginPct,
    laborPct: f.laborPct,
    totalPayroll: f.totalPayroll,
    otPremium: f.otPremium,
    cash: typeof f.cash === "object" && f.cash
      ? f.cash
      : { operating: 0, reserve: 0, total: Number(f.cash) || 0 },
    ar: (s.receivables || []).map((a: any) => ({
      payer: a.payer,
      b0_30: a.b0_30, b31_60: a.b31_60, b61_90: a.b61_90, b90p: a.b90p,
      total: a.total ?? (a.b0_30 + a.b31_60 + a.b61_90 + a.b90p),
    })),
    arTotal: f.arTotal,
    entities: (s.entities || []).map((e: any) => ({
      id: e.id, name: e.name, status: e.status,
      revenue: e.revenue, directCost: e.directCost, grossProfit: e.grossProfit,
      grossMarginPct: e.grossMarginPct, opex: e.opex, netIncome: e.netIncome,
      netMarginPct: e.netMarginPct, laborPct: e.laborPct,
      payroll: e.payroll || { wages: 0, otPremium: 0, taxes: 0, workersComp: 0, processing: 0, hoursPaid: 0 },
    })),
    notes: (s.commentary || []).map((n: any, i: number) => ({
      id: `frozen-${periodId}-${i}`,
      slot: n.slot, tone: n.tone, heading: n.heading, body: n.body,
    })),
  };
}

/**
 * Every locked statement for a client, oldest-first for charts.
 * Periods without an active release are omitted — never fall back to live tables.
 */
export function lockedStatements(clientId: string): PeriodMetrics[] {
  const rows = publishedPeriods(clientId);
  const out: PeriodMetrics[] = [];
  for (const r of rows) {
    const p = periodFromRelease(r.period_id);
    if (p) out.push(p);
  }
  return out.reverse();
}

/** Goals for the statement — prefer engagement goals (client_goals), fall back to legacy. */
export function statementGoals(clientId: string) {
  const engagement: any[] = db().prepare(
    `SELECT id, title, detail, target_value, target_date, measured_by_kpi
       FROM client_goals WHERE client_id=? AND status='ACTIVE' ORDER BY sort, agreed_at`,
  ).all(clientId);
  if (engagement.length) {
    return engagement.map((g) => ({
      id: g.id,
      title: g.title,
      target: g.target_value != null
        ? String(g.target_value)
        : (g.target_date ? `By ${g.target_date}` : g.detail || ""),
      current: g.detail || "",
      progress: 0,
    }));
  }
  return (db().prepare("SELECT * FROM goals WHERE client_id=? AND active=1").all(clientId) as any[])
    .map((g) => ({ id: g.id, title: g.title, target: g.target, current: g.current, progress: g.progress }));
}

/**
 * Advisory bundle for the portal — prefers fields frozen in the release snapshot.
 * Prior-year series is built only from other locked statements for this client.
 */
export function portalAdvisory(clientId: string, cur: PeriodMetrics, allLocked: PeriodMetrics[]) {
  const snap = activeRelease(cur.periodId)?.snapshot;
  const priorYear = allLocked.filter((p) => p.year === cur.year - 1 && p.month <= cur.month);
  const priorByMonth = new Map(priorYear.map((p) => [p.month, p.revenue]));

  return {
    // YoY / budget use the frozen period figures as "actual"; basis rows stay published-only.
    yoy: yearOverYear(cur, clientId),
    budget: budgetVariance(cur, clientId),
    // Prefer snapshot; fall back only if an older release predates those fields.
    balance: snap?.balance ?? balanceSheet(cur.periodId, cur.netIncome),
    cash: snap?.cashOutlook ?? cashOutlook(cur),
    openActions: Array.isArray(snap?.actions) ? snap.actions : [],
    closedActions: closedSince(clientId, cur.periodId),
    priorYearSeries: priorYear.length
      ? Array.from({ length: cur.month }, (_, i) => priorByMonth.get(i + 1) ?? 0)
      : null,
  };
}
