/**
 * The metric registry.
 *
 * Two problems this solves, both raised by the obvious objection to hardcoded verticals:
 * *where did those numbers come from?*
 *
 *   1. **Coverage.** A firm serves clients that no fixed list anticipates. Metrics are
 *      formulas over named inputs, authored by the firm, so a new one needs no code.
 *   2. **Provenance.** A target is either agreed with the client, derived from that
 *      client's own trailing history, or taken from a documented external benchmark.
 *      Every target records which, and a metric with no basis is reported without a
 *      verdict rather than judged against a number nobody can defend.
 *
 * That third state matters. The honest default for a new client is "here is the number,
 * we have not yet agreed what good looks like" — not a band borrowed from a stranger.
 */

import { db, uid } from "./db";
import { evaluate, formulaInputs, validateFormula } from "./formula";
import { ValidationError } from "./validate";
import { computePeriod, type PeriodMetrics } from "./metrics";

/**
 * `money` is in thousands, matching the rest of the platform. `money_exact` is plain
 * dollars, for per-unit figures — a rate of $27.60 an hour rendered as $27.6K is not a
 * rounding problem, it is off by a thousand.
 */
/** Beyond this the tools stop being readable, so activation is capped rather than advised. */
export const ACTIVE_LIMIT = 60;

export type KpiUnit = "money" | "money_exact" | "percent" | "ratio" | "count" | "days";
export type KpiDirection = "higher_is_better" | "lower_is_better" | "target" | "target_range";
export type TargetSource = "AGREED" | "DERIVED" | "BENCHMARK" | "NONE";

export type KpiDefinition = {
  key: string; label: string; description: string; category: string;
  kind: "FORMULA" | "ACCOUNT_WATCH" | "NON_FINANCIAL";
  formula: string; unit: KpiUnit; direction: KpiDirection;
  materialityAbs: number | null; materialityRel: number | null;
  decimals: number; guidance: string; isDefault: boolean;
};

export type KpiConfig = {
  kpiKey: string; active: boolean; importance: number;
  targetLo: number | null; targetHi: number | null; targetPoint: number | null;
  targetSource: TargetSource; targetNote: string; sort: number;
};

/* ------------------------------------------------------------------ */
/* Inputs available to a formula                                       */
/* ------------------------------------------------------------------ */

/**
 * Everything a formula can reference for a period.
 *
 * Ledger figures come from the metrics engine; operational figures come from
 * `kpi_inputs`, which is how headcount, units, occupancy and anything else the ledger
 * does not carry become available. Most genuinely useful ratios need one of each.
 */
