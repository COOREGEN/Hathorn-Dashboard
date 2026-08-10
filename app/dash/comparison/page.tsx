import Frame from "@/components/dash/frame";
import { Kpi, Card, Empty, money } from "@/components/dash/ui";

const SEV: Record<string, { col: string; head: string }> = {
  blocking: { col: "var(--accent-deep)", head: "Not comparable" },
  warning: { col: "var(--accent)", head: "Read with care" },
  note: { col: "var(--ink-mute)", head: "Worth knowing" },
};

export default function ComparisonView({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  return (
    <Frame searchParams={searchParams} title="Comparison"
      subtitle="Explainable comparison across periods, plans, and entities">
      {(ctx) => {
        const { comparison: c, cur, perDay } = ctx as any;
        return (
          <>
            <h2 className="sec">{cur.label} against {c.basisLabel || "the chosen basis"}</h2>
            <p className="sec-q">A number on its own means nothing. Compared to what?</p>

            {c.issues.length > 0 && (
              <div style={{ maxWidth: 720, marginBottom: 26 }}>
                {c.issues.map((i: any, k: number) => (
                  <div className="note" key={k} style={{ borderLeftColor: SEV[i.severity].col }}>
                    <div className="note-h" style={{ color: SEV[i.severity].col }}>{SEV[i.severity].head}</div>
                    <div className="note-b">
                      {i.message}
                      {i.guidance && <span style={{ display: "block", marginTop: 6,
                        color: "var(--ink-mute)", fontSize: 13.5 }}>{i.guidance}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!c.available ? (
              <Empty title="Comparison suppressed">
                {c.unavailableReason ?? "These periods cannot be compared like for like."}
                {" "}A delta nobody should trust is worse present than absent.
              </Empty>
            ) : (
              <>
                <Card>
                  <table>
                    <thead><tr><th /><th>{c.currentLabel}</th><th>{c.basisLabel}</th><th>Change</th><th>%</th></tr></thead>
                    <tbody>
                      {c.lines.map((l: any) => {
                        const col = !l.material ? "var(--ink-mute)"
                          : l.favourable === null ? "var(--ink)"
                          : l.favourable ? "var(--brand-text)" : "var(--accent-text)";
                        const isPct = l.unit === "percent" || l.unit === "ratio";
                        const cv = isPct ? `${l.current.toFixed(1)}%`
                          : l.unit === "count" ? l.current.toLocaleString() : money(l.current);
                        const bv = isPct ? `${l.basis.toFixed(1)}%`
                          : l.unit === "count" ? l.basis.toLocaleString() : money(l.basis);
                        const dt = !l.material ? "flat"
                          : isPct ? `${l.points > 0 ? "+" : ""}${l.points.toFixed(1)} pts`
                          : l.unit === "count" ? `${l.delta > 0 ? "+" : "−"}${Math.abs(l.delta).toLocaleString()}`
                          : `${l.delta < 0 ? "−" : "+"}${money(Math.abs(l.delta))}`;
                        return (
                          <tr key={l.label}>
                            <td>
                              {l.label}
                              {l.bandPosition && l.bandPosition !== "inside" && (
                                <span className="tag" style={{ color: "var(--accent-text)", marginLeft: 8, fontSize: 8 }}>
                                  {l.bandPosition} band
                                </span>
                              )}
                              {l.note && <div className="caption" style={{ marginTop: 3, maxWidth: 380 }}>{l.note}</div>}
                            </td>
                            <td className="tnum">{cv}</td>
                            <td className="tnum muted">{bv}</td>
                            <td className="tnum" style={{ color: col }}>{dt}</td>
                            <td className="tnum" style={{ color: col }}>
                              {!l.material || l.deltaPct === null ? "—"
                                : `${l.deltaPct > 0 ? "+" : ""}${l.deltaPct.toFixed(1)}%`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </Card>
                <p className="caption" style={{ marginTop: 14, maxWidth: 660 }}>
                  Green is the direction you want, which is not always up: overhead falling is
                  favourable, revenue falling is not, and a labor ratio has a floor as well as a
                  ceiling. Movements too small to matter show as flat rather than dressed up.
                  Percentage lines move in points.
                </p>

                {perDay && c.issues.some((i: any) => String(i.code).startsWith("period_length")) && (
                  <div className="section-gap">
                    <Card title="Per operating day" sub="A short month earns less without anything going wrong">
                      <div className="grid g4">
                        <Kpi label="Days in period" value={String(perDay.days)} sub="Calendar days covered" />
                        <Kpi label="Revenue per day" value={`$${perDay.revenuePerDay.toFixed(1)}K`} sub="Calendar removed" />
                        <Kpi label="Hours per day" value={perDay.hoursPerDay.toLocaleString()} sub="From the payroll register" />
                        <Kpi label="Net per day" value={`$${perDay.netIncomePerDay.toFixed(2)}K`} sub="After everything" />
                      </div>
                    </Card>
                  </div>
                )}
              </>
            )}
          </>
        );
      }}
    </Frame>
  );
}
