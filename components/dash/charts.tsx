/**
 * Pure-SVG charts.
 *
 * Hand-rolled rather than a library so the typography matches the rest of the system —
 * Libre Franklin labels, tabular figures, no rounded pills, no default palette.
 *
 * Every value label was printed permanently above its point, which is why the charts read
 * as static pictures rather than something you could interrogate: a dense series became a
 * wall of overlapping numbers, and there was nothing to do with a chart but look at it.
 * Labels now belong to the point under the cursor, and the rest of the series stays quiet.
 * Keyboard focus does the same thing, so the behaviour is not mouse-only.
 */
"use client";
import { useState } from "react";

const UI = "Libre Franklin, ui-sans-serif, sans-serif";
const money = (v: number) => `$${v.toFixed(1)}K`;

export function LineChart({ points, labels, prior, height = 210, format = money }: {
  points: number[]; labels: string[]; prior?: number[]; height?: number;
  format?: (n: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const w = 640, h = height;
  const hi = Math.max(...points, ...(prior ?? []), 1) * 1.18;
  const px = (i: number) => 46 + i * ((w - 80) / Math.max(points.length - 1, 1));
  const py = (v: number) => h - 44 - (v / hi) * (h - 78);
  // Hit bands span the gap between points so the whole chart is reachable.
  const band = (w - 80) / Math.max(points.length - 1, 1);
  const pts = points.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart" role="img"
      aria-label={labels.map((l, i) => `${l} ${format(points[i])}`).join(", ")}>
      {[0, 1, 2, 3].map((k) => {
        const y = 18 + k * ((h - 78) / 3);
        return <line key={k} x1={46} y1={y} x2={w - 30} y2={y} stroke="var(--hairline)" />;
      })}
      <polygon points={`46,${h - 44} ${pts} ${px(points.length - 1).toFixed(1)},${h - 44}`}
        fill="var(--brand)" opacity={0.07} />
      {prior && prior.length > 0 && (
        <polyline points={prior.slice(0, points.length).map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ")}
          fill="none" stroke="var(--ink-mute)" strokeWidth={1.5} strokeDasharray="4 4" opacity={0.65} />
      )}
      <polyline points={pts} fill="none" stroke="var(--brand)" strokeWidth={2.5} />

      {/* A guide line on the active point, so the eye can drop to the axis. */}
      {active !== null && (
        <line x1={px(active)} y1={12} x2={px(active)} y2={h - 34}
          stroke="var(--ink-mute)" strokeWidth={1} strokeDasharray="3 3" opacity={0.45} />
      )}

      {points.map((v, i) => {
        const last = i === points.length - 1;
        const on = active === i || (active === null && last);
        return (
          <g key={i}>
            <circle cx={px(i)} cy={py(v)} r={on ? 5 : 3}
              fill={on ? "var(--accent)" : "var(--brand)"}
              style={{ transition: "r .12s ease" }} />
            {on && (
              <text x={px(i)} y={py(v) - 14} fontSize={11.5} fontWeight={600} fill="var(--ink)"
                textAnchor="middle" fontFamily={UI}>{format(v)}</text>
            )}
            <text x={px(i)} y={h - 22} fontSize={10}
              fill={on ? "var(--ink)" : "var(--ink-mute)"} fontWeight={on ? 600 : 400}
              textAnchor="middle" fontFamily={UI}>{labels[i]}</text>
          </g>
        );
      })}

      {/* Full-height targets: a 3px circle is not something anyone can reliably hit. */}
      {points.map((v, i) => (
        <rect key={`hit-${i}`} x={px(i) - band / 2} y={0} width={band} height={h - 30}
          fill="transparent" tabIndex={0} role="button"
          aria-label={`${labels[i]}: ${format(v)}`}
          onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
          onFocus={() => setActive(i)} onBlur={() => setActive(null)}
          style={{ cursor: "crosshair", outline: "none" }} />
      ))}
    </svg>
  );
}

export function Donut({ slices, colors }: { slices: { label: string; value: number }[]; colors: string[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const R = 62, r = 40, cx = 80, cy = 80;
  let a0 = -Math.PI / 2;
  const paths = slices.map((s, i) => {
    const a1 = a0 + (s.value / total) * Math.PI * 2;
    const big = a1 - a0 > Math.PI ? 1 : 0;
    const pt = (a: number, rad: number) =>
      `${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`;
    const d = `M ${pt(a0, R)} A ${R} ${R} 0 ${big} 1 ${pt(a1, R)} L ${pt(a1, r)} A ${r} ${r} 0 ${big} 0 ${pt(a0, r)} Z`;
    a0 = a1;
    return <path key={i} d={d} fill={colors[i % colors.length]} />;
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
      <svg viewBox="0 0 160 160" style={{ width: 150, height: 150 }} className="chart">
        {paths}
        <text x={80} y={76} textAnchor="middle" fontSize={9} fontFamily={UI}
          fill="var(--ink-mute)" letterSpacing={1.4}>TOTAL</text>
        <text x={80} y={94} textAnchor="middle" fontSize={15} fontWeight={600}
          fontFamily={UI} fill="var(--ink)">${(total).toFixed(1)}K</text>
      </svg>
      <div className="legend" style={{ flexDirection: "column", gap: 8, margin: 0 }}>
        {slices.map((s, i) => (
          <span key={i}><i style={{ background: colors[i % colors.length] }} />
            {s.label} · {((s.value / total) * 100).toFixed(0)}%</span>
        ))}
      </div>
    </div>
  );
}

export function Bars({ series, labels, colors, names, height = 215 }: {
  series: number[][]; labels: string[]; colors: string[]; names: string[]; height?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const w = 640, h = height;
  const hi = Math.max(...series.flat(), 1) * 1.2;
  const slot = (w - 80) / labels.length;
  const bw = Math.min(slot / (series.length + 1.4), 24);

  return (
    <>
      <svg viewBox={`0 0 ${w} ${h}`} className="chart" role="img"
        aria-label={labels.map((l, i) => `${l}: ${series.map((s, k) => `${names[k]} ${s[i]}`).join(", ")}`).join(". ")}>
        {[0, 1, 2, 3].map((k) => {
          const y = 18 + k * ((h - 78) / 3);
          return <line key={k} x1={46} y1={y} x2={w - 30} y2={y} stroke="var(--hairline)" />;
        })}
        {labels.map((lab, i) => {
          const cx = 46 + slot * i + slot / 2;
          return (
            <g key={i}>
              {series.map((sr, k) => {
                const bh = (sr[i] / hi) * (h - 78);
                const bx = cx - (series.length * bw) / 2 + k * bw;
                return (
                  <g key={k}>
                    <rect x={bx} y={h - 44 - bh} width={bw - 3} height={Math.max(bh, 0)}
                      fill={colors[k % colors.length]}
                      // Dimming the rest is what makes one column readable in a dense series.
                      opacity={active === null || active === i ? 1 : 0.32}
                      style={{ transition: "opacity .13s ease" }} />
                    {active === i && (
                      <text x={bx + (bw - 3) / 2} y={h - 49 - bh} fontSize={10} fontWeight={600}
                        fill="var(--ink)" textAnchor="middle" fontFamily={UI}>
                        {sr[i].toFixed(sr[i] >= 100 ? 0 : 1)}
                      </text>
                    )}
                  </g>
                );
              })}
              <text x={cx} y={h - 22} fontSize={10}
                fill={active === i ? "var(--ink)" : "var(--ink-mute)"}
                fontWeight={active === i ? 600 : 400}
                textAnchor="middle" fontFamily={UI}>{lab}</text>
            </g>
          );
        })}

        {/* One target per column, spanning the slot. */}
        {labels.map((lab, i) => (
          <rect key={`hit-${i}`} x={46 + slot * i} y={0} width={slot} height={h - 30}
            fill="transparent" tabIndex={0} role="button"
            aria-label={`${lab}: ${series.map((sr, k) => `${names[k]} ${sr[i]}`).join(", ")}`}
            onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)} onBlur={() => setActive(null)}
            style={{ cursor: "crosshair", outline: "none" }} />
        ))}
      </svg>
      <div className="legend">
        {names.map((n, k) => <span key={k}><i style={{ background: colors[k % colors.length] }} />{n}</span>)}
      </div>
    </>
  );
}

export function StackedH({ rows, colors, legend }: {
  rows: { label: string; values: number[] }[]; colors: string[]; legend: string[];
}) {
  const w = 640, gap = 40, h = rows.length * gap + 10;
  const max = Math.max(...rows.map((r) => r.values.reduce((s, v) => s + v, 0)), 1);

  return (
    <>
      <svg viewBox={`0 0 ${w} ${h}`} className="chart">
        {rows.map((r, i) => {
          const y = i * gap + 4;
          let x = 158;
          const total = r.values.reduce((s, v) => s + v, 0);
          const segs = r.values.map((v, k) => {
            const bw = (v / max) * (w - 215);
            const el = bw > 0.4 ? (
              <g key={k}>
                <rect x={x} y={y} width={bw} height={26} fill={colors[k % colors.length]} />
                {bw > 32 && <text x={x + bw / 2} y={y + 17} fontSize={9.5} fontWeight={600}
                  fill="#FBF8F1" textAnchor="middle" fontFamily={UI}>{v.toFixed(0)}</text>}
              </g>
            ) : null;
            x += bw;
            return el;
          });
          return (
            <g key={i}>
              <text x={0} y={y + 17} fontSize={12.5} fill="var(--ink)" fontFamily="EB Garamond">{r.label}</text>
              {segs}
              <text x={x + 8} y={y + 17} fontSize={11} fontWeight={600} fill="var(--ink)"
                fontFamily={UI}>${total.toFixed(1)}K</text>
            </g>
          );
        })}
      </svg>
      <div className="legend">
        {legend.map((n, k) => <span key={k}><i style={{ background: colors[k % colors.length] }} />{n}</span>)}
      </div>
    </>
  );
}
