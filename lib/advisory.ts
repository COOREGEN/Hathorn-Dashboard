/**
 * The advisory layer.
 *
 * The dashboard could show what happened this month against last month. That is not
 * an advisory meeting — it is a report. The four things here are what a partner
 * actually reaches for in the first ten minutes:
 *
 *   1. Prior year, because seasonality makes month-over-month misleading.
 *   2. Budget variance, because the client agreed to a number and either hit it or didn't.
 *   3. Balance sheet ratios, because half the financials were missing.
 *   4. Cash runway, because a payer lag is a cash problem before it is a P&L problem.
 */

import { db } from "./db";
import { computePeriod, computePeriods, type PeriodMetrics } from "./metrics";
import { vertical, type VerticalProfile } from "./verticals";

const r1 = (n: number) => Math.round(n * 10) / 10;
const pctChange = (now: number, then: number) =>
  then === 0 ? null : r1(((now - then) / Math.abs(then)) * 100);

/* ------------------------------------------------------------------ */
/* Prior year                                                          */
/* ------------------------------------------------------------------ */

export type YoY = {
  available: boolean;
  label: string;
  revenue: number; revenueDelta: number | null;
  netIncome: number; netIncomeDelta: number | null;
  laborPct: number; laborPctPoints: number | null;
  hours: number; hoursDelta: number | null;
};

/**
 * The same month a year earlier. Only published or reviewed periods count — a period
 * that never cleared the gate is not a comparison basis.
 */
export function yearOverYear(cur: PeriodMetrics, clientId: string): YoY {
  const prior: any = db().prepare(
    `SELECT id FROM periods
      WHERE client_id=? AND year=? AND month=? AND status IN ('PUBLISHED','IN_REVIEW')`,
  ).get(clientId, cur.year - 1, cur.month);

  const empty: YoY = {
    available: false, label: `${cur.label.split(" ")[0]} ${cur.year - 1}`,
    revenue: 0, revenueDelta: null, netIncome: 0, netIncomeDelta: null,
    laborPct: 0, laborPctPoints: null, hours: 0, hoursDelta: null,
  };
  if (!prior) return empty;

  const p = computePeriod(prior.id);
  const curHours = cur.entities.reduce((s, e) => s + e.payroll.hoursPaid, 0);
  const priorHours = p.entities.reduce((s, e) => s + e.payroll.hoursPaid, 0);

  return {
    available: true, label: p.label,
    revenue: p.revenue, revenueDelta: pctChange(cur.revenue, p.revenue),
    netIncome: p.netIncome, netIncomeDelta: pctChange(cur.netIncome, p.netIncome),
    laborPct: p.laborPct,
    laborPctPoints: p.laborPct ? r1(cur.laborPct - p.laborPct) : null,
    hours: priorHours, hoursDelta: pctChange(curHours, priorHours),
  };
}

/* ------------------------------------------------------------------ */
/* Budget                                                              */
/* ------------------------------------------------------------------ */

export type BudgetLine = {
  label: string; actual: number; budget: number;
  variance: number; variancePct: number | null;
  /** True when the variance is the direction the client wants. */
  favourable: boolean;
};
export type BudgetVariance = { available: boolean; lines: BudgetLine[]; ytd: BudgetLine[] };

/**
 * Compares actuals to the agreed plan.
 *
 * Sign convention matters: over-budget revenue is good, over-budget cost is bad, and
 * showing both as a bare positive number is how variance reports become useless.
 */
