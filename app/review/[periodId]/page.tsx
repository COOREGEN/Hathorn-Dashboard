import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientHistory, computePeriod } from "@/lib/metrics";
import { buildAdvisory, buildComparabilityMatrix } from "@/app/portal/page";
import { periodContext, normalisePerDay } from "@/lib/comparability";
import { assessConfidence } from "@/lib/confidence";
import { runGate } from "@/lib/gate";
import Dashboard, { type ClientMeta, type GoalRow } from "@/components/dashboard";
import ReviewPanel from "@/components/review-panel";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function Review({ params }: { params: { periodId: string } }) {
  const s = await getSession();
  if (!s || !["ADMIN", "ADVISOR"].includes(s.role)) redirect("/login");

  const period: any = db().prepare("SELECT * FROM periods WHERE id=?").get(params.periodId);
  if (!period) redirect("/admin");
  const c: any = db().prepare("SELECT * FROM clients WHERE id=?").get(period.client_id);

  const gate = runGate(params.periodId);
  const client: ClientMeta = {
    name: c.name, template: c.template, brandPrimary: c.brand_primary, brandAccent: c.brand_accent,
    logoText: c.logo_text, logoSub: c.logo_sub,
    logoUrl: c.logo_asset_id ? `/api/assets/${c.logo_asset_id}` : null,
    targetLaborLo: c.target_labor_lo, targetLaborHi: c.target_labor_hi,
  };
  const goals: GoalRow[] = (db().prepare("SELECT * FROM goals WHERE client_id=? AND active=1").all(c.id) as any[])
    .map((g) => ({ id: g.id, title: g.title, target: g.target, current: g.current, progress: g.progress }));

  // Advisor sees history INCLUDING this draft period.
  const periods = clientHistory(c.id, false).filter(
    (p) => p.status === "PUBLISHED" || p.periodId === params.periodId
  );
  const notes: any[] = db()
    .prepare("SELECT * FROM story_notes WHERE period_id=? ORDER BY slot, sort")
    .all(params.periodId);

  return (
    <div>
      <ReviewPanel
        periodId={params.periodId}
        clientName={c.name}
        status={period.status}
        gate={gate}
        notes={notes.map((n) => ({ id: n.id, slot: n.slot, tone: n.tone, heading: n.heading, body: n.body }))}
        storyAgentEnabled={config.anthropic.enabled}
      />
      <Dashboard client={client} periods={periods} goals={goals} selectedId={params.periodId}
        userRole={s.role} allComments={[]}
        advisoryByPeriod={Object.fromEntries(periods.map((p) => [p.periodId, buildAdvisory(c.id, p)]))}
        comparabilityByPair={buildComparabilityMatrix(c.id, periods)}
        confidenceByPeriod={Object.fromEntries(periods.map((p) => [p.periodId, assessConfidence(p, c.id)]))}
        perDayByPeriod={Object.fromEntries(periods.map((p) =>
          [p.periodId, normalisePerDay(p, periodContext(p, c.id).daysCovered)]))} />
    </div>
  );
}
