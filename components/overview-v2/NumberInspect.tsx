"use client";
/**
 * Compact number inspection drawer — What / Compare / Drivers teaser / deep links.
 */
import Link from "next/link";
import type { OverviewLens, OverviewV2Model } from "@/lib/overview-v2/build";
import type { VitalKey } from "@/lib/overview-v2/intelligence-config";
import { fmtMoney, fmtVal, LENS_META } from "./HeroChart";

export type InspectTarget = {
  key: VitalKey | OverviewLens;
  label: string;
  formatted: string;
  value: number | null;
  unit: "money" | "pct" | "rate";
  lens: OverviewLens | null;
  delta: string | null;
  tone: "up" | "down" | "flat";
};

export default function NumberInspect({
  target,
  model,
  compare,
  compareLabel,
  onClose,
  onSeeTrend,
  onAsk,
  onOpenDrivers,
}: {
  target: InspectTarget;
  model: OverviewV2Model;
  compare: { delta: number | null; deltaPct: number | null; points: number | null };
  compareLabel: string;
  onClose: () => void;
  onSeeTrend: (lens: OverviewLens) => void;
  onAsk: (prompt: string) => void;
  onOpenDrivers: () => void;
}) {
  const cur = model.cur;
  const lens = target.lens;
  const meta = lens ? LENS_META[lens] : null;
  const topDrivers = model.drivers.netIncome
    .filter((d) => d.kind === "up" || d.kind === "down")
    .slice(0, 3);

  let compareText = "—";
  if (compare.points != null) {
    compareText = `${compare.points >= 0 ? "+" : ""}${compare.points.toFixed(1)} pts ${compareLabel}`;
  } else if (compare.deltaPct != null) {
    const amt =
      compare.delta != null && target.unit === "money"
        ? ` · ${compare.delta >= 0 ? "+" : ""}${fmtMoney(compare.delta)}`
        : "";
    compareText = `${compare.deltaPct >= 0 ? "+" : ""}${compare.deltaPct.toFixed(1)}%${amt} ${compareLabel}`;
  } else if (target.delta) {
    compareText = target.delta;
  }

  return (
    <aside className="ov2-drawer ov2-inspect" role="dialog" aria-label={`Inspect ${target.label}`}>
      <button type="button" className="ov2-drawer-close" aria-label="Close" onClick={onClose}>
        ×
      </button>

      <div className="ov2-eyebrow">What</div>
      <h3>{target.label}</h3>
      <div className="ov2-drawer-v tnum">{target.formatted}</div>
      <p className="ov2-fine">
        {model.client.name} · {cur.label}
        {meta ? ` · ${meta.label}` : ""}
      </p>

      <div className="ov2-inspect-block">
        <div className="ov2-eyebrow">Compare</div>
        <p className={`ov2-inspect-compare is-${target.tone}`}>{compareText}</p>
      </div>

      {topDrivers.length > 0 && (
        <div className="ov2-inspect-block">
          <div className="ov2-eyebrow">Drivers</div>
          <ul className="ov2-inspect-drivers">
            {topDrivers.map((d) => (
              <li key={d.label}>
                <span>{d.label}</span>
                <strong className="tnum">
                  {d.delta >= 0 ? "+" : "−"}
                  {fmtMoney(Math.abs(d.delta))}
                </strong>
              </li>
            ))}
          </ul>
          <button type="button" className="ov2-text-link" onClick={onOpenDrivers}>
            Trace depth →
          </button>
        </div>
      )}

      <div className="ov2-drawer-actions">
        {lens && (
          <button
            type="button"
            onClick={() => {
              onSeeTrend(lens);
              onClose();
            }}
          >
            See trend
          </button>
        )}
        <Link href={`/dash/financials?client=${model.client.id}&month=${cur.periodId}`}>
          Financials detail
        </Link>
        <button type="button" onClick={onOpenDrivers}>
          Trace depth
        </button>
        <button
          type="button"
          onClick={() => onAsk(`Explain ${target.label} in ${cur.label}`)}
        >
          Ask Hathorn
        </button>
      </div>
    </aside>
  );
}

/** Format a raw number for inspect when coming from a lens click. */
export function inspectFromLens(
  lens: OverviewLens,
  model: OverviewV2Model,
  label?: string,
): InspectTarget {
  const unit = LENS_META[lens].unit;
  const value = model.cur[lens];
  return {
    key: lens,
    label: label ?? LENS_META[lens].label,
    formatted: fmtVal(value, unit),
    value,
    unit,
    lens,
    delta: null,
    tone: "flat",
  };
}
