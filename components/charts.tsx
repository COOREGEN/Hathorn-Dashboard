/* Pure-SVG chart primitives. No chart library — full control, tiny bundle, token-driven. */
import React from "react";

const MUTE = "#6E675B", GRID = "#E4DCC9", INK = "#0C0B0A";
const UI = "Libre Franklin, ui-sans-serif, system-ui, sans-serif";

export function LineChart({ points, labels, height = 220, accentLast = false, compare }:
  { points: number[]; labels: string[]; height?: number; accentLast?: boolean;
    compare?: { points: number[]; label: string } }) {
  const [hover, setHover] = React.useState<number | null>(null);
  const w = 640, h = height, lo = 0;
  const hi = Math.max(...points, ...(compare?.points ?? []), 1) * 1.18;
  const px = (i: number) => 46 + (i * (w - 80)) / Math.max(points.length - 1, 1);
  const py = (v: number) => 16 + (h - 62) * (1 - (v - lo) / (hi - lo));
  const pts = points.map((v, i) => `${px(i)},${py(v)}`).join(" ");
  const area = `46,${h - 46} ${pts} ${px(points.length - 1)},${h - 46}`;
  const cmp = compare?.points.map((v, i) => `${px(i)},${py(v)}`).join(" ");
  const slot = (w - 80) / Math.max(points.length, 1);

  return (
    <div style={{ position: "relative" }}>
    {hover !== null && (
      <div className="tip" style={{ left: `${(px(hover) / w) * 100}%`, top: `${(py(points[hover]) / h) * 100}%` }}>
        <div style={{ opacity: .7, marginBottom: 3 }}>{labels[hover]}</div>
        <div className="tip-row"><span>This year</span><b>${points[hover].toFixed(1)}K</b></div>
        {compare && compare.points[hover] !== undefined && (
          <div className="tip-row" style={{ opacity: .7 }}>
            <span>{compare.label}</span><b>${compare.points[hover].toFixed(1)}K</b>
          </div>
        )}
      </div>
    )}
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto tnum chart-in"
      role="img"
      aria-label={`Line chart. ${labels.map((l, i) => `${l} $${points[i].toFixed(1)}K`).join(", ")}.`}
      onMouseLeave={() => setHover(null)}>
      {[0, 1, 2, 3].map((g) => {
        const y = 16 + (g * (h - 62)) / 3;
        return (
          <g key={g}>
            <line x1={46} y1={y} x2={w - 20} y2={y} stroke={GRID} />
            <text x={40} y={y + 4} fontSize={9.5} fill={MUTE} textAnchor="end" fontFamily={UI}>
              ${Math.round(hi * (1 - g / 3))}K
            </text>
          </g>
        );
      })}
      <polygon points={area} fill="var(--brand)" opacity={0.07} />
      {cmp && (
        <polyline points={cmp} fill="none" stroke="var(--ink-mute)" strokeWidth={1.5}
          strokeDasharray="4 4" opacity={0.7} />
      )}
      <polyline points={pts} fill="none" stroke="var(--brand)" strokeWidth={2.5} />
      {hover !== null && (
        <line x1={px(hover)} y1={12} x2={px(hover)} y2={h - 46} stroke="var(--ink-mute)" strokeWidth={1} opacity={0.4} />
      )}
      {points.map((v, i) => {
        const last = i === points.length - 1;
        return (
          <g key={i}>
            <circle cx={px(i)} cy={py(v)} r={4} fill={last && accentLast ? "var(--accent)" : "var(--brand)"} />
            <text x={px(i)} y={py(v) - 10} fontSize={10.5} fontWeight={600} fill={INK} textAnchor="middle" fontFamily={UI}>
              ${v.toFixed(1)}K
            </text>
            <text x={px(i)} y={h - 24} fontSize={10} fill={MUTE} textAnchor="middle" fontFamily={UI}>{labels[i]}</text>
          </g>
        );
      })}
      {/* Invisible hit targets — one per point, keyboard reachable. */}
      {points.map((v, i) => (
        <rect key={`hit-${i}`} className="hit" x={px(i) - slot / 2} y={0} width={slot} height={h - 40}
          tabIndex={0} role="button"
          aria-label={`${labels[i]}: $${v.toFixed(1)}K`}
          onMouseEnter={() => setHover(i)}
          onFocus={() => setHover(i)}
          onBlur={() => setHover(null)} />
      ))}
    </svg>
    </div>
  );
}

