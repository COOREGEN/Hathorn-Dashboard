import Frame from "@/components/dash/frame";
import { Empty } from "@/components/dash/ui";
import { formatKpi, formatTarget, SOURCE_LABEL } from "@/components/dash/kpi-format";
import { computeKpis, type KpiResult } from "@/lib/kpi-registry";
import { computePeriod } from "@/lib/metrics";
import { PRESETS } from "@/lib/kpi-defaults";

/**
 * Every metric with its shape.
 *
 * The first version of this screen was a settings page wearing a dashboard's clothes:
 * ten rows, every one reading "No target agreed / Reported, not judged" in two of four
 * columns, with no history and no movement. It told a reader nothing about the business.
 *
 * A number without shape is a fact, not a metric — 68% occupancy means nothing until you
 * know it was 74% three months ago. So every row now leads with the value, its movement,
 * and a trailing line. Target and provenance move to the right, where they belong:
 * important, but not the point.
 */

/** Twelve months in 96×26. Small enough for a table row, large enough to read. */
function Line({ trend, unit }: { trend: KpiResult["trend"]; unit: string }) {
  const pts = trend.filter((t) => t.value !== null).map((t) => t.value as number);
  if (pts.length < 2) return <span style={{ color: "var(--ink-mute)", fontSize: 11 }}>—</span>;
  const w = 96, h = 26;
  const hi = Math.max(...pts), lo = Math.min(...pts);
  const span = hi - lo || Math.abs(hi) || 1;
  const x = (i: number) => (i / (pts.length - 1)) * (w - 3) + 1.5;
  const y = (v: number) => h - 4 - ((v - lo) / span) * (h - 8);
  const d = pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const rising = pts[pts.length - 1] >= pts[0];
  const col = rising ? "#2C504D" : "#B94B22";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h, display: "block" }}>
      <polyline points={d} fill="none" stroke={col} strokeWidth={1.4} />
      <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1])} r={2.1} fill={col} />
    </svg>
  );
}

export default function Metrics({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  return (
    <Frame searchParams={searchParams} title="Metrics" showFilters={false}
      subtitle="Every measure the firm tracks for this client, with its trend">
      {(ctx) => {
        const { client, cur } = ctx as any;
        const m = computePeriod(cur.periodId);
        const results = computeKpis(client.id, m, "ALL", { trend: true });
        const preset = PRESETS[client.vertical ?? "generic"];

        if (!results.length) {
          return (
            <Empty title="No metrics configured for this client">
              Apply a preset in Settings, or add metrics individually from the library.
            </Empty>
          );
        }

        const untargeted = results.filter((r) => r.target.source === "NONE").length;
        const categories = Array.from(new Set(results.map((r) => r.category)));

        return (
          <>
            {/* One line of context, not four cards. Configuration lives in Settings. */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 20, flexWrap: "wrap",
              paddingBottom: 14, borderBottom: "1px solid var(--hairline)", marginBottom: 4 }}>
              <span className="caption">
                {results.length} metrics · {preset?.label ?? "no preset"}
              </span>
              {untargeted > 0 && (
                <span className="caption" style={{ color: "var(--gold-deep)" }}>
                  {untargeted} have no agreed target yet, so they are reported without a verdict
                </span>
              )}
              <span className="caption" style={{ marginLeft: "auto" }}>
                Trailing 12 months · movement against the prior period
              </span>
            </div>

            {categories.map((cat) => (
              <div key={cat} style={{ marginTop: 26 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>{cat}</div>
                <div style={{ border: "1px solid var(--hairline)", background: "#FFFDF8" }}>
                  {/* Header once per category, not repeated per table. */}
                  <div className="mrow mrow-head">
                    <div>Metric</div>
                    <div style={{ textAlign: "right" }}>{cur.label}</div>
                    <div style={{ textAlign: "right" }}>vs prior</div>
                    <div>12 months</div>
                    <div style={{ textAlign: "right" }}>Target</div>
                    <div>Basis</div>
                  </div>

                  {results.filter((r) => r.category === cat).map((r) => {
                    const col = r.verdict === null ? "var(--ink)"
                      : r.verdict === "inside" || r.verdict === "on" ? "#2C504D" : "#B94B22";
                    return (
                      <div key={r.key} className="mrow">
                        <div style={{ minWidth: 0 }}>
                          <span className="mrow-label">{r.label}</span>
                          {r.importance === 3 && <span className="mrow-key">key</span>}
                          {r.unavailableReason && (
                            <div className="caption" style={{ marginTop: 2 }}>{r.unavailableReason}</div>
                          )}
                        </div>

                        <div className="tnum mrow-v" style={{ color: col }}>
                          {formatKpi(r.value, r.unit, r.decimals)}
                          {r.verdict && r.verdict !== "inside" && r.verdict !== "on" && (
                            <span className="mrow-band">{r.verdict}</span>
                          )}
                        </div>

                        <div className="tnum mrow-delta" style={{
                          color: r.changePct === null ? "var(--ink-mute)"
                            : r.changePct >= 0 ? "#2C504D" : "#B94B22" }}>
                          {r.changePct === null ? "—"
                            : `${r.changePct >= 0 ? "▲" : "▼"} ${Math.abs(r.changePct).toFixed(1)}%`}
                        </div>

                        <div><Line trend={r.trend} unit={r.unit} /></div>

                        <div className="tnum mrow-target">
                          {r.target.source === "NONE"
                            ? <span style={{ color: "var(--ink-mute)" }}>—</span>
                            : formatTarget(r.target, r.unit, r.decimals)}
                        </div>

                        <div className="mrow-basis" style={{
                          color: r.target.source === "NONE" ? "var(--ink-mute)" : "var(--ink)" }}>
                          {r.target.source === "NONE" ? "not yet agreed" : SOURCE_LABEL[r.target.source]}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <p className="caption" style={{ marginTop: 24, maxWidth: 700 }}>
              Targets live on the client, never in the metric definition, because a band that
              fits one business is wrong for the next in the same industry. Where a client has
              at least six closed months a band can be derived from the middle half of their own
              results. Until a target is agreed or derived, the metric is reported without a
              verdict — which is the honest state, not a gap.
            </p>
          </>
        );
      }}
    </Frame>
  );
}
