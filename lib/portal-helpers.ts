/**
 * Shared helpers used by staff review (live books) and portal statement (releases).
 */
import { db } from "./db";
import { periodContext, checkComparability } from "./comparability";
import { yearOverYear, budgetVariance, balanceSheet, cashOutlook, openActions, closedSince } from "./advisory";
import { computePeriods } from "./metrics";

/** Live advisory for staff review / dash — recomputed from working papers. */
export function buildAdvisory(clientId: string, cur: any) {
  const priorRows: any[] = db()
    .prepare(`SELECT id, month FROM periods
               WHERE client_id=? AND year=? AND status='PUBLISHED' ORDER BY month`)
    .all(clientId, cur.year - 1);
  const priorMetrics = computePeriods(priorRows.map((r) => r.id));
  const priorByMonth = new Map(priorMetrics.map((p) => [p.month, p.revenue]));

  return {
    yoy: yearOverYear(cur, clientId),
    budget: budgetVariance(cur, clientId),
    balance: balanceSheet(cur.periodId, cur.netIncome),
    cash: cashOutlook(cur),
    openActions: openActions(clientId, cur),
    closedActions: closedSince(clientId, cur.periodId),
    priorYearSeries: priorMetrics.length
      ? Array.from({ length: cur.month }, (_, i) => priorByMonth.get(i + 1) ?? 0)
      : null,
  };
}

export function buildComparabilityMatrix(clientId: string, periods: any[]) {
  const contexts = new Map(periods.map((p) => [p.periodId, periodContext(p, clientId)]));
  const matrix: Record<string, ReturnType<typeof checkComparability>> = {};

  for (const cur of periods) {
    const a = contexts.get(cur.periodId)!;
    for (const basis of periods) {
      if (basis.periodId === cur.periodId) continue;
      const b = contexts.get(basis.periodId)!;
      for (const mode of ["PRIOR_MONTH", "PRIOR_YEAR", "YTD"]) {
        matrix[`${cur.periodId}::${basis.periodId}::${mode}`] = checkComparability(a, b, { mode });
      }
    }
  }
  return matrix;
}
