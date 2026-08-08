import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientHistory, computePeriods } from "@/lib/metrics";
import { yearOverYear, budgetVariance, balanceSheet, cashOutlook, openActions, closedSince } from "@/lib/advisory";
import { periodContext, checkComparability, normalisePerDay } from "@/lib/comparability";
import { assessConfidence } from "@/lib/confidence";
import Dashboard, { type ClientMeta, type GoalRow } from "@/components/dashboard";
import LogoutButton from "@/components/logout-button";

export const dynamic = "force-dynamic";

export default async function Portal({ searchParams }: { searchParams: { client?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");

  let clientId = s.clientId;
  if (!clientId && ["ADMIN", "ADVISOR"].includes(s.role) && searchParams.client) {
    const c: any = db().prepare("SELECT id FROM clients WHERE slug=?").get(searchParams.client);
    clientId = c?.id;
  }
  if (!clientId) redirect(s.role === "CLIENT" ? "/login" : "/admin");

  const c: any = db().prepare("SELECT * FROM clients WHERE id=?").get(clientId);
  const client: ClientMeta = {
    name: c.name, template: c.template, brandPrimary: c.brand_primary, brandAccent: c.brand_accent,
    logoText: c.logo_text, logoSub: c.logo_sub,
    logoUrl: c.logo_asset_id ? `/api/assets/${c.logo_asset_id}` : null,
    targetLaborLo: c.target_labor_lo, targetLaborHi: c.target_labor_hi,
  };
  const goals: GoalRow[] = (db().prepare("SELECT * FROM goals WHERE client_id=? AND active=1").all(clientId) as any[])
    .map((g) => ({ id: g.id, title: g.title, target: g.target, current: g.current, progress: g.progress }));

  const periods = clientHistory(clientId, true);

  // Load comment threads for all published periods
  const allComments: any[] = periods.length
    ? (db().prepare(`SELECT * FROM comments WHERE period_id IN (${periods.map(() => "?").join(",")}) ORDER BY created_at`)
        .all(...periods.map((p) => p.periodId)) as any[])
    : [];

  // Every period gets its own advisory bundle so switching months keeps the balance
  // sheet, budget and cash outlook that belong to that month rather than the latest.
  // The metrics engine is batched, so this is a handful of queries, not one per month.
  const advisoryByPeriod: Record<string, ReturnType<typeof buildAdvisory>> = {};
  for (const p of periods) advisoryByPeriod[p.periodId] = buildAdvisory(clientId, p);

  // Comparability needs period context that only the server can read, so the pairwise
  // results are precomputed for every combination the picker can produce. The client
  // then switches comparison instantly without losing the gate.
  const comparabilityByPair = buildComparabilityMatrix(clientId, periods);
  const confidenceByPeriod: Record<string, ReturnType<typeof assessConfidence>> = {};
  for (const p of periods) confidenceByPeriod[p.periodId] = assessConfidence(p, clientId);

  const perDayByPeriod: Record<string, ReturnType<typeof normalisePerDay>> = {};
  for (const p of periods) {
    perDayByPeriod[p.periodId] = normalisePerDay(p, periodContext(p, clientId).daysCovered);
  }

  return (
    <div className="relative">
      <div className="absolute right-4 top-4 z-20 no-print"><LogoutButton /></div>
      <Dashboard client={client} periods={periods} goals={goals} userRole={s.role}
        allComments={allComments} advisoryByPeriod={advisoryByPeriod}
        comparabilityByPair={comparabilityByPair}
        confidenceByPeriod={confidenceByPeriod}
        perDayByPeriod={perDayByPeriod} />
    </div>
  );
}


/** Assembles everything the advisory sections need in one place. */
export function buildAdvisory(clientId: string, cur: any) {
  // Prior-year revenue aligned to the months on screen, for the trend overlay.
  const priorRows: any[] = db()
    .prepare(`SELECT id, month FROM periods
               WHERE client_id=? AND year=? AND status IN ('PUBLISHED','IN_REVIEW') ORDER BY month`)
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


/**
 * Precomputes comparability for every pair the period picker can produce.
 *
 * Keyed `currentId::basisId::mode`, because the same pair can be legitimate in one mode
 * and not another — a year-to-date aggregate spans unequal day counts by construction,
 * while a month-on-month pair does not.
 */
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
