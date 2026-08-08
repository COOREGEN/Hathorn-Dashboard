import Frame from "@/components/dash/frame";
import { Kpi, Card, Empty, Bullet, money } from "@/components/dash/ui";
import { Bars } from "@/components/dash/charts";

/**
 * Volume: units of activity, whatever a unit means for this business.
 *
 * Hours for home care, nights for a rental, enrolled children for a centre, jobs for a
 * contractor. The old build hardcoded payroll hours, which quietly asserted that every
 * client sells labour.
 */
export default function Volume({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  return (
    <Frame searchParams={searchParams} title="Volume" showFilters={false}
      subtitle="Units delivered, capacity used, and the rate behind the revenue">
      {(ctx) => {
        const { cur, volume, profile, bands, periods } = ctx as any;
        const V = profile.volume;

        if (!volume?.available) {
          return (
            <Empty title={`No ${V.unitPlural} recorded for ${cur.label}`}>
              {V.label} comes from <strong>volume.csv</strong> on the close — one row per
              business with units sold and, where it applies, capacity available. Without
              it the revenue line has no denominator, so {V.rateLabel.toLowerCase()} and
              utilisation cannot be shown.
            </Empty>
          );
        }

        const rate = volume.totalSold ? cur.revenue / volume.totalSold : 0;
        const trend = periods.filter((p: any) => p.year === cur.year && p.month <= cur.month);

        return (
          <>
            <div className="grid g4">
              <Kpi label={V.label} value={volume.totalSold.toLocaleString()}
                sub={`${V.unitPlural} in ${cur.label}`} />
              {volume.totalCapacity ? (
                <Kpi label="Capacity used" value={`${volume.utilisation}%`}
                  sub={`${volume.totalCapacity.toLocaleString()} ${V.capacityLabel?.toLowerCase() ?? "available"}`}
                  tone={bands.occupancy
                    ? volume.utilisation < bands.occupancy.lo ? "bad"
                      : volume.utilisation > bands.occupancy.hi ? "warn" : "ok"
                    : "n"} />
              ) : (
                <Kpi label="Capacity" value="—" sub="Not tracked for this client" />
              )}
              <Kpi label={V.rateLabel} value={`$${(rate * 1000).toFixed(0)}`}
                sub={`Revenue per ${V.unit}`} />
              <Kpi label="Revenue" value={money(cur.revenue)} sub={`Across ${volume.rows.length} businesses`} />
            </div>

            {volume.totalCapacity && bands.occupancy && (
              <div className="section-gap">
                <Card title="Capacity used by business"
                  sub={`Target ${bands.occupancy.lo}–${bands.occupancy.hi}%. Unsold capacity is the fastest margin to recover.`}>
                  {volume.rows.filter((r: any) => r.utilisation != null).map((r: any) => (
                    <Bullet key={r.entity} label={r.entity} value={r.utilisation}
                      lo={bands.occupancy.lo} hi={bands.occupancy.hi} />
                  ))}
                </Card>
              </div>
            )}

            <div className="section-gap">
              <Card title={`${V.label} by business`} sub={cur.label}>
                <Bars
                  series={[volume.rows.map((r: any) => r.sold)]}
                  labels={volume.rows.map((r: any) => r.entity.split(" ")[0])}
                  colors={["var(--brand)"]} names={[V.label]} />
              </Card>
            </div>

            <div className="section-gap">
              <Card>
                <table>
                  <thead>
                    <tr>
                      <th>Business</th><th>{V.label}</th>
                      {volume.totalCapacity ? <th>{V.capacityLabel ?? "Capacity"}</th> : null}
                      {volume.totalCapacity ? <th>Used</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {volume.rows.map((r: any) => (
                      <tr key={r.entity}>
                        <td>{r.entity}{r.note ? <div className="caption" style={{ marginTop: 3 }}>{r.note}</div> : null}</td>
                        <td className="tnum">{r.sold.toLocaleString()}</td>
                        {volume.totalCapacity ? <td className="tnum">{r.capacity?.toLocaleString() ?? "—"}</td> : null}
                        {volume.totalCapacity ? (
                          <td className="tnum" style={{
                            color: bands.occupancy && r.utilisation != null && r.utilisation < bands.occupancy.lo
                              ? "var(--accent-text)" : "var(--ink)",
                          }}>{r.utilisation != null ? `${r.utilisation.toFixed(0)}%` : "—"}</td>
                        ) : null}
                      </tr>
                    ))}
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
