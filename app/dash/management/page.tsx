import Frame from "@/components/dash/frame";
import { Kpi, Card, Sec, Empty, money, pct } from "@/components/dash/ui";
import { StackedH } from "@/components/dash/charts";
import { managementBasis, feeRecovery, channelMix } from "@/lib/management-basis";
import { computePeriod } from "@/lib/metrics";

/**
 * Management basis: the bridge from gross flow to what the manager actually earned.
 *
 * This exists because reporting either number alone misleads. Gross bookings flatter the
 * business by an order of magnitude; management revenue alone will not tie to the books.
 * The waterfall is the deliverable.
 */
export default function Management({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  return (
    <Frame searchParams={searchParams} title="Management Basis" showFilters={false}
      subtitle="Gross bookings, pass-through, fee recovery, and channel mix">
      {(ctx) => {
        const { cur, profile } = ctx as any;
        const m = computePeriod(cur.periodId);
        const b = managementBasis(m);
        const fees = feeRecovery(cur.periodId);
        const ch = channelMix(cur.periodId);

        if (!b.available) {
          return (
            <Empty title="No management basis recorded for this period">
              Gross bookings and pass-through come from <strong>passthrough.csv</strong> on the
              close. Without them the platform cannot separate money that flowed through the
              account from money the business earned, and reporting gross bookings as revenue
              would overstate this business by roughly five times.
            </Empty>
          );
        }

        return (
          <>
            <div className="grid g4">
              <Kpi label="Gross bookings" value={money(b.grossBookings)}
                sub="Flowed through the account" />
              <Kpi label="Pass-through" value={money(b.totalPassthrough)}
                sub="Tax, owner disbursements, reserves" />
              <Kpi label="Management revenue" value={money(b.managementRevenue)}
                sub={`${((b.managementRevenue / b.grossBookings) * 100).toFixed(1)}% of gross retained`} tone="ok" />
              <Kpi label="Management NOI" value={money(b.managementNOI)}
                sub={`${pct(b.managementMargin)} of management revenue`}
                tone={b.managementNOI >= 0 ? "ok" : "bad"} />
            </div>

            <Sec title="The bridge" question="What flowed through, what was never yours, and what remains?">
              <Card>
                <table>
                  <tbody>
                    {b.bridge.map((step, i) => (
                      <tr key={i} style={step.kind === "total"
                        ? { borderTop: "1px solid var(--ink)" } : undefined}>
                        <td style={step.kind === "total"
                          ? { fontFamily: "var(--utility)", fontWeight: 600, color: "var(--ink)" }
                          : undefined}>{step.label}</td>
                        <td className="tnum" style={{
                          fontWeight: step.kind === "total" ? 600 : 500,
                          color: step.kind === "deduct" ? "var(--ink-mute)" : "var(--ink)",
                        }}>{money(step.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <p className="caption" style={{ marginTop: 14, maxWidth: 660 }}>
                Gross bookings are collected on behalf of owners. Tax is remitted to the state,
                the balance is disbursed, and the management fee is what remains. Reporting the
                gross figure as revenue would overstate this business roughly
                {" "}{(b.grossBookings / Math.max(b.managementRevenue, 0.1)).toFixed(1)}×.
                {b.bookNetIncome != null && ` Book net income for the period is ${money(b.bookNetIncome)}.`}
              </p>
            </Sec>

            {fees.available && (
              <Sec title="Fee recovery"
                question="Fees billed, fees collected, and what the service actually cost.">
                <div className="grid g4" style={{ marginBottom: 20 }}>
                  <Kpi label="Billed" value={money(fees.totalBilled)} sub="Across all fee types" />
                  <Kpi label="Collected" value={money(fees.totalCollected)}
                    sub={`${fees.recoveryPct}% recovery`}
                    tone={(fees.recoveryPct ?? 100) < 95 ? "warn" : "ok"} />
                  <Kpi label="Service cost" value={money(fees.totalCost)} sub="Paid to vendors" />
                  <Kpi label="Fee margin" value={money(fees.totalMargin)}
                    sub={fees.subsidised.length ? `Subsidising ${fees.subsidised.join(", ").toLowerCase()}` : "All fee types positive"}
                    tone={fees.subsidised.length ? "bad" : "ok"} />
                </div>
                <Card>
                  <table>
                    <thead>
                      <tr><th>Fee type</th><th>Billed</th><th>Collected</th><th>Cost</th><th>Margin</th><th>Recovery</th></tr>
                    </thead>
                    <tbody>
                      {fees.lines.map((l) => (
                        <tr key={l.feeType}>
                          <td>
                            {l.feeType.charAt(0) + l.feeType.slice(1).toLowerCase()}
                            {l.note && <div className="caption" style={{ marginTop: 3, maxWidth: 360 }}>{l.note}</div>}
                          </td>
                          <td className="tnum">{money(l.billed)}</td>
                          <td className="tnum">{money(l.collected)}</td>
                          <td className="tnum muted">{money(l.cost)}</td>
                          <td className="tnum" style={{ color: l.margin < 0 ? "var(--accent-text)" : "var(--brand-text)" }}>
                            {money(l.margin)}
                          </td>
                          <td className="tnum" style={{ color: (l.recoveryPct ?? 100) < 90 ? "var(--accent-text)" : "var(--ink)" }}>
                            {l.recoveryPct != null ? `${l.recoveryPct}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
                {fees.subsidised.length > 0 && (
                  <div className="note note-bad" style={{ marginTop: 18, maxWidth: 700 }}>
                    <div className="note-h">A service is being delivered below cost</div>
                    <div className="note-b">
                      {fees.subsidised.map((f) => f.toLowerCase()).join(" and ")} costs more than it
                      bills. This is invisible in a normal P&amp;L because the two sides land in
                      different accounts, and it is usually the fastest margin available — raising
                      the fee to cover cost requires no new bookings.
                    </div>
                  </div>
                )}
              </Sec>
            )}

            {ch.available && (
              <Sec title="Channel mix" question="Where did the bookings come from, and what did each cost?">
                <div className="grid g3" style={{ marginBottom: 20 }}>
                  <Kpi label="Blended channel fee" value={`${ch.blendedFeePct}%`}
                    sub={`${money(ch.totalFees)} on ${money(ch.totalGross)} gross`} />
                  <Kpi label="Largest channel" value={`${ch.topChannelShare}%`}
                    sub={ch.channels[0]?.channel ?? ""}
                    tone={ch.topChannelShare > 60 ? "warn" : "n"} />
                  <Kpi label="Direct share"
                    value={`${ch.channels.find((c) => /direct/i.test(c.channel))?.share ?? 0}%`}
                    sub="Lowest-cost channel" />
                </div>
                <Card title="Gross bookings by channel" sub="Bar length is gross; fees shown separately">
                  <StackedH
                    rows={ch.channels.map((c) => ({ label: c.channel, values: [c.net, c.fees] }))}
                    colors={["var(--brand)", "var(--accent)"]}
                    legend={["Net after channel fee", "Channel fee"]} />
                </Card>
                <p className="caption" style={{ marginTop: 14, maxWidth: 660 }}>
                  Channel fees are a margin lever that responds faster than cost cutting: shifting
                  ten points of volume from a {ch.channels[0]?.feePct}% platform to direct booking
                  is worth about {money((ch.totalGross * 0.1) * (((ch.channels[0]?.feePct ?? 0) -
                    (ch.channels.find((c) => /direct/i.test(c.channel))?.feePct ?? 0)) / 100))} a month.
                  {ch.topChannelShare > 50 && ` Concentration is worth watching — ${ch.topChannelShare}% through one platform is exposure to that platform's terms.`}
                </p>
              </Sec>
            )}
          </>
        );
      }}
    </Frame>
  );
}
