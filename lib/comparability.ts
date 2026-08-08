/**
 * Comparability.
 *
 * Two numbers can both be correct and still not be comparable. Before any period is
 * measured against another, the pair is checked for the things that make a delta
 * meaningless:
 *
 *   - unequal period length — February against March is a 10% revenue decline that is
 *     entirely calendar
 *   - different accounting basis — cash against accrual measures different events
 *   - different currency
 *   - an unclosed basis — a draft month is not a fact yet
 *   - changed entity composition — consolidated revenue "growing" because a third
 *     business opened is not growth
 *
 * The last one is the reason this exists at all. Criterion opened an adult day center
 * mid-year; every consolidated comparison spanning that month silently mixes a
 * two-business figure with a three-business figure.
 *
 * Blocking issues suppress the comparison rather than degrading it. A comparison that
 * cannot be trusted should be absent and explained, not present and quietly wrong.
 */

import type { PeriodMetrics } from "./metrics";
import { db } from "./db";

export type IssueSeverity = "blocking" | "warning" | "note";

export type ComparabilityIssue = {
  code: string;
  severity: IssueSeverity;
  message: string;
  /** What the reader should do about it. */
  guidance?: string;
};

export type ComparabilityResult = {
  comparable: boolean;
  issues: ComparabilityIssue[];
  /** 0–1. Multiplies into confidence; never into the figures themselves. */
  reliability: number;
};

export type PeriodContext = {
  periodId: string;
  year: number;
  month: number;
  label: string;
  status: string;
  daysCovered: number;
  accountingBasis: string;
  currency: string;
  reconciled: boolean;
  /** IDs of entities reporting revenue or cost in the period. */
  entityIds: string[];
};

const DAYS_IN_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return DAYS_IN_MONTH[month] ?? 30;
}

/** Reads the context a comparison needs, falling back to the client's defaults. */
export function periodContext(m: PeriodMetrics, clientId: string): PeriodContext {
  const row: any = db().prepare(
    `SELECT p.accounting_basis, p.currency, p.days_covered, p.reconciled,
            c.accounting_basis AS client_basis, c.currency AS client_currency
       FROM periods p JOIN clients c ON c.id = p.client_id
      WHERE p.id = ?`,
  ).get(m.periodId);

  // Aggregates are synthetic and carry the context of the months they summarise.
  const isAggregate = m.periodId.startsWith("agg:");

  return {
    periodId: m.periodId,
    year: m.year,
    month: m.month,
    label: m.label,
    status: m.status,
    daysCovered: row?.days_covered ?? (isAggregate ? 0 : daysInMonth(m.year, m.month)),
    accountingBasis: row?.accounting_basis ?? row?.client_basis ?? "ACCRUAL",
    currency: row?.currency ?? row?.client_currency ?? "USD",
    reconciled: Boolean(row?.reconciled),
    // An entity counts as reporting when it moved money, not merely when it exists —
    // a startup with a $1.2K overhead line is not yet an operating business.
    entityIds: m.entities
      .filter((e) => e.revenue !== 0 || e.directCost !== 0)
      .map((e) => e.id)
      .sort(),
  };
}

/* ------------------------------------------------------------------ */

/**
 * Checks whether two periods can honestly be compared.
 *
 * `mode` matters: a year-to-date aggregate legitimately spans different day counts,
 * and a prior-year comparison legitimately spans a leap year. The same 3% length
 * difference is noise in one and a real distortion in another.
 */
