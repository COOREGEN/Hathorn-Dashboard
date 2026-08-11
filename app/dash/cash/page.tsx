import Frame from "@/components/dash/frame";
import { Kpi, Card, money } from "@/components/dash/ui";
import { LineChart, StackedH } from "@/components/dash/charts";

export default function Cash({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  return (
    <Frame searchParams={searchParams} title="Cash & Collections" showFilters={false}
      subtitle="Bank position, receivables ageing, and the thirteen-week outlook">
      {(ctx) => {
        const { cur, cash13: c, profile } = ctx as any;
        const party = profile.receivables.partyLabel;
        const past90 = cur.ar.reduce((s: number, a: any) => s + a.b90p, 0);
        const cur30 = cur.ar.reduce((s: number, a: any) => s + a.b0_30, 0);
        return (
          <>
            <div className="grid g4">
              <Kpi label="Bank balance" value={money(cur.cash.total)} sub="Operating plus reserve" />
              <Kpi label="Receivables" value={money(cur.arTotal)}
                sub={`${cur.ar.length} ${profile.receivables.partyLabelPlural}`} />
              <Kpi label="Past 90 days" value={money(past90)} sub="Work these first" tone={past90 > 0 ? "warn" : "ok"} />
              <Kpi label="Current to 30" value={money(cur30)} sub="Healthy bucket" tone="ok" />
            </div>

            <div className="section-gap">
              <Card title="Thirteen-week cash outlook"
                sub="Projected from collections by ageing bucket against payroll and overhead">
                <div className="grid g3" style={{ marginBottom: 16 }}>
                  <Kpi label="Weeks of cover" value={c.weeksOfCover?.toFixed(1) ?? "—"} sub="At current burn" />
                  <Kpi label="Lowest point" value={money(c.lowestBalance)} sub={`week ${c.lowestWeek}`}
                    tone={c.goesNegative ? "bad" : "ok"} />
                  <Kpi label="Outlook" value={c.goesNegative ? "Shortfall" : "Stays positive"}
                    sub="Across 13 weeks" tone={c.goesNegative ? "bad" : "ok"} />
                </div>
                <LineChart points={c.weeks.map((w: any) => w.balance)}
                  labels={c.weeks.map((w: any) => w.label)} height={190} />
                <p className="caption" style={{ marginTop: 12 }}>
                  A projection, not a forecast of certainty. Collections assume 92% of current
                  balances land within four weeks and 40% of balances past ninety days are
                  recovered at all.
                </p>
              </Card>
            </div>

            {profile.receivables.ageingMatters && cur.ar.length > 0 && (
            <div className="section-gap">
              <Card title={`Receivables by ${party}`} sub="Current–30 · 31–60 · 61–90 · 90+ days">
                <StackedH rows={cur.ar.map((a: any) => ({ label: a.payer, values: [a.b0_30, a.b31_60, a.b61_90, a.b90p] }))}
                  colors={["var(--brand)", "var(--brand-deep)", "var(--accent)", "var(--accent-deep)"]}
                  legend={["Current–30", "31–60", "61–90", "90+"]} />
              </Card>
            </div>
            )}
          </>
        );
      }}
    </Frame>
  );
}
