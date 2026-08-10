import Frame from "@/components/dash/frame";
import { Card } from "@/components/dash/ui";
import { rulesFor } from "@/lib/gate";
import { verticalList } from "@/lib/verticals";

/**
 * What the platform assumes about this client, in one place.
 *
 * Every number here is a stated opinion rather than a hidden constant. An advisor should
 * be able to see why the gate blocked something, or why a labour ratio reads red, without
 * reading the source.
 */
export default function Settings({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  return (
    <Frame searchParams={searchParams} title="Settings" showFilters={false}
      subtitle="Industry profile, tie-out rules, bands, and methodology">
      {(ctx) => {
        const { client, profile, bands } = ctx as any;
        const rules = rulesFor(client.vertical ?? "generic");

        return (
          <>
            <div className="grid g2">
              <Card title="Industry profile" sub={profile.label}>
                <p className="caption" style={{ marginBottom: 14 }}>{profile.description}</p>
                <table>
                  <tbody>
                    <tr><td>Direct cost model</td><td>{
                      { payroll_only: "Labor only",
                        payroll_plus_cogs: "Labor plus materials",
                        cogs_only: "Cost of goods only",
                        property_costs: "Property operating costs",
                        none: "Not applicable" }[profile.directCostModel as string]
                    }</td></tr>
                    <tr><td>Unit of volume</td><td>{profile.volume.unitPlural}</td></tr>
                    <tr><td>Receivables from</td><td>{profile.receivables.partyLabelPlural}</td></tr>
                    <tr><td>Ageing meaningful</td><td>{profile.receivables.ageingMatters ? "Yes" : "No — collected near delivery"}</td></tr>
                    <tr><td>Collected at delivery</td><td className="tnum">{Math.round(profile.receivables.immediateShare * 100)}%</td></tr>
                  </tbody>
                </table>
              </Card>

              <Card title="Healthy bands" sub="The vertical's opinion, overridable per client">
                <table>
                  <tbody>
                    {bands.labor && <tr><td>{profile.language.laborRatioLabel}</td>
                      <td className="tnum">{bands.labor.lo}–{bands.labor.hi}%</td></tr>}
                    {bands.grossMargin && <tr><td>Gross margin</td>
                      <td className="tnum">{bands.grossMargin.lo}–{bands.grossMargin.hi}%</td></tr>}
                    {bands.primeCost && <tr><td>Prime cost</td>
                      <td className="tnum">{bands.primeCost.lo}–{bands.primeCost.hi}%</td></tr>}
                    {bands.occupancy && <tr><td>{profile.volume.label}</td>
                      <td className="tnum">{bands.occupancy.lo}–{bands.occupancy.hi}%</td></tr>}
                    {bands.currentRatio && <tr><td>Current ratio</td>
                      <td className="tnum">{bands.currentRatio.lo}–{bands.currentRatio.hi}</td></tr>}
                  </tbody>
                </table>
                {!Object.keys(bands).length && (
                  <p className="caption">No bands set. Ratios will be reported but not judged —
                  choose an industry profile, or set targets on the client record.</p>
                )}
              </Card>
            </div>

            <div className="grid g2 section-gap">
              <Card title="What the gate checks" sub="Nothing publishes until all of these tie">
                <table>
                  <tbody>
                    {rules.map((r) => (
                      <tr key={r.rule}><td>{r.label}</td>
                        <td style={{ color: "var(--brand-text)", fontSize: 11 }}>enforced</td></tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              <Card title="Available profiles" sub="Set on the client record">
                <table>
                  <tbody>
                    {verticalList().map((v) => (
                      <tr key={v.key}>
                        <td>{v.label}</td>
                        <td style={{ fontSize: 11, color: v.key === profile.key ? "var(--brand-text)" : "var(--ink-mute)" }}>
                          {v.key === profile.key ? "current" : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>

            <p className="caption section-gap" style={{ maxWidth: 660 }}>
              Bands carry an opinion on purpose. A configurable ratio with no default is a
              form field — it hands the judgement back to the client, which is the work the
              firm is being paid for. Where a business genuinely differs from its industry,
              override it on the client record.
            </p>
          </>
        );
      }}
    </Frame>
  );
}
