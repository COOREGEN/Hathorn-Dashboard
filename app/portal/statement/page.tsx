import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { periodContext, checkComparability, normalisePerDay } from "@/lib/comparability";
import { assessConfidence } from "@/lib/confidence";
import { lockedStatements, statementGoals, portalAdvisory } from "@/lib/statement";
import { activeRelease } from "@/lib/release";
import { vertical } from "@/lib/verticals";
import Dashboard, { type ClientMeta, type GoalRow } from "@/components/dashboard";
import ClientPortalShell from "@/components/client-portal/shell";
import { resolvePortalClient } from "@/lib/client-portal/resolve";
import AskPanel from "@/components/copilot/ask-panel";

export const dynamic = "force-dynamic";

/**
 * Client financials — published release statement only.
 * Working ledger data never appears here.
 */
export default async function PortalStatement({
  searchParams,
}: { searchParams: { client?: string; month?: string; preview?: string } }) {
  const ctx = await resolvePortalClient(searchParams);
  if (!ctx.modules.showFinancialStatements) redirect("/portal");

  const c = ctx.client;
  const profile = vertical(c.vertical);
  const brand = ctx.brand;
  const client: ClientMeta = {
    name: c.name, template: c.template, brandPrimary: c.brand_primary, brandAccent: c.brand_accent,
    logoText: c.logo_text, logoSub: c.logo_sub,
    logoUrl: c.logo_asset_id ? `/api/assets/${c.logo_asset_id}` : null,
    targetLaborLo: c.target_labor_lo, targetLaborHi: c.target_labor_hi,
    language: profile.language,
    firmName: brand.firmName,
    reportFooter: brand.reportFooter,
    showPlatformMark: brand.showPlatformMark,
  };
  const goals: GoalRow[] = statementGoals(ctx.clientId);
  const periods = ctx.periods;

  if (!periods.length) {
    return (
      <ClientPortalShell
        brand={brand}
        clientName={c.name}
        nav={ctx.nav}
        preview={ctx.preview}
      >
        <h2 className="display-m">Nothing published yet</h2>
        <p className="prose" style={{ marginTop: 12 }}>
          Your advisor will publish this month’s statement when the numbers are ready.
        </p>
      </ClientPortalShell>
    );
  }

  const selectedId = searchParams.month && periods.some((p) => p.periodId === searchParams.month)
    ? searchParams.month
    : periods[periods.length - 1].periodId;

  const allComments: any[] = periods.length
    ? (db().prepare(`SELECT * FROM comments WHERE period_id IN (${periods.map(() => "?").join(",")}) ORDER BY created_at`)
        .all(...periods.map((p) => p.periodId)) as any[])
    : [];

  const advisoryByPeriod: Record<string, ReturnType<typeof portalAdvisory>> = {};
  for (const p of periods) advisoryByPeriod[p.periodId] = portalAdvisory(ctx.clientId, p, periods);

  const comparabilityByPair = buildComparabilityMatrix(ctx.clientId, periods);
  const confidenceByPeriod: Record<string, ReturnType<typeof assessConfidence>> = {};
  for (const p of periods) {
    const snap = activeRelease(p.periodId)?.snapshot;
    confidenceByPeriod[p.periodId] = snap?.confidence ?? assessConfidence(p, ctx.clientId);
  }

  const perDayByPeriod: Record<string, ReturnType<typeof normalisePerDay>> = {};
  for (const p of periods) {
    const days = activeRelease(p.periodId)?.snapshot?.period?.daysCovered
      ?? periodContext(p, ctx.clientId).daysCovered;
    perDayByPeriod[p.periodId] = normalisePerDay(p, days);
  }

  const s = await getSession();

  return (
    <ClientPortalShell
      brand={brand}
      clientName={c.name}
      periodLabel={periods.find((p) => p.periodId === selectedId)?.label}
      nav={ctx.nav}
      preview={ctx.preview}
    >
      <Dashboard
        client={client}
        periods={periods}
        goals={goals}
        userRole={s!.role}
        selectedId={selectedId}
        allComments={allComments}
        advisoryByPeriod={advisoryByPeriod}
        comparabilityByPair={comparabilityByPair}
        confidenceByPeriod={confidenceByPeriod}
        perDayByPeriod={perDayByPeriod}
      />
      {ctx.showCopilot && (
        <div className="no-print" style={{ marginTop: 32 }}>
          <AskPanel
            clientId={ctx.clientId}
            clientName={client.name}
            periodId={selectedId}
            periodLabel={periods.find((p) => p.periodId === selectedId)?.label || null}
          />
        </div>
      )}
    </ClientPortalShell>
  );
}

function buildComparabilityMatrix(clientId: string, periods: any[]) {
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
