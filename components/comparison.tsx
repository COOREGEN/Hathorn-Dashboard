"use client";
/**
 * Period and comparison controls.
 *
 * Two questions drive an advisory meeting: which month are we looking at, and compared
 * to what. Both live here, and switching either is instant — every comparison is
 * computed from data already on the page, so nothing round-trips to the server.
 */
import type { PeriodMetrics } from "@/lib/metrics";
import { type Comparison, type ComparisonMode, COMPARISON_LABELS } from "@/lib/comparison";

const fmtMoney = (n: number) => {
  const s = n < 0 ? "−" : "";
  const v = Math.abs(n);
  return v >= 1000 ? `${s}$${(v / 1000).toFixed(2)}M` : `${s}$${v.toFixed(1)}K`;
};

function cellValue(v: number, unit: string) {
  if (unit === "percent") return `${v.toFixed(1)}%`;
  if (unit === "ratio") return v.toFixed(2);
  if (unit === "count") return v.toLocaleString();
  return fmtMoney(v);
}

function deltaText(l: { delta: number; deltaPct: number | null; points: number | null; unit: string; material: boolean }) {
  if (!l.material) return "flat";
  if (l.unit === "percent" || l.unit === "ratio") {
    const sign = l.points! > 0 ? "+" : "";
    return `${sign}${l.points!.toFixed(l.unit === "ratio" ? 2 : 1)}${l.unit === "ratio" ? "" : " pts"}`;
  }
  const sign = l.delta > 0 ? "+" : "";
  const abs = l.unit === "count" ? Math.abs(l.delta).toLocaleString() : fmtMoney(Math.abs(l.delta));
  return `${l.delta < 0 ? "−" : sign}${abs}`;
}

/* ── Control bar ────────────────────────────────────────────────────────── */

export function PeriodControls({
  periods, periodId, onPeriod, mode, onMode, entities, entityId, onEntity, availableModes,
}: {
  periods: PeriodMetrics[];
  periodId: string;
  onPeriod: (id: string) => void;
  mode: ComparisonMode;
  onMode: (m: ComparisonMode) => void;
  entities: { id: string; name: string }[];
  entityId: string;
  onEntity: (id: string) => void;
  availableModes: Record<ComparisonMode, boolean>;
}) {
  // Group the picker by year so a long history stays navigable.
  const years = Array.from(new Set(periods.map((p) => p.year))).sort((a, b) => b - a);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select className="select" value={periodId} onChange={(e) => onPeriod(e.target.value)}
        aria-label="Statement period">
        {years.map((y) => (
          <optgroup key={y} label={String(y)}>
            {periods.filter((p) => p.year === y).slice().reverse().map((p) => (
              <option key={p.periodId} value={p.periodId} style={{ color: "#0C0B0A" }}>
                {p.label}{p.status !== "PUBLISHED" ? " — draft" : ""}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <select className="select" value={mode} onChange={(e) => onMode(e.target.value as ComparisonMode)}
        aria-label="Compare against">
        {(Object.keys(COMPARISON_LABELS) as ComparisonMode[]).map((m) => (
          <option key={m} value={m} style={{ color: "#0C0B0A" }}>
            {m === "NONE" ? COMPARISON_LABELS[m] : `vs ${COMPARISON_LABELS[m]}`}
            {!availableModes[m] && m !== "NONE" ? " (n/a)" : ""}
          </option>
        ))}
      </select>

      <select className="select" value={entityId} onChange={(e) => onEntity(e.target.value)}
        aria-label="Business">
        <option value="ALL" style={{ color: "#0C0B0A" }}>All businesses</option>
        {entities.map((e) => (
          <option key={e.id} value={e.id} style={{ color: "#0C0B0A" }}>{e.name}</option>
        ))}
      </select>
    </div>
  );
}

/* ── Comparison table ───────────────────────────────────────────────────── */

export function ComparisonTable({ comparison }: { comparison: Comparison }) {
  if (comparison.mode === "NONE") return null;

  if (!comparison.available) {
    return (
      <p className="prose" style={{ maxWidth: 560 }}>
        {comparison.unavailableReason ?? "No basis available for this comparison."}
      </p>
    );
  }

  return (
    <table className="ledger-table">
      <thead>
        <tr>
          <th style={{ textAlign: "left" }} />
          <th>{comparison.currentLabel}</th>
          <th>{comparison.basisLabel}</th>
          <th>Change</th>
          <th>%</th>
        </tr>
      </thead>
      <tbody>
        {comparison.lines.map((l) => {
          // Immaterial movement is deliberately grey. Colouring a $200 change green
          // teaches people to ignore the colours.
          const colour = !l.material ? "var(--ink-mute)"
            : l.favourable === null ? "var(--ink)"
            : l.favourable ? "var(--brand-text)" : "var(--accent-text)";
          return (
            <tr key={l.label}>
              <td>
                {l.label}
                {l.bandPosition && l.bandPosition !== "inside" && (
                  <span className="tag" style={{ marginLeft: 8, fontSize: 8,
                    color: "var(--accent-text)", padding: "2px 6px" }}>
                    {l.bandPosition} band
                  </span>
                )}
                {l.note && (
                  <div className="caption" style={{ marginTop: 3, maxWidth: 380 }}>{l.note}</div>
                )}
              </td>
              <td>{cellValue(l.current, l.unit)}</td>
              <td style={{ color: "var(--ink-mute)" }}>{cellValue(l.basis, l.unit)}</td>
              <td style={{ color: colour }}>{deltaText(l)}</td>
              <td style={{ color: colour }}>
                {!l.material ? "—"
                  : l.deltaPct === null ? "—"
                  : `${l.deltaPct > 0 ? "+" : ""}${l.deltaPct.toFixed(1)}%`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ── Year-to-date strip ─────────────────────────────────────────────────── */

export function YtdStrip({ ytd, year }: {
  ytd: { available: boolean; monthCount: number; revenue: number; netIncome: number; laborPct: number; netMarginPct: number };
  year: number;
}) {
  if (!ytd.available) return null;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4">
      <div className="kpi">
        <div className="eyebrow">{year} revenue to date</div>
        <div className="kpi-value tnum">{fmtMoney(ytd.revenue)}</div>
        <div className="kpi-sub">{ytd.monthCount} month{ytd.monthCount === 1 ? "" : "s"}</div>
      </div>
      <div className="kpi">
        <div className="eyebrow">{year} net income to date</div>
        <div className="kpi-value tnum" style={{ color: ytd.netIncome >= 0 ? "var(--brand)" : "var(--accent-deep)" }}>
          {fmtMoney(ytd.netIncome)}
        </div>
        <div className="kpi-sub">{ytd.netMarginPct.toFixed(1)}% net margin</div>
      </div>
      <div className="kpi">
        <div className="eyebrow">{year} labor ratio</div>
        <div className="kpi-value tnum">{ytd.laborPct.toFixed(1)}%</div>
        <div className="kpi-sub">Year to date average</div>
      </div>
      <div className="kpi">
        <div className="eyebrow">Average month</div>
        <div className="kpi-value tnum">{fmtMoney(ytd.monthCount ? ytd.revenue / ytd.monthCount : 0)}</div>
        <div className="kpi-sub">Revenue per month</div>
      </div>
    </div>
  );
}
