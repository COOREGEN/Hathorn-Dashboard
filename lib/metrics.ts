import { db, monthShort } from "./db";

export type EntityMetrics = {
  id: string; name: string; status: string;
  revenue: number; directCost: number; grossProfit: number; grossMarginPct: number;
  opex: number; netIncome: number; netMarginPct: number; laborPct: number;
  payroll: { wages: number; otPremium: number; taxes: number; workersComp: number; processing: number; hoursPaid: number };
};

export type PeriodMetrics = {
  periodId: string; year: number; month: number; label: string; status: string;
  entities: EntityMetrics[];
  revenue: number; directCost: number; grossProfit: number; grossMarginPct: number;
  opex: number; netIncome: number; netMarginPct: number; laborPct: number;
  totalPayroll: number; otPremium: number;
  cash: { operating: number; reserve: number; total: number };
  ar: { payer: string; b0_30: number; b31_60: number; b61_90: number; b90p: number; total: number }[];
  arTotal: number;
  notes: { id: string; slot: string; tone: string; heading: string; body: string }[];
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const EMPTY_PAYROLL = { wages: 0, otPremium: 0, taxes: 0, workersComp: 0, processing: 0, hoursPaid: 0 };

/** SQLite caps variables per statement; chunk long id lists to stay well under it. */
function chunk<T>(arr: T[], size = 400): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function fetchAll<T>(sql: (placeholders: string) => string, ids: string[]): T[] {
  if (!ids.length) return [];
  const rows: T[] = [];
  for (const group of chunk(ids)) {
    const ph = group.map(() => "?").join(",");
    rows.push(...(db().prepare(sql(ph)).all(...group) as T[]));
  }
  return rows;
}

/**
 * Computes metrics for many periods at once.
 *
 * The naive shape — loop periods, loop entities, run a SUM per category — costs
 * roughly 200 queries for a twelve-month dashboard. Everything here is fetched in a
 * fixed number of batched queries instead (six, regardless of how many periods),
 * then assembled in memory. Query count stays flat as clients and history grow.
 */
export function computePeriods(periodIds: string[]): PeriodMetrics[] {
  if (!periodIds.length) return [];

  const periods = fetchAll<any>((ph) => `SELECT * FROM periods WHERE id IN (${ph})`, periodIds);
  if (!periods.length) return [];

  const clientIds = Array.from(new Set(periods.map((p) => p.client_id)));
  const entities = fetchAll<any>(
    (ph) => `SELECT * FROM entities WHERE client_id IN (${ph}) ORDER BY rowid`, clientIds);

  // Pre-aggregate the P&L in SQL rather than summing row-by-row in JS.
  const plRows = fetchAll<any>((ph) =>
    `SELECT period_id, entity_id, category, SUM(amount) total
       FROM pl_lines WHERE period_id IN (${ph})
      GROUP BY period_id, entity_id, category`, periodIds);
  const payRows = fetchAll<any>((ph) =>
    `SELECT * FROM payroll_lines WHERE period_id IN (${ph})`, periodIds);
  const cashRows = fetchAll<any>((ph) =>
    `SELECT * FROM cash_balances WHERE period_id IN (${ph})`, periodIds);
  const arRows = fetchAll<any>((ph) =>
    `SELECT * FROM ar_buckets WHERE period_id IN (${ph}) ORDER BY rowid`, periodIds);
  const noteRows = fetchAll<any>((ph) =>
    `SELECT * FROM story_notes WHERE period_id IN (${ph}) ORDER BY slot, sort`, periodIds);

  const entitiesByClient = new Map<string, any[]>();
  for (const e of entities) {
    if (!entitiesByClient.has(e.client_id)) entitiesByClient.set(e.client_id, []);
    entitiesByClient.get(e.client_id)!.push(e);
  }

  const plMap = new Map<string, number>();
  for (const r of plRows) plMap.set(`${r.period_id}|${r.entity_id}|${r.category}`, r.total);

  const payMap = new Map<string, any>();
  for (const r of payRows) payMap.set(`${r.period_id}|${r.entity_id}`, r);

  const cashMap = new Map<string, any>();
  for (const r of cashRows) cashMap.set(r.period_id, r);

  const arMap = new Map<string, any[]>();
  for (const r of arRows) {
    if (!arMap.has(r.period_id)) arMap.set(r.period_id, []);
    arMap.get(r.period_id)!.push(r);
  }

  const noteMap = new Map<string, any[]>();
  for (const r of noteRows) {
    if (!noteMap.has(r.period_id)) noteMap.set(r.period_id, []);
    noteMap.get(r.period_id)!.push(r);
  }

  const byId = new Map(periods.map((p) => [p.id, p]));

  return periodIds.filter((id) => byId.has(id)).map((periodId) => {
    const period = byId.get(periodId)!;
    const clientEntities = entitiesByClient.get(period.client_id) || [];

    const em: EntityMetrics[] = clientEntities.map((e) => {
      const get = (cat: string) => plMap.get(`${periodId}|${e.id}|${cat}`) || 0;
      const revenue = get("REVENUE");
      const directCost = get("DIRECT_COST");
      const opex = get("OPEX");
      const p = payMap.get(`${periodId}|${e.id}`);
      const grossProfit = revenue - directCost;
      const netIncome = grossProfit - opex;
      return {
        id: e.id, name: e.name, status: e.status,
        revenue: r1(revenue), directCost: r1(directCost), grossProfit: r1(grossProfit),
        grossMarginPct: revenue ? r1((grossProfit / revenue) * 100) : 0,
        opex: r1(opex), netIncome: r1(netIncome),
        netMarginPct: revenue ? r1((netIncome / revenue) * 100) : 0,
        laborPct: revenue ? r1((directCost / revenue) * 100) : 0,
        payroll: p
          ? { wages: p.wages, otPremium: p.ot_premium, taxes: p.taxes,
              workersComp: p.workers_comp, processing: p.processing, hoursPaid: p.hours_paid }
          : { ...EMPTY_PAYROLL },
      };
    });

    const revenue = r1(em.reduce((s, e) => s + e.revenue, 0));
    const directCost = r1(em.reduce((s, e) => s + e.directCost, 0));
    const opex = r1(em.reduce((s, e) => s + e.opex, 0));
    const grossProfit = r1(revenue - directCost);
    const netIncome = r1(grossProfit - opex);
    const totalPayroll = r1(em.reduce((s, e) =>
      s + e.payroll.wages + e.payroll.otPremium + e.payroll.taxes + e.payroll.workersComp + e.payroll.processing, 0));
    const otPremium = r1(em.reduce((s, e) => s + e.payroll.otPremium, 0));

    const cash = cashMap.get(periodId) || { operating: 0, reserve: 0 };
    const ar = arMap.get(periodId) || [];
    const notes = noteMap.get(periodId) || [];

    return {
      periodId, year: period.year, month: period.month,
      label: `${monthShort(period.month)} ${period.year}`, status: period.status,
      entities: em, revenue, directCost, grossProfit,
      grossMarginPct: revenue ? r1((grossProfit / revenue) * 100) : 0,
      opex, netIncome, netMarginPct: revenue ? r1((netIncome / revenue) * 100) : 0,
      laborPct: revenue ? r1((directCost / revenue) * 100) : 0,
      totalPayroll, otPremium,
      cash: { operating: cash.operating, reserve: cash.reserve, total: r1(cash.operating + cash.reserve) },
      ar: ar.map((a) => ({
        payer: a.payer, b0_30: a.b0_30, b31_60: a.b31_60, b61_90: a.b61_90, b90p: a.b90p,
        total: r1(a.b0_30 + a.b31_60 + a.b61_90 + a.b90p),
      })),
      arTotal: r1(ar.reduce((s, a) => s + a.b0_30 + a.b31_60 + a.b61_90 + a.b90p, 0)),
      notes: notes.map((n) => ({ id: n.id, slot: n.slot, tone: n.tone, heading: n.heading, body: n.body })),
    };
  });
}

export function computePeriod(periodId: string): PeriodMetrics {
  const [result] = computePeriods([periodId]);
  if (!result) throw new Error("Period not found");
  return result;
}

/** All periods for a client (optionally only published), oldest first, fully computed. */
export function clientHistory(clientId: string, publishedOnly: boolean): PeriodMetrics[] {
  const rows: any[] = db()
    .prepare(`SELECT id FROM periods WHERE client_id = ? ${publishedOnly ? "AND status='PUBLISHED'" : ""} ORDER BY year, month`)
    .all(clientId);
  return computePeriods(rows.map((r) => r.id));
}

export const fmtK = (n: number) => {
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  return v >= 1000 ? `${sign}$${(v / 1000).toFixed(2)}M` : `${sign}$${v.toFixed(1)}K`;
};