export function inputsFor(m: PeriodMetrics, entityId?: string): Record<string, number> {
  const scope = entityId && entityId !== "ALL"
    ? m.entities.find((e) => e.id === entityId)
    : null;

  const base: Record<string, number> = scope
    ? {
        revenue: scope.revenue, directCost: scope.directCost, grossProfit: scope.grossProfit,
        opex: scope.opex, netIncome: scope.netIncome,
        wages: scope.payroll.wages, overtimePremium: scope.payroll.otPremium,
        payrollTaxes: scope.payroll.taxes, workersComp: scope.payroll.workersComp,
        payrollProcessing: scope.payroll.processing,
        totalPayroll: scope.payroll.wages + scope.payroll.otPremium + scope.payroll.taxes
          + scope.payroll.workersComp + scope.payroll.processing,
        hoursPaid: scope.payroll.hoursPaid,
        cash: 0, cashOperating: 0, cashReserve: 0, receivables: 0,
        receivablesCurrent: 0, receivablesPast90: 0,
      }
    : {
        revenue: m.revenue, directCost: m.directCost, grossProfit: m.grossProfit,
        opex: m.opex, netIncome: m.netIncome,
        wages: m.entities.reduce((s, e) => s + e.payroll.wages, 0),
        overtimePremium: m.otPremium,
        payrollTaxes: m.entities.reduce((s, e) => s + e.payroll.taxes, 0),
        workersComp: m.entities.reduce((s, e) => s + e.payroll.workersComp, 0),
        payrollProcessing: m.entities.reduce((s, e) => s + e.payroll.processing, 0),
        totalPayroll: m.totalPayroll,
        hoursPaid: m.entities.reduce((s, e) => s + e.payroll.hoursPaid, 0),
        cash: m.cash.total, cashOperating: m.cash.operating, cashReserve: m.cash.reserve,
        receivables: m.arTotal,
        receivablesCurrent: m.ar.reduce((s, a) => s + a.b0_30, 0),
        receivablesPast90: m.ar.reduce((s, a) => s + a.b90p, 0),
      };

  // Balance sheet, when supplied.
  const bs: any[] = db().prepare(
    "SELECT section, SUM(amount) total FROM balance_lines WHERE period_id=? GROUP BY section").all(m.periodId);
  const sect = (s: string) => bs.find((r) => r.section === s)?.total ?? 0;
  base.currentAssets = sect("CURRENT_ASSET");
  base.fixedAssets = sect("FIXED_ASSET");
  base.currentLiabilities = sect("CURRENT_LIABILITY");
  base.longTermLiabilities = sect("LONG_TERM_LIABILITY");
  base.equity = sect("EQUITY");
  base.totalAssets = base.currentAssets + base.fixedAssets;
  base.totalLiabilities = base.currentLiabilities + base.longTermLiabilities;

  // Volume, when recorded.
  const vol: any = db().prepare(
    "SELECT SUM(units_sold) sold, SUM(units_available) avail FROM volume_lines WHERE period_id=?").get(m.periodId);
  base.unitsSold = vol?.sold ?? 0;
  base.unitsAvailable = vol?.avail ?? 0;

  // Days in the period, so anything can be expressed per day.
  const per: any = db().prepare("SELECT days_covered FROM periods WHERE id=?").get(m.periodId);
  base.daysInPeriod = per?.days_covered ?? 30;

  // Operational inputs override nothing; they add names the ledger cannot supply.
  const rows: any[] = entityId && entityId !== "ALL"
    ? db().prepare("SELECT input_key, SUM(value) v FROM kpi_inputs WHERE period_id=? AND entity_id=? GROUP BY input_key").all(m.periodId, entityId)
    : db().prepare("SELECT input_key, SUM(value) v FROM kpi_inputs WHERE period_id=? GROUP BY input_key").all(m.periodId);
  for (const r of rows) base[r.input_key] = r.v;

  return base;
}

/** Named inputs a formula author can choose from, for the editor. */
export const INPUT_CATALOGUE: { key: string; label: string; group: string }[] = [
  { key: "revenue", label: "Revenue", group: "Profit & loss" },
  { key: "directCost", label: "Direct cost", group: "Profit & loss" },
  { key: "grossProfit", label: "Gross profit", group: "Profit & loss" },
  { key: "opex", label: "Overhead", group: "Profit & loss" },
  { key: "netIncome", label: "Net income", group: "Profit & loss" },
  { key: "wages", label: "Wages", group: "Payroll" },
  { key: "overtimePremium", label: "Overtime premium", group: "Payroll" },
  { key: "payrollTaxes", label: "Employer taxes", group: "Payroll" },
  { key: "workersComp", label: "Workers' comp", group: "Payroll" },
  { key: "totalPayroll", label: "Total payroll", group: "Payroll" },
  { key: "hoursPaid", label: "Hours paid", group: "Payroll" },
  { key: "cash", label: "Cash total", group: "Cash" },
  { key: "cashOperating", label: "Operating cash", group: "Cash" },
  { key: "cashReserve", label: "Reserve cash", group: "Cash" },
  { key: "receivables", label: "Receivables", group: "Cash" },
  { key: "receivablesCurrent", label: "Receivables current–30", group: "Cash" },
  { key: "receivablesPast90", label: "Receivables past 90", group: "Cash" },
  { key: "currentAssets", label: "Current assets", group: "Balance sheet" },
  { key: "fixedAssets", label: "Fixed assets", group: "Balance sheet" },
  { key: "currentLiabilities", label: "Current liabilities", group: "Balance sheet" },
  { key: "longTermLiabilities", label: "Long-term liabilities", group: "Balance sheet" },
  { key: "equity", label: "Equity", group: "Balance sheet" },
  { key: "totalAssets", label: "Total assets", group: "Balance sheet" },
  { key: "totalLiabilities", label: "Total liabilities", group: "Balance sheet" },
  { key: "unitsSold", label: "Units sold", group: "Volume" },
  { key: "unitsAvailable", label: "Units available", group: "Volume" },
  { key: "daysInPeriod", label: "Days in period", group: "Period" },
];

