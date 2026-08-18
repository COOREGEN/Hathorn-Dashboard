import type { OverviewV2Model } from "@/lib/overview-v2/build";
import type { CommandCenterModel, CCPeriod } from "./model";

export function fromOverviewV2(model: OverviewV2Model): CommandCenterModel {
  const periods: CCPeriod[] = model.periods.map((p) => ({
    id: p.periodId,
    label: p.label,
    year: p.year,
    month: p.month,
    revenue: p.revenue,
    gp: p.grossProfit,
    margin: p.grossMarginPct,
    ni: p.netIncome,
    cash: p.cash,
    ar: p.arTotal,
    budgetRevenue: p.budgetRevenue,
  }));

  return {
    clientName: model.client.name,
    firmName: model.firmName,
    userName: model.userName,
    userRole: model.userRole,
    periodId: model.periodId,
    periods,
    drivers: model.drivers.netIncome.map((d, i) => ({
      id: `${d.kind}-${i}`,
      label: d.label,
      delta: d.delta,
      kind: d.kind,
      detail:
        d.kind === "up" || d.kind === "down"
          ? model.drivers.marginNotes[0] || "Deterministic bridge from the ledger."
          : "Bridge edge.",
      lens: d.label.toLowerCase().includes("revenue")
        ? "revenue"
        : d.label.toLowerCase().includes("labor")
          ? "margin"
          : "ni",
    })),
    expenses: model.expenses.map((e) => ({ label: e.label, amount: e.amount })),
    insights: model.insights,
    narrative: {
      headline: model.narrative.headline,
      body: model.narrative.body,
      signal: model.narrative.signal,
    },
    annotations: periods
      .filter((_, i, arr) => i > 0 && Math.abs(arr[i].revenue - arr[i - 1].revenue) / Math.max(arr[i - 1].revenue, 1) > 0.04)
      .slice(-3)
      .map((p) => ({
        periodId: p.id,
        kind: "note" as const,
        label: "Material move",
        detail: `${p.label} moved vs prior month.`,
      })),
    contributions: model.drivers.revenueSlices.slice(0, 5).map((s) => ({
      driver: s.label,
      impact: s.delta,
      share: Math.min(1, Math.abs(s.delta) / Math.max(1, Math.abs(model.cur.revenue - (model.priorYear?.revenue ?? model.cur.revenue)))),
      note: "Revenue bridge slice",
    })),
    demo: false,
  };
}
