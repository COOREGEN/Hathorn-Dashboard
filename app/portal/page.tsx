import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { computePeriods } from "@/lib/metrics";
import { yearOverYear, budgetVariance, balanceSheet, cashOutlook, openActions, closedSince } from "@/lib/advisory";
import { periodContext, checkComparability, normalisePerDay } from "@/lib/comparability";
import { assessConfidence } from "@/lib/confidence";
import { lockedStatements, statementGoals } from "@/lib/statement";
import { activeRelease } from "@/lib/release";
import Dashboard, { type ClientMeta, type GoalRow } from "@/components/dashboard";
import LogoutButton from "@/components/logout-button";

export const dynamic = "force-dynamic";

/**
 * Locked-statement preview.
 *
 * Staff use this to see exactly what was locked for a call. Reads active release
 * snapshots only — never live tables — so a statement cannot change underneath the reader.
 */
export default async function Portal({ searchParams }: { searchParams: { client?: string; month?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");

  let clientId = s.clientId;
  if (!clientId && ["ADMIN", "ADVISOR"].includes(s.role) && searchParams.client) {
    const c: any = db().prepare("SELECT id FROM clients WHERE slug=?").get(searchParams.client);
    clientId = c?.id;
  }
  if (!clientId) redirect(s.role === "CLIENT" ? "/login" : "/today");

  const c: any = db().prepare("SELECT * FROM clients WHERE id=?").get(clientId);
  const client: ClientMeta = {
    name: c.name, template: c.template, brandPrimary: c.brand_primary, brandAccent: c.brand_accent,
    logoText: c.logo_text, logoSub: c.logo_sub,
    logoUrl: c.logo_asset_id ? `/api/assets/${c.logo_asset_id}` : null,
    targetLaborLo: c.target_labor_lo, targetLaborHi: c.target_labor_hi,
  };
  const goals: GoalRow[] = statementGoals(clientId);

  const periods = lockedStatements(clientId);
  if (!periods.length) {
    return (
      <div style={{ maxWidth: 640, margin: "80px auto", padding: 24 }}>
        <div className="eyebrow">Locked statements</div>
        <h1 className="display-m" style={{ marginTop: 8 }}>No locked months yet</h1>
        <p className="caption" style={{ marginTop: 12 }}>
          Lock a month from Review when the story is ready for the advisory call.
          Until then, prepare on Today, Portfolio, and Dash.
        </p>
      </div>
    );
  }

  const selectedId = searchParams.month && periods.some((p) => p.periodId === searchParams.month)
    ? searchParams.month
    : undefined;

  const allComments: any[] = periods.length
    ? (db().prepare(`SELECT * FROM comments WHERE period_id IN (${periods.map(() => "?").join(",")}) ORDER BY created_at`)
        .all(...periods.map((p) => p.periodId)) as any[])
    : [];

  const advisoryByPeriod: Record<string, ReturnType<typeof buildAdvisory>> = {};
  for (const p of periods) advisoryByPeriod[p.periodId] = buildAdvisory(clientId, p);

  const comparabilityByPair = buildComparabilityMatrix(clientId, periods);
  const confidenceByPeriod: Record<string, ReturnType<typeof assessConfidence>> = {};
  for (const p of periods) {
    const snap = activeRelease(p.periodId)?.snapshot;
    confidenceByPeriod[p.periodId] = snap?.confidence ?? assessConfidence(p, clientId);
  }

  const perDayByPeriod: Record<string, ReturnType<typeof normalisePerDay>> = {};
  for (const p of periods) {
    perDayByPeriod[p.periodId] = normalisePerDay(p, periodContext(p, clientId).daysCovered);
  }

  return (
    <div className="relative">
      <div className="absolute right-4 top-4 z-20 no-print"><LogoutButton /></div>
      <Dashboard client={client} periods={periods} goals={goals} userRole={s.role}
        selectedId={selectedId}
        allComments={allComments} advisoryByPeriod={advisoryByPeriod}
        comparabilityByPair={comparabilityByPair}
        confidenceByPeriod={confidenceByPeriod}
        perDayByPeriod={perDayByPeriod} />
    </div>
  );
}


/** Assembles everything the advisory sections need in one place. */
export function buildAdvisory(clientId: string, cur: any) {
  // Prior-year overlay: locked/published months only — drafts must not enter a statement.
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