/** Operational input names in use for a client, so the editor can offer them. */
export function operationalInputs(clientId: string): string[] {
  const rows: any[] = db().prepare(
    `SELECT DISTINCT i.input_key FROM kpi_inputs i
       JOIN periods p ON p.id = i.period_id WHERE p.client_id = ? ORDER BY 1`).all(clientId);
  return rows.map((r) => r.input_key);
}

export function knownInputs(clientId: string): string[] {
  return [...INPUT_CATALOGUE.map((i) => i.key), ...operationalInputs(clientId)];
}

/* ------------------------------------------------------------------ */
/* Definitions and configuration                                       */
/* ------------------------------------------------------------------ */

export function allDefinitions(): KpiDefinition[] {
  const rows: any[] = db().prepare("SELECT * FROM kpi_definitions ORDER BY category, label").all();
  return rows.map(rowToDef);
}

export function definition(key: string): KpiDefinition | null {
  const r: any = db().prepare("SELECT * FROM kpi_definitions WHERE key=?").get(key);
  return r ? rowToDef(r) : null;
}

function rowToDef(r: any): KpiDefinition {
  return {
    key: r.key, label: r.label, description: r.description || "", category: r.category || "General",
    kind: r.kind, formula: r.formula || "", unit: r.unit, direction: r.direction,
    materialityAbs: r.materiality_abs, materialityRel: r.materiality_rel,
    decimals: r.decimals ?? 1, guidance: r.guidance || "", isDefault: Boolean(r.is_default),
  };
}

/**
 * Saves a metric definition.
 *
 * Validates on write. A definition with an unparseable formula, or one referencing an
 * input that does not exist, saves happily and then returns null for every client that
 * activates it — the metric simply reads "—" forever and nobody knows why. Catching it
 * here means the person who wrote the formula is the person who sees the error.
 */
