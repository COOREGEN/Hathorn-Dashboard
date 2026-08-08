import Frame from "@/components/dash/frame";
import { Kpi, Card, Sec, Note, Bullet, money, pct } from "@/components/dash/ui";
import { LineChart, Donut, StackedH } from "@/components/dash/charts";

export default function Overview({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  return (
    <Frame searchParams={searchParams} title="Monthly Financial Dashboard"
      subtitle="Financial performance, business drivers, and management exceptions">
      {(ctx) => {
        const { cur, view, prev, client, laborTarget, comparison, periods, profile, bands, volume } = ctx as any;
        const L = profile.language;
        const revLine = comparison.available ? comparison.lines.find((l: any) => l.label === "Revenue") : null;
        const changed = cur.notes.filter((n: any) => n.slot === "WHAT_CHANGED");
        const active = cur.entities.filter((e: any) => e.revenue > 0);
        const trend = periods.filter((p: any) => p.year === cur.year && p.month <= cur.month);
        const priorYear = periods.filter((p: any) => p.year === cur.year - 1 && p.month <= cur.month);
        const laborBad = Boolean(bands.labor) &&
          (view.laborPct > bands.labor.hi || view.laborPct < bands.labor.lo);

        return (
          <>
            <div className="grid g4">
              <Kpi label={L.revenueLabel} value={money(view.revenue)}
                sub={revLine ? `vs ${comparison.basisLabel}` : prev ? `vs ${prev.label}` : "First period"}
                tone={revLine?.deltaPct != null && revLine.deltaPct < -10 ? "bad" : "n"}
                delta={revLine?.deltaPct != null && revLine.material
                  ? { up: revLine.deltaPct >= 0, text: `${Math.abs(revLine.deltaPct).toFixed(1)}%` } : null} />
              <Kpi label="Net income" value={money(view.netIncome)}
                sub={`${pct(view.netMarginPct)} net margin`} tone={view.netIncome >= 0 ? "ok" : "bad"} />
              <Kpi label="Cash position" value={money(cur.cash.total)}
                sub={`${money(cur.cash.operating)} operating · ${money(cur.cash.reserve)} reserve`} />
              {bands.labor ? (
                <Kpi label={L.laborRatioLabel} value={pct(view.laborPct)}
                  sub={`Healthy band ${bands.labor.lo}–${bands.labor.hi}%`}
                  tone={laborBad ? "bad" : "ok"} />
              ) : volume?.utilisation != null ? (
                // Verticals without a labour band lead on utilisation instead — for a
                // rental or a childcare centre that is the number that moves everything.
                <Kpi label={profile.volume.label} value={`${volume.utilisation}%`}
                  sub={bands.occupancy ? `Target ${bands.occupancy.lo}–${bands.occupancy.hi}%` : "Capacity used"}
                  tone={bands.occupancy && (volume.utilisation < bands.occupancy.lo) ? "bad" : "ok"} />
              ) : (
                <Kpi label="Gross margin" value={pct(view.grossMarginPct)}
                  sub={bands.grossMargin ? `Healthy ${bands.grossMargin.lo}–${bands.grossMargin.hi}%` : "Of revenue"}
                  tone={bands.grossMargin && view.grossMarginPct < bands.grossMargin.lo ? "bad" : "ok"} />
              )}
            </div>

            {changed.length > 0 && (
              <Sec title="What changed" question="The explanation is the product. Anyone can draw the chart.">
                <div style={{ maxWidth: 720 }}>
                  {changed.map((n: any, i: number) => <Note key={n.id} {...n} lead={i === 0} />)}
                </div>
              </Sec>
            )}

            <div className="grid g21 section-gap">
              <Card title="Monthly revenue trend" sub={`${cur.year}${priorYear.length ? ` with ${cur.year - 1} dashed` : ""}`}>
                <LineChart points={trend.map((x: any) => x.revenue)}
                  labels={trend.map((x: any) => x.label.split(" ")[0])}
                  prior={priorYear.length ? priorYear.map((x: any) => x.revenue) : undefined} />
              </Card>
              <Card title="Revenue mix" sub={cur.label}>
                <Donut slices={active.map((e: any) => ({ label: e.name, value: e.revenue }))}
                  colors={["var(--brand)", "var(--accent)", "#A89F92"]} />
              </Card>
            </div>

            <Sec title="Business summary" question="Which business is carrying which?">
              <div className="grid g3">
                {cur.entities.map((e: any) => (
                  <div className="card" key={e.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                      <span style={{ fontFamily: "var(--display)", fontSize: 18 }}>{e.name}</span>
                      <span className="tag" style={{ color: e.status === "ACTIVE" ? "var(--brand-text)" : "var(--accent-text)" }}>
                        {e.status === "ACTIVE" ? "Active" : "Startup"}
                      </span>
                    </div>
                    <div className="grid g3" style={{ gap: 10 }}>
                      {[["Revenue", money(e.revenue), "var(--ink)"],
                        ["Net", money(e.netIncome), e.netIncome < 0 ? "var(--accent-text)" : "var(--ink)"],
                        [bands.labor ? "Labor" : "Margin",
                          e.revenue > 0 ? pct(bands.labor ? e.laborPct : e.grossMarginPct) : "—",
                          e.revenue > 0 && bands.labor && (e.laborPct > bands.labor.hi || e.laborPct < bands.labor.lo)
                            ? "var(--accent-text)" : "var(--ink)"]].map(([k, v, c]) => (
                        <div key={k as string}>
                          <div className="eyebrow" style={{ fontSize: 8.5 }}>{k}</div>
                          <div className="tnum" style={{ fontFamily: "var(--utility)", fontSize: 13.5,
                            fontWeight: 600, marginTop: 4, color: c as string }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Sec>

            <div className="grid g2 section-gap">
              {bands.labor && (
                <Card title={`${L.laborRatioLabel} vs healthy band`}
                  sub="Both sides of the band are a problem, for different reasons">
                  {active.map((e: any) => (
                    <Bullet key={e.id} label={e.name} value={e.laborPct} lo={bands.labor.lo} hi={bands.labor.hi} />
                  ))}
                </Card>
              )}
              {volume?.available && bands.occupancy && (
                <Card title={profile.volume.label} sub={`Target ${bands.occupancy.lo}–${bands.occupancy.hi}% of ${profile.volume.capacityLabel?.toLowerCase() ?? "capacity"}`}>
                  {volume.rows.filter((r: any) => r.utilisation != null).map((r: any) => (
                    <Bullet key={r.entity} label={r.entity} value={r.utilisation}
                      lo={bands.occupancy.lo} hi={bands.occupancy.hi} />
                  ))}
                </Card>
              )}
              {profile.sections.receivables && cur.ar.length > 0 && (
                <Card title={`Receivables by ${profile.receivables.partyLabel}`}
                  sub="Current–30 · 31–60 · 61–90 · 90+">
                  <StackedH rows={cur.ar.map((a: any) => ({ label: a.payer, values: [a.b0_30, a.b31_60, a.b61_90, a.b90p] }))}
                    colors={["var(--brand)", "var(--brand-deep)", "var(--accent)", "var(--accent-deep)"]}
                    legend={["Current–30", "31–60", "61–90", "90+"]} />
                </Card>
              )}
            </div>
          </>
        );
      }}
    </Frame>
  );
}