export function GroupedBars({ series, labels, colors, height = 230, prefix = "$", names }:
  { series: number[][]; labels: string[]; colors: string[]; height?: number; prefix?: string; names?: string[] }) {
  const [hover, setHover] = React.useState<number | null>(null);
  const w = 640, h = height, n = labels.length, g = series.length;
  const hi = Math.max(...series.flat(), 1) * 1.2;
  const x0 = 48, slot = (w - x0 - 24) / n, bw = Math.min(24, (slot - 10) / g - 3);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto tnum chart-in" role="img"
      aria-label={labels.map((l, i) => `${l}: ${series.map((sr, k) => `${names?.[k] ?? "series " + (k + 1)} ${sr[i]}`).join(", ")}`).join(". ")}
      onMouseLeave={() => setHover(null)}>
      {[0, 1, 2, 3].map((gr) => {
        const y = 12 + (gr * (h - 58)) / 3;
        return (
          <g key={gr}>
            <line x1={x0} y1={y} x2={w - 16} y2={y} stroke={GRID} />
            <text x={x0 - 6} y={y + 4} fontSize={9.5} fill={MUTE} textAnchor="end" fontFamily={UI}>
              {prefix}{Math.round(hi * (1 - gr / 3))}{prefix ? "K" : ""}
            </text>
          </g>
        );
      })}
      {labels.map((lab, i) => {
        const cx = x0 + slot * i + slot / 2;
        return (
          <g key={i}>
            {series.map((s, k) => {
              const v = s[i];
              const bh = ((h - 58 - 12) * v) / hi;
              const bx = cx - (g * bw + (g - 1) * 4) / 2 + k * (bw + 4);
              return (
                <g key={k}>
                  <rect x={bx} y={h - 46 - bh} width={bw} height={Math.max(bh, 0)} rx={0} fill={colors[k]}
                    opacity={hover === null || hover === i ? 1 : 0.35}
                    style={{ transition: "opacity .15s ease" }} />
                  {v > 0 && (
                    <text x={bx + bw / 2} y={h - 50 - bh} fontSize={9.5} fontWeight={600} fill={INK} textAnchor="middle" fontFamily={UI}>
                      {v.toFixed(0)}
                    </text>
                  )}
                </g>
              );
            })}
            <text x={cx} y={h - 26} fontSize={10} fill={MUTE} textAnchor="middle" fontFamily={UI}>{lab}</text>
            <rect className="hit" x={cx - slot / 2} y={0} width={slot} height={h - 40}
              onMouseEnter={() => setHover(i)} />
          </g>
        );
      })}
    </svg>
  );
}

export function StackedH({ rows, colors, legend }:
  { rows: { label: string; sub: string; values: number[] }[]; colors: string[]; legend: string[] }) {
  const w = 640, rh = 30, gap = 16;
  const maxv = Math.max(...rows.map((r) => r.values.reduce((a, b) => a + b, 0)), 1);
  const h = rows.length * (rh + gap) + 24;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto tnum">
        {rows.map((r, i) => {
          const y = i * (rh + gap) + 2;
          let x = 168;
          return (
            <g key={i}>
              <text x={0} y={y + rh / 2 - 4} fontSize={11.5} fontWeight={600} fill={INK} fontFamily={UI}>{r.label}</text>
              <text x={0} y={y + rh / 2 + 10} fontSize={10} fill={MUTE} fontFamily={UI}>{r.sub}</text>
              {r.values.map((v, k) => {
                const bw = ((w - 224) * v) / maxv;
                const rect = (
                  <g key={k}>
                    <rect x={x} y={y} width={Math.max(bw, 1)} height={rh} fill={colors[k]} />
                    {bw > 34 && (
                      <text x={x + bw / 2} y={y + rh / 2 + 4} fontSize={9.5} fontWeight={600} fill="#FBF8F1" textAnchor="middle" fontFamily={UI}>
                        {v.toFixed(1)}
                      </text>
                    )}
                  </g>
                );
                x += bw;
                return rect;
              })}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-x-5 gap-y-1 caption" style={{ marginTop: 8 }}>
        {legend.map((l, i) => (
          <span key={i} className="inline-flex items-center gap-1.5">
            <i style={{ width: 9, height: 9, display: "inline-block", background: colors[i] }} />{l}
          </span>
        ))}
      </div>
    </div>
  );
}

export function BulletBar({ label, value, bandLo, bandHi, max = 100, note }:
  { label: string; value: number; bandLo: number | null; bandHi: number | null; max?: number; note?: string }) {
  const pct = (v: number) => Math.min((100 * v) / max, 100);
  // No agreed band: draw the value alone rather than a band from nowhere, and
  // pass no verdict on it.
  const hasBand = bandLo != null && bandHi != null;
  const bad = hasBand && value > bandHi!;
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="flex justify-between items-baseline" style={{ marginBottom: 7 }}>
        <span style={{ fontFamily: "var(--editorial)", fontSize: 14 }}>{label}</span>
        <span className="tnum" style={{ fontFamily: "var(--utility)", fontSize: 13, fontWeight: 600,
          color: bad ? "var(--accent-text)" : "var(--brand-text)" }}>{value.toFixed(1)}%</span>
      </div>
      <div style={{ position: "relative", height: 10, background: "#E8E2D4" }}>
        {hasBand && (
          <div style={{ position: "absolute", top: 0, bottom: 0, left: `${pct(bandLo!)}%`,
            width: `${pct(bandHi! - bandLo!)}%`, background: "var(--brand)", opacity: 0.2 }} />
        )}
        <div style={{ position: "absolute", top: 2, bottom: 2, left: 0, width: `${pct(value)}%`,
          background: bad ? "var(--accent)" : "var(--brand)" }} />
        {hasBand && (
          <div style={{ position: "absolute", top: -3, bottom: -3, width: 1, left: `${pct(bandHi!)}%`,
            background: "var(--ink)" }} />
        )}
      </div>
      {note && <div className="caption" style={{ marginTop: 6 }}>{note}</div>}
      {!hasBand && !note && (
        <div className="caption" style={{ marginTop: 6 }}>No agreed band — reported, not judged.</div>
      )}
    </div>
  );
}