export function upsertDefinition(
  d: Partial<KpiDefinition> & { key: string; label: string },
  opts: { knownInputs?: string[] } = {},
) {
  if (!/^[a-z][a-z0-9_]*$/.test(d.key)) {
    throw new ValidationError("A metric key must be lower case letters, numbers and underscores, starting with a letter.");
  }
  if (!d.label?.trim()) throw new ValidationError("A metric needs a label.");

  const kind = d.kind ?? "FORMULA";
  if (kind === "FORMULA") {
    // Known inputs default to the ledger catalogue. A caller with operational inputs in
    // play passes the wider list.
    const known = opts.knownInputs ?? INPUT_CATALOGUE.map((i) => i.key);
    const err = validateFormula(d.formula ?? "", known);
    // An unknown name may legitimately be an operational input this client supplies, so
    // that alone is allowed; a formula that does not parse never is.
    if (err && !err.message.startsWith("Unknown input")) {
      throw new ValidationError(`Formula: ${err.message}`);
    }
    if (formulaInputs(d.formula ?? "").includes(d.key)) {
      throw new ValidationError("A metric cannot reference itself.");
    }
  }

  const UNITS = ["money", "money_exact", "percent", "ratio", "count", "days"];
  if (d.unit && !UNITS.includes(d.unit)) throw new ValidationError(`Unknown unit "${d.unit}".`);
  const DIRECTIONS = ["higher_is_better", "lower_is_better", "target", "target_range"];
  if (d.direction && !DIRECTIONS.includes(d.direction)) {
    throw new ValidationError(`Unknown direction "${d.direction}".`);
  }

  const existing = definition(d.key);
  if (existing) {
    db().prepare(`UPDATE kpi_definitions SET label=?, description=?, category=?, kind=?,
      formula=?, unit=?, direction=?, materiality_abs=?, materiality_rel=?, decimals=?, guidance=?
      WHERE key=?`).run(
      d.label, d.description ?? existing.description, d.category ?? existing.category,
      d.kind ?? existing.kind, d.formula ?? existing.formula, d.unit ?? existing.unit,
      d.direction ?? existing.direction, d.materialityAbs ?? existing.materialityAbs,
      d.materialityRel ?? existing.materialityRel, d.decimals ?? existing.decimals,
      d.guidance ?? existing.guidance, d.key);
  } else {
    db().prepare(`INSERT INTO kpi_definitions
      (id,key,label,description,category,kind,formula,unit,direction,materiality_abs,materiality_rel,decimals,guidance,is_default)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      uid(), d.key, d.label, d.description ?? "", d.category ?? "General",
      d.kind ?? "FORMULA", d.formula ?? "", d.unit ?? "money",
      d.direction ?? "higher_is_better", d.materialityAbs ?? null, d.materialityRel ?? null,
      d.decimals ?? 1, d.guidance ?? "", d.isDefault ? 1 : 0);
  }
}

export function clientConfig(clientId: string): KpiConfig[] {
  const rows: any[] = db().prepare(
    "SELECT * FROM kpi_client_config WHERE client_id=? ORDER BY sort, kpi_key").all(clientId);
  return rows.map((r) => ({
    kpiKey: r.kpi_key, active: Boolean(r.active), importance: r.importance ?? 2,
    targetLo: r.target_lo, targetHi: r.target_hi, targetPoint: r.target_point,
    targetSource: r.target_source ?? "NONE", targetNote: r.target_note || "", sort: r.sort ?? 0,
  }));
}

/**
 * Sets a client's configuration for one metric.
 *
 * The band is validated because an inverted one (low above high) is silently
 * catastrophic: nothing can ever fall inside it, so every period reads as a breach and
 * the client sits permanently at the top of the attention list for a reason that is not
 * real.
 */
export function setClientConfig(clientId: string, kpiKey: string, patch: Partial<KpiConfig>) {
  if (patch.targetLo != null && patch.targetHi != null && patch.targetLo >= patch.targetHi) {
    throw new ValidationError(
      `Target range is inverted: ${patch.targetLo} is not below ${patch.targetHi}. Nothing could ever fall inside it.`);
  }
  if (patch.importance != null && ![1, 2, 3].includes(patch.importance)) {
    throw new ValidationError("Importance must be 1 (low), 2 (normal) or 3 (key).");
  }
  const SOURCES = ["AGREED", "DERIVED", "BENCHMARK", "NONE"];
  if (patch.targetSource && !SOURCES.includes(patch.targetSource)) {
    throw new ValidationError(`Unknown target source "${patch.targetSource}".`);
  }
  // A target with a source but no numbers would claim provenance for nothing.
  if (patch.targetSource && patch.targetSource !== "NONE"
      && patch.targetLo == null && patch.targetHi == null && patch.targetPoint == null) {
    const existing = clientConfig(clientId).find((c) => c.kpiKey === kpiKey);
    const hasAny = existing && (existing.targetLo != null || existing.targetHi != null || existing.targetPoint != null);
    if (!hasAny) {
      throw new ValidationError("A target source needs a target: set a range or a point.");
    }
  }

  const existing = clientConfig(clientId).find((c) => c.kpiKey === kpiKey);
  const merged = { active: true, importance: 2, targetLo: null, targetHi: null,
    targetPoint: null, targetSource: "NONE" as TargetSource, targetNote: "", sort: 0,
    ...existing, ...patch };
  if (merged.active && !existing?.active) {
    const activeCount = clientConfig(clientId).filter((c) => c.active).length;
    if (activeCount >= ACTIVE_LIMIT) {
      throw new ValidationError(
        `${ACTIVE_LIMIT} active metrics is the limit. Beyond that the tools stop being readable — deactivate something first.`);
    }
  }

  db().prepare(`INSERT INTO kpi_client_config
    (id,client_id,kpi_key,active,importance,target_lo,target_hi,target_point,target_source,target_note,sort)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(client_id,kpi_key) DO UPDATE SET
      active=excluded.active, importance=excluded.importance,
      target_lo=excluded.target_lo, target_hi=excluded.target_hi,
      target_point=excluded.target_point, target_source=excluded.target_source,
      target_note=excluded.target_note, sort=excluded.sort`)
    .run(uid(), clientId, kpiKey, merged.active ? 1 : 0, merged.importance,
      merged.targetLo, merged.targetHi, merged.targetPoint, merged.targetSource,
      merged.targetNote, merged.sort);
}

/* ------------------------------------------------------------------ */
/* Derived targets                                                     */
/* ------------------------------------------------------------------ */

export type DerivedTarget = {
  available: boolean;
  lo: number | null; hi: number | null;
  median: number | null;
  months: number;
  note: string;
};

/**
 * A band from the client's own trailing history.
 *
 * This is the honest answer to "where did that number come from". Rather than importing
 * an industry figure of unknown provenance, the band is the middle of what this business
 * has actually done — the interquartile range of its own trailing months. It says
 * "normal for you is 68–74%", which is defensible, rather than "the industry does 65–72%",
 * which invites the question of which industry and whose data.
 *
 * Needs at least six months. Below that the range is noise and no band is offered.
 */
export function deriveTarget(clientId: string, kpiKey: string, asOf: { year: number; month: number }): DerivedTarget {
  const def = definition(kpiKey);
  if (!def) return { available: false, lo: null, hi: null, median: null, months: 0, note: "" };

  const periods: any[] = db().prepare(
    `SELECT id, year, month FROM periods
      WHERE client_id=? AND status='PUBLISHED'
        AND (year < ? OR (year = ? AND month < ?))
      ORDER BY year DESC, month DESC LIMIT 24`).all(clientId, asOf.year, asOf.year, asOf.month);

  const values: number[] = [];
  for (const p of periods) {
    try {
      const v = evaluate(def.formula, inputsFor(computePeriod(p.id)));
      if (v !== null) values.push(v);
    } catch { /* a period that cannot be computed simply does not contribute */ }
  }

  if (values.length < 6) {
    return { available: false, lo: null, hi: null, median: null, months: values.length,
      note: `Only ${values.length} closed month${values.length === 1 ? "" : "s"} available; at least six are needed before a range means anything.` };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const r = (n: number) => Math.round(n * 10) / 10;

  return {
    available: true,
    lo: r(at(0.25)), hi: r(at(0.75)), median: r(at(0.5)),
    months: values.length,
    note: `The middle half of this client's last ${values.length} closed months. Their own normal, not an industry figure.`,
  };
}

/* ------------------------------------------------------------------ */
/* Computation                                                         */
/* ------------------------------------------------------------------ */

export type KpiTrend = { label: string; value: number | null }[];

export type KpiResult = {
  key: string; label: string; category: string; unit: KpiUnit; direction: KpiDirection;
  decimals: number; guidance: string; importance: number;
  value: number | null;
  /** Why a value is missing, so the reader is not left guessing. */
  unavailableReason?: string;
  target: { lo: number | null; hi: number | null; point: number | null;
            source: TargetSource; note: string };
  /** null when there is no basis to judge against — reported, not scored. */
  verdict: "inside" | "below" | "above" | "on" | null;
  formula: string;
  /** Trailing months, so a value has shape rather than being a bare fact. */
  trend: KpiTrend;
  /** Movement against the prior period. */
  priorValue: number | null;
  changePct: number | null;
};

/** Computes every active metric for a period. */
export function computeKpis(
  clientId: string, m: PeriodMetrics, entityId = "ALL",
  opts: { trend?: boolean } = {},
): KpiResult[] {
  const configs = clientConfig(clientId).filter((c) => c.active);
  if (!configs.length) return [];

  const values = inputsFor(m, entityId);

  /**
   * Trailing history, computed once for every metric rather than per metric.
   *
   * A number without shape is a fact, not a metric — 68.1% occupancy means nothing until
   * you know it was 74% three months ago. This is the difference between a screen that
   * reports and one that informs.
   */
  let history: { label: string; values: Record<string, number> }[] = [];
  if (opts.trend) {
    const rows: any[] = db().prepare(
      `SELECT id, year, month FROM periods
        WHERE client_id=? AND status IN ('PUBLISHED','IN_REVIEW')
          AND (year < ? OR (year = ? AND month <= ?))
        ORDER BY year DESC, month DESC LIMIT 12`).all(clientId, m.year, m.year, m.month);
    history = rows.reverse().map((r) => {
      const pm = computePeriod(r.id);
      return { label: pm.label.split(" ")[0], values: inputsFor(pm, entityId) };
    });
  }

  const out: KpiResult[] = [];

  for (const cfg of configs) {
    const def = definition(cfg.kpiKey);
    if (!def) continue;

    const value = def.kind === "NON_FINANCIAL"
      ? (values[def.key] ?? null)
      : evaluate(def.formula, values);

    let unavailableReason: string | undefined;
    if (value === null) {
      const missing = formulaInputs(def.formula).filter((i) => values[i] === undefined);
      unavailableReason = missing.length
        ? `Needs ${missing.join(", ")}, which this period does not carry`
        : "Cannot be computed for this period — usually a division by zero";
    }

    let verdict: KpiResult["verdict"] = null;
    if (value !== null && cfg.targetSource !== "NONE") {
      if (cfg.targetLo != null && cfg.targetHi != null) {
        verdict = value < cfg.targetLo ? "below" : value > cfg.targetHi ? "above" : "inside";
      } else if (cfg.targetPoint != null) {
        const tol = Math.abs(cfg.targetPoint) * 0.05;
        verdict = Math.abs(value - cfg.targetPoint) <= tol ? "on"
          : value < cfg.targetPoint ? "below" : "above";
      }
    }

    const trend: KpiTrend = history.map((h) => ({
      label: h.label,
      value: def.kind === "NON_FINANCIAL" ? (h.values[def.key] ?? null) : evaluate(def.formula, h.values),
    }));
    const priorValue = trend.length > 1 ? trend[trend.length - 2].value : null;
    // Percent/ratio metrics move in points, not relative percent-of-percent.
    const changePct = priorValue !== null && value !== null
      ? (def.unit === "percent" || def.unit === "ratio"
          ? Math.round((value - priorValue) * 10) / 10
          : priorValue !== 0
            ? Math.round(((value - priorValue) / Math.abs(priorValue)) * 1000) / 10
            : null)
      : null;

    out.push({
      trend, priorValue, changePct,
      key: def.key, label: def.label, category: def.category, unit: def.unit,
      direction: def.direction, decimals: def.decimals, guidance: def.guidance,
      importance: cfg.importance, value, unavailableReason,
      target: { lo: cfg.targetLo, hi: cfg.targetHi, point: cfg.targetPoint,
        source: cfg.targetSource, note: cfg.targetNote },
      verdict, formula: def.formula,
    });
  }

  // Most important first; within that, metrics with a verdict ahead of those without,
  // because a metric nobody has agreed a target for is not the headline.
  return out.sort((a, b) =>
    b.importance - a.importance ||
    Number(Boolean(b.verdict)) - Number(Boolean(a.verdict)) ||
    a.label.localeCompare(b.label));
}

/** Persists computed values so a published period stays reproducible. */
export function persistKpis(clientId: string, periodId: string) {
  const m = computePeriod(periodId);
  const results = computeKpis(clientId, m);
  const write = db().transaction(() => {
    db().prepare("DELETE FROM kpi_values WHERE period_id=? AND entity_id IS NULL").run(periodId);
    for (const r of results) {
      db().prepare("INSERT INTO kpi_values (id,period_id,entity_id,kpi_key,value) VALUES (?,?,?,?,?)")
        .run(uid(), periodId, null, r.key, r.value);
    }
  });
  write();
  return results.length;
}