export function budgetVariance(cur: PeriodMetrics, clientId: string): BudgetVariance {
  const rows: any[] = db().prepare(
    "SELECT category, SUM(amount) total FROM budget_lines WHERE client_id=? AND year=? AND month=? GROUP BY category",
  ).all(clientId, cur.year, cur.month);
  if (!rows.length) return { available: false, lines: [], ytd: [] };

  const budgetFor = (cat: string) => rows.find((r) => r.category === cat)?.total ?? 0;

  const build = (label: string, actual: number, budget: number, higherIsBetter: boolean): BudgetLine => {
    const variance = r1(actual - budget);
    return {
      label, actual: r1(actual), budget: r1(budget), variance,
      variancePct: pctChange(actual, budget),
      favourable: higherIsBetter ? variance >= 0 : variance <= 0,
    };
  };

  const lines = [
    build("Revenue", cur.revenue, budgetFor("REVENUE"), true),
    build("Direct labor", cur.directCost, budgetFor("DIRECT_COST"), false),
    build("Overhead", cur.opex, budgetFor("OPEX"), false),
    build("Net income", cur.netIncome, budgetFor("NET_INCOME"), true),
  ].filter((l) => l.budget !== 0);

  // Year to date against the plan for the same elapsed months.
  const ytdRows: any[] = db().prepare(
    "SELECT category, SUM(amount) total FROM budget_lines WHERE client_id=? AND year=? AND month<=? GROUP BY category",
  ).all(clientId, cur.year, cur.month);
  const ytdBudget = (cat: string) => ytdRows.find((r) => r.category === cat)?.total ?? 0;

  const actualPeriods: any[] = db().prepare(
    `SELECT id FROM periods WHERE client_id=? AND year=? AND month<=? AND status IN ('PUBLISHED','IN_REVIEW')
      ORDER BY month`,
  ).all(clientId, cur.year, cur.month);
  const actuals = computePeriods(actualPeriods.map((p) => p.id));
  const sum = (f: (p: PeriodMetrics) => number) => actuals.reduce((s, p) => s + f(p), 0);

  const ytd = [
    build("Revenue", sum((p) => p.revenue), ytdBudget("REVENUE"), true),
    build("Direct labor", sum((p) => p.directCost), ytdBudget("DIRECT_COST"), false),
    build("Overhead", sum((p) => p.opex), ytdBudget("OPEX"), false),
    build("Net income", sum((p) => p.netIncome), ytdBudget("NET_INCOME"), true),
  ].filter((l) => l.budget !== 0);

  return { available: lines.length > 0, lines, ytd };
}

/* ------------------------------------------------------------------ */
/* Balance sheet                                                       */
/* ------------------------------------------------------------------ */

export type BalanceSheet = {
  available: boolean;
  currentAssets: number; fixedAssets: number; totalAssets: number;
  currentLiabilities: number; longTermLiabilities: number; totalLiabilities: number;
  equity: number;
  workingCapital: number;
  currentRatio: number | null;
  debtToEquity: number | null;
  /** Net income plus a rough add-back, over annualised debt service. Banks want ≥ 1.25. */
  debtServiceCoverage: number | null;
  balances: boolean;
  lines: { section: string; label: string; amount: number }[];
};

export function balanceSheet(periodId: string, netIncome: number): BalanceSheet {
  const rows: any[] = db()
    .prepare("SELECT section, label, amount FROM balance_lines WHERE period_id=? ORDER BY section, sort")
    .all(periodId);

  const empty: BalanceSheet = {
    available: false, currentAssets: 0, fixedAssets: 0, totalAssets: 0,
    currentLiabilities: 0, longTermLiabilities: 0, totalLiabilities: 0, equity: 0,
    workingCapital: 0, currentRatio: null, debtToEquity: null,
    debtServiceCoverage: null, balances: true, lines: [],
  };
  if (!rows.length) return empty;

  const total = (section: string) =>
    r1(rows.filter((r) => r.section === section).reduce((s, r) => s + r.amount, 0));

  const currentAssets = total("CURRENT_ASSET");
  const fixedAssets = total("FIXED_ASSET");
  const currentLiabilities = total("CURRENT_LIABILITY");
  const longTermLiabilities = total("LONG_TERM_LIABILITY");
  const equity = total("EQUITY");

  const totalAssets = r1(currentAssets + fixedAssets);
  const totalLiabilities = r1(currentLiabilities + longTermLiabilities);

  const period: any = db().prepare("SELECT debt_service_monthly FROM periods WHERE id=?").get(periodId);
  const debtService = period?.debt_service_monthly ?? 0;

  return {
    available: true,
    currentAssets, fixedAssets, totalAssets,
    currentLiabilities, longTermLiabilities, totalLiabilities, equity,
    workingCapital: r1(currentAssets - currentLiabilities),
    currentRatio: currentLiabilities ? r1(currentAssets / currentLiabilities) : null,
    debtToEquity: equity ? r1(totalLiabilities / equity) : null,
    debtServiceCoverage: debtService ? r1(netIncome / debtService) : null,
    // Assets should equal liabilities plus equity; $0.5K of slack absorbs rounding.
    balances: Math.abs(totalAssets - (totalLiabilities + equity)) <= 0.5,
    lines: rows.map((r) => ({ section: r.section, label: r.label, amount: r.amount })),
  };
}

/* ------------------------------------------------------------------ */
/* Cash runway                                                         */
/* ------------------------------------------------------------------ */

export type CashOutlook = {
  weeks: { week: number; label: string; inflow: number; outflow: number; balance: number }[];
  lowestBalance: number;
  lowestWeek: number;
  weeksOfCover: number | null;
  goesNegative: boolean;
};

