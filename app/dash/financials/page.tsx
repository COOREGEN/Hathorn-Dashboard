import Frame from "@/components/dash/frame";
import { Kpi, Card, Sec, Empty, money, pct } from "@/components/dash/ui";
import { Bars, StackedH } from "@/components/dash/charts";

export default function Financials({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  return (
    <Frame searchParams={searchParams} title="Financials"
      subtitle="Canonical statements, liquidity metrics, and position">
      {(ctx) => {
        const { cur, view, balance: b, periods, profile } = ctx as any;
        const L = profile.language;
        const trend = periods.filter((p: any) => p.year === cur.year && p.month <= cur.month);
        const sum = (f: (e: any) => number) => cur.entities.reduce((s: number, e: any) => s + f(e), 0);

        return (
          <>
            <div className="grid g4">
              <Kpi label="Gross profit" value={money(view.grossProfit)} sub={`${pct(view.grossMarginPct)} gross margin`} tone="ok" />
              <Kpi label="Overhead" value={money(view.opex)} sub="Below the line" />
              {profile.sections.payrollDetail ? (
                <>
                  <Kpi label="Total payroll" value={money(cur.totalPayroll)} sub={`${pct(cur.laborPct)} of revenue`} />
                  <Kpi label="Overtime premium" value={money(cur.otPremium)} sub="The quiet leak"
                    tone={cur.otPremium > 0 ? "warn" : "n"} />
                </>
              ) : (
                <>
                  <Kpi label={L.directCostLabel} value={money(view.directCost)}
                    sub={`${pct(view.laborPct)} of revenue`} />
                  <Kpi label="Net income" value={money(view.netIncome)}
                    sub={`${pct(view.netMarginPct)} net margin`} tone={view.netIncome >= 0 ? "ok" : "bad"} />
                </>
              )}
            </div>

            <div className="grid g2 section-gap">
              {profile.sections.payrollDetail && (
              <Card title="Where payroll goes" sub={`${cur.label} composition`}>
                <StackedH rows={[{ label: "Payroll", values: [
                  sum((e) => e.payroll.wages), sum((e) => e.payroll.otPremium),
                  sum((e) => e.payroll.taxes), sum((e) => e.payroll.workersComp),
                  sum((e) => e.payroll.processing)] }]}
                  colors={["var(--brand)", "var(--accent)", "var(--brand-deep)", "#A89F92", "#CFC8BC"]}
                  legend={["Wages", "Overtime", "Employer taxes", "Workers' comp", "Processing"]} />
              </Card>
              )}
              <Card title="Net income trend" sub="$K by month">
                <Bars series={[trend.map((x: any) => x.netIncome)]}
                  labels={trend.map((x: any) => x.label.split(" ")[0])}
                  colors={["var(--brand)"]} names={["Net income"]} />
              </Card>
            </div>

            {!b.available ? (
              <Sec title="Position" question="What do you own, what do you owe, and can you service it?">
                {/* Absent rather than silent: an advisor should know why a section is
                    missing and exactly what unlocks it. */}
                <Empty title="No balance sheet for this period">
                  Working capital, current ratio, leverage and debt service coverage all come
                  from the balance sheet, which is optional on upload. Add
                  {" "}<strong>balance.csv</strong> to the {cur.label} close and this section fills in.
                </Empty>
              </Sec>
            ) : (
              <Sec title="Position" question="What do you own, what do you owe, and can you service it?">
                <div className="grid g4">
                  <Kpi label="Working capital" value={money(b.workingCapital)}
                    sub="Current assets less current liabilities" tone={b.workingCapital >= 0 ? "ok" : "bad"} />
                  <Kpi label="Current ratio" value={b.currentRatio?.toFixed(2) ?? "—"}
                    sub="Healthy above 1.50" tone={(b.currentRatio ?? 0) >= 1.5 ? "ok" : "warn"} />
                  <Kpi label="Debt to equity" value={b.debtToEquity?.toFixed(2) ?? "—"}
                    sub="Lower is less leveraged" tone={(b.debtToEquity ?? 0) <= 2 ? "ok" : "warn"} />
                  <Kpi label="Debt service coverage" value={b.debtServiceCoverage?.toFixed(2) ?? "—"}
                    sub="Lenders look for 1.25 or better"
                    tone={b.debtServiceCoverage == null ? "n" : b.debtServiceCoverage >= 1.25 ? "ok" : "bad"} />
                </div>
                <div style={{ marginTop: 20 }}>
                  <Card>
                    <table>
                      <thead><tr><th>Balance sheet</th><th>{cur.label}</th></tr></thead>
                      <tbody>
                        {([["Current assets", b.currentAssets], ["Fixed assets", b.fixedAssets],
                           ["Total assets", b.totalAssets], ["Current liabilities", b.currentLiabilities],
                           ["Long-term liabilities", b.longTermLiabilities],
                           ["Total liabilities", b.totalLiabilities], ["Equity", b.equity]] as [string, number][])
                          .map(([l, v]) => <tr key={l}><td>{l}</td><td className="tnum">{money(v)}</td></tr>)}
                      </tbody>
                    </table>
                  </Card>
                </div>
              </Sec>
            )}
          </>
        );
      }}
    </Frame>
  );
}
