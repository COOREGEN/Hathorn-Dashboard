import Frame from "@/components/dash/frame";
import { Card, money, pct } from "@/components/dash/ui";
import { Bars } from "@/components/dash/charts";

export default function Businesses({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  return (
    <Frame searchParams={searchParams} title="Businesses" showFilters={false}
      subtitle="Multi-entity performance on one standardised framework">
      {(ctx) => {
        const { cur, periods } = ctx as any;
        const trend = periods.filter((p: any) => p.year === cur.year && p.month <= cur.month);
        const active = cur.entities.filter((e: any) => e.revenue > 0);
        const row = (label: string, fn: (e: any) => string, cons: string) => (
          <tr key={label}>
            <td>{label}</td>
            {cur.entities.map((e: any) => <td key={e.id} className="tnum">{fn(e)}</td>)}
            <td className="tnum">{cons}</td>
          </tr>
        );
        return (
          <>
            <Card title="Revenue by business" sub="$K by month">
              <Bars
                series={active.map((e: any) =>
                  trend.map((t: any) => t.entities.find((x: any) => x.id === e.id)?.revenue ?? 0))}
                labels={trend.map((t: any) => t.label.split(" ")[0])}
                colors={["var(--brand)", "var(--accent)", "#A89F92"]}
                names={active.map((e: any) => e.name)} />
            </Card>
            <div className="section-gap">
              <Card>
                <table>
                  <thead>
                    <tr><th />{cur.entities.map((e: any) => <th key={e.id}>{e.name}</th>)}<th>Consolidated</th></tr>
                  </thead>
                  <tbody>
                    {row("Revenue", (e) => money(e.revenue), money(cur.revenue))}
                    {row("Direct labor", (e) => money(e.directCost), money(cur.directCost))}
                    {row("Gross margin", (e) => (e.revenue ? pct(e.grossMarginPct) : "—"), pct(cur.grossMarginPct))}
                    {row("Net margin", (e) => (e.revenue ? pct(e.netMarginPct) : "—"), pct(cur.netMarginPct))}
                    {row("Labor ratio", (e) => (e.revenue ? pct(e.laborPct) : "—"), pct(cur.laborPct))}
                    {row("Hours", (e) => e.payroll.hoursPaid.toLocaleString(),
                      cur.entities.reduce((s: number, e: any) => s + e.payroll.hoursPaid, 0).toLocaleString())}
                    {row("Net income", (e) => money(e.netIncome), money(cur.netIncome))}
                  </tbody>
                </table>
              </Card>
            </div>
          </>
        );
      }}
    </Frame>
  );
}