/**
 * A thirteen-week cash projection.
 *
 * For a business paid by Medicaid on a three-week lag while payroll runs fortnightly,
 * this is the most valuable page in the statement: a claims delay shows up here weeks
 * before it reaches the P&L. Collections are modelled by ageing bucket — current
 * balances land soon, 90-plus balances are discounted heavily because a lot of it
 * never arrives.
 */
export function cashOutlook(cur: PeriodMetrics, profile?: VerticalProfile): CashOutlook {
  // Collections behaviour is the most vertical-specific assumption in the platform.
  // Medicaid pays slowly and denies a real share of aged claims; a rental platform remits
  // within days; a contractor holds retainage for months. Using one curve for all three
  // produces a projection that is confidently wrong for two of them.
  const p = profile ?? vertical("generic");
  const weeklyRevenue = cur.revenue / 4.33;
  const weeklyPayroll = cur.totalPayroll / 4.33;
  const weeklyOpex = cur.opex / 4.33;

  const buckets = [
    cur.ar.reduce((s, a) => s + a.b0_30, 0),
    cur.ar.reduce((s, a) => s + a.b31_60, 0),
    cur.ar.reduce((s, a) => s + a.b61_90, 0),
    cur.ar.reduce((s, a) => s + a.b90p, 0),
  ];
  const collect = p.receivables.collection.map((c, i) => ({ bucket: buckets[i] ?? 0, ...c }));

  let balance = cur.cash.total;
  const weeks: CashOutlook["weeks"] = [];
  let lowestBalance = balance;
  let lowestWeek = 0;

  for (let w = 1; w <= 13; w++) {
    let inflow = weeklyRevenue * p.receivables.immediateShare;
    for (const c of collect) {
      if (w >= c.startWeek && w < c.startWeek + c.spread) {
        inflow += (c.bucket * c.rate) / c.spread;
      }
    }
    const outflow = weeklyPayroll + weeklyOpex;
    balance = balance + inflow - outflow;
    if (balance < lowestBalance) { lowestBalance = balance; lowestWeek = w; }
    weeks.push({ week: w, label: `W${w}`, inflow: r1(inflow), outflow: r1(outflow), balance: r1(balance) });
  }

  const weeklyBurn = weeklyPayroll + weeklyOpex;
  return {
    weeks,
    lowestBalance: r1(lowestBalance),
    lowestWeek,
    weeksOfCover: weeklyBurn > 0 ? r1(cur.cash.total / weeklyBurn) : null,
    goesNegative: lowestBalance < 0,
  };
}

/* ------------------------------------------------------------------ */
/* Action items that outlive the period                                */
/* ------------------------------------------------------------------ */

export type ActionItem = {
  id: string; title: string; detail: string; owner: string; due: string;
  status: string; impact: number; openedLabel: string; monthsOpen: number;
};

/**
 * Advisory value is follow-through. An action raised in May and still open in August
 * is the most important line in the August meeting, and it used to disappear the
 * moment the next period published.
 */
export function openActions(clientId: string, asOf: PeriodMetrics): ActionItem[] {
  const rows: any[] = db().prepare(
    `SELECT a.*, p.year opened_year, p.month opened_month
       FROM action_items a
       JOIN periods p ON p.id = a.opened_period_id
      WHERE a.client_id = ? AND a.status = 'OPEN'
      ORDER BY a.impact DESC, a.created_at ASC`,
  ).all(clientId);

  return rows.map((r) => {
    const months =
      (asOf.year - r.opened_year) * 12 + (asOf.month - r.opened_month);
    return {
      id: r.id, title: r.title, detail: r.detail, owner: r.owner, due: r.due,
      status: r.status, impact: r.impact,
      openedLabel: `${["", "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][r.opened_month]} ${r.opened_year}`,
      monthsOpen: Math.max(months, 0),
    };
  });
}

export function closedSince(clientId: string, periodId: string): ActionItem[] {
  const rows: any[] = db().prepare(
    `SELECT a.*, p.year opened_year, p.month opened_month
       FROM action_items a
       JOIN periods p ON p.id = a.opened_period_id
      WHERE a.client_id = ? AND a.closed_period_id = ?`,
  ).all(clientId, periodId);
  return rows.map((r) => ({
    id: r.id, title: r.title, detail: r.detail, owner: r.owner, due: r.due,
    status: r.status, impact: r.impact,
    openedLabel: `${["", "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][r.opened_month]} ${r.opened_year}`,
    monthsOpen: 0,
  }));
}
