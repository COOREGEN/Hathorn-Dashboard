import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientHistory } from "@/lib/metrics";
import { buildAdvisory, buildComparabilityMatrix } from "@/lib/portal-helpers";
import { periodContext, normalisePerDay } from "@/lib/comparability";
import { assessConfidence } from "@/lib/confidence";
import { runGate } from "@/lib/gate";
import { evaluate, releaseHistory } from "@/lib/release";
import { statementGoals } from "@/lib/statement";
import Dashboard, { type ClientMeta } from "@/components/dashboard";
import ReviewPanel from "@/components/review-panel";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function Review({ params }: { params: { periodId: string } }) {
  const s = await getSession();
  if (!s || !["ADMIN", "ADVISOR"].includes(s.role)) redirect("/login");

  const period: any = db().prepare("SELECT * FROM periods WHERE id=?").get(params.periodId);
  if (!period) redirect("/today");
  const c: any = db().prepare("SELECT * FROM clients WHERE id=?").get(period.client_id);

  const gate = runGate(params.periodId);
  const evaluation = evaluate(params.periodId);
  const history = releaseHistory(params.periodId);

  const { activeMembership, brandingForClient } = await import("@/lib/tenancy");
  if (!c?.firm_id || !activeMembership(s.userId, c.firm_id)) redirect("/today");
  const brand = brandingForClient(c.id);
  const client: ClientMeta = {
    name: c.name, template: c.template, brandPrimary: c.brand_primary, brandAccent: c.brand_accent,
    logoText: c.logo_text, logoSub: c.logo_sub,
    logoUrl: c.logo_asset_id ? `/api/assets/${c.logo_asset_id}` : null,
    targetLaborLo: c.target_labor_lo, targetLaborHi: c.target_labor_hi,
    firmName: brand.firmName,
    reportFooter: brand.reportFooter,
    showPlatformMark: brand.showPlatformMark,
  };
  const goals = statementGoals(c.id);

  // Advisor sees live history including this draft — call prep works on working papers.
  const periods = clientHistory(c.id, false).filter(
    (p) => p.status === "PUBLISHED" || p.periodId === params.periodId
  );
  const notes: any[] = db()
    .prepare("SELECT * FROM story_notes WHERE period_id=? ORDER BY slot, sort")
    .all(params.periodId);

  const allComments: any[] = periods.length
    ? (db().prepare(`SELECT * FROM comments WHERE period_id IN (${periods.map(() => "?").join(",")}) ORDER BY created_at`)
        .all(...periods.map((p) => p.periodId)) as any[])
    : [];

  return (
    <div>
      <ReviewPanel
        periodId={params.periodId}
        clientName={c.name}
        status={period.status}
        gate={gate}
        notes={notes.map((n) => ({ id: n.id, slot: n.slot, tone: n.tone, heading: n.heading, body: n.body }))}
        storyAgentEnabled={config.anthropic.enabled}
        history={history}
        evaluation={{
          canPublish: evaluation.canPublish,
          blockers: evaluation.blockers,
          warnings: evaluation.warnings,
          nextVersion: evaluation.nextVersion,
        }}
      />
      <Dashboard client={client} periods={periods} goals={goals} selectedId={params.periodId}
        userRole={s.role} allComments={allComments}
        advisoryByPeriod={Object.fromEntries(periods.map((p) => [p.periodId, buildAdvisory(c.id, p)]))}
        comparabilityByPair={buildComparabilityMatrix(c.id, periods)}
        confidenceByPeriod={Object.fromEntries(periods.map((p) => [p.periodId, assessConfidence(p, c.id)]))}
        perDayByPeriod={Object.fromEntries(periods.map((p) =>
          [p.periodId, normalisePerDay(p, periodContext(p, c.id).daysCovered)]))} />
    </div>
  );
}