export function checkComparability(
  current: PeriodContext,
  basis: PeriodContext,
  opts: { mode: string; entityScope?: string } = { mode: "PRIOR_MONTH" },
): ComparabilityResult {
  const issues: ComparabilityIssue[] = [];
  let reliability = 1;

  // --- Accounting basis: blocking. Cash and accrual measure different events. ---
  if (current.accountingBasis !== basis.accountingBasis) {
    issues.push({
      code: "accounting_basis_mismatch",
      severity: "blocking",
      message: `${current.label} is on a ${current.accountingBasis.toLowerCase()} basis and ${basis.label} is on a ${basis.accountingBasis.toLowerCase()} basis.`,
      guidance: "Restate one period onto the other's basis before comparing.",
    });
  }

  // --- Currency: blocking without a documented translation. ---
  if (current.currency !== basis.currency) {
    issues.push({
      code: "currency_mismatch",
      severity: "blocking",
      message: `${current.label} is stated in ${current.currency} and ${basis.label} in ${basis.currency}.`,
      guidance: "Translate at a documented rate and record the rate used.",
    });
  }

  // --- Period length. ---
  if (current.daysCovered > 0 && basis.daysCovered > 0) {
    const diff = Math.abs(current.daysCovered - basis.daysCovered);
    const variance = diff / Math.max(current.daysCovered, basis.daysCovered);

    if (variance > 0.2) {
      issues.push({
        code: "period_length_blocking",
        severity: "blocking",
        message: `${current.label} covers ${current.daysCovered} days against ${basis.daysCovered} for ${basis.label} — a ${(variance * 100).toFixed(0)}% difference.`,
        guidance: "Compare a like period, or normalise both to a daily rate.",
      });
    } else if (diff > 0 && opts.mode !== "PRIOR_YEAR" && opts.mode !== "YTD") {
      // A three-day difference on a 31-day month is roughly 10% of the month's
      // capacity. In an hours-billed business that is the whole apparent movement.
      const effect = (diff / basis.daysCovered) * 100;
      issues.push({
        code: "period_length_variance",
        severity: effect >= 5 ? "warning" : "note",
        message: `${current.label} has ${current.daysCovered} days against ${basis.daysCovered}. Roughly ${effect.toFixed(1)}% of any revenue movement is calendar, not performance.`,
        guidance: effect >= 5 ? "Read volume per day alongside the totals." : undefined,
      });
      reliability *= effect >= 5 ? 0.85 : 0.96;
    }
  }

  // --- Closed status: a draft is not a fact. ---
  if (basis.status !== "PUBLISHED") {
    issues.push({
      code: "basis_not_published",
      severity: "blocking",
      message: `${basis.label} has not been published and cannot serve as a comparison basis.`,
      guidance: "Publish that month first, or compare against an earlier closed period.",
    });
  }
  if (current.status !== "PUBLISHED") {
    issues.push({
      code: "subject_in_draft",
      severity: "note",
      message: `${current.label} is still in review; figures may change before publication.`,
    });
    reliability *= 0.9;
  }

  // --- Reconciliation. ---
  if (!current.reconciled || !basis.reconciled) {
    const which = !current.reconciled && !basis.reconciled ? "Neither period has"
      : !current.reconciled ? `${current.label} has not` : `${basis.label} has not`;
    issues.push({
      code: "not_reconciled",
      severity: "warning",
      message: `${which} been marked reconciled.`,
      guidance: "Confirm the bank and payroll registers tie before relying on the movement.",
    });
    reliability *= 0.88;
  }

  // --- Entity composition: the one that silently invents growth. ---
  if (!opts.entityScope || opts.entityScope === "ALL") {
    const added = current.entityIds.filter((id) => !basis.entityIds.includes(id));
    const removed = basis.entityIds.filter((id) => !current.entityIds.includes(id));

    if (added.length || removed.length) {
      const names = entityNames([...added, ...removed]);
      const parts: string[] = [];
      if (added.length) parts.push(`${entityNames(added).join(", ")} reported in ${current.label} but not ${basis.label}`);
      if (removed.length) parts.push(`${entityNames(removed).join(", ")} reported in ${basis.label} but not ${current.label}`);

      // Blocking: a consolidated delta across a composition change invents growth.
      // Suppress the comparison rather than colouring an unsound movement.
      issues.push({
        code: "entity_composition_change",
        severity: "blocking",
        message: `The businesses included differ: ${parts.join("; ")}.`,
        guidance: `Consolidated movement is not like-for-like. Compare ${names.length === 1 ? "excluding that business" : "business by business"} using the selector above.`,
      });
      reliability = 0;
    }
  }

  const blocking = issues.some((i) => i.severity === "blocking");
  return {
    comparable: !blocking,
    issues,
    reliability: blocking ? 0 : Math.max(0.3, Math.round(reliability * 100) / 100),
  };
}

function entityNames(ids: string[]): string[] {
  if (!ids.length) return [];
  const rows: any[] = db().prepare(
    `SELECT name FROM entities WHERE id IN (${ids.map(() => "?").join(",")})`,
  ).all(...ids);
  return rows.map((r) => r.name);
}

/**
 * Per-day figures, for reading past a calendar difference.
 *
 * Not a substitute for the totals — an owner thinks in months, and a per-day revenue
 * figure means little on its own. It is the check that answers "did we actually go
 * backwards, or was February just short".
 */
export function normalisePerDay(m: PeriodMetrics, days: number) {
  if (!days) return null;
  const r2 = (n: number) => Math.round((n / days) * 100) / 100;
  return {
    days,
    revenuePerDay: r2(m.revenue),
    directCostPerDay: r2(m.directCost),
    netIncomePerDay: r2(m.netIncome),
    hoursPerDay: Math.round(m.entities.reduce((s, e) => s + e.payroll.hoursPaid, 0) / days),
  };
}
