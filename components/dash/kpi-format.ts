import type { KpiUnit } from "@/lib/kpi-registry";

/**
 * Renders a metric value.
 *
 * The unit decides the scale. Getting this wrong is not cosmetic: a $27.60 hourly rate
 * shown as $27.6K is off by a factor of a thousand and an owner will act on it.
 */
export function formatKpi(value: number | null, unit: KpiUnit, decimals = 1): string {
  if (value === null) return "—";
  switch (unit) {
    case "money": {
      const s = value < 0 ? "−" : "", v = Math.abs(value);
      return v >= 1000 ? `${s}$${(v / 1000).toFixed(2)}M` : `${s}$${v.toFixed(decimals)}K`;
    }
    case "money_exact": {
      const s = value < 0 ? "−" : "", v = Math.abs(value);
      return `${s}$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    case "percent": return `${value.toFixed(decimals)}%`;
    case "ratio": return value.toFixed(Math.max(decimals, 2));
    case "days": return `${Math.round(value)} days`;
    case "count": return value.toLocaleString();
    default: return value.toFixed(decimals);
  }
}

/** Target band, for display beside the value. */
export function formatTarget(
  t: { lo: number | null; hi: number | null; point: number | null; source: string },
  unit: KpiUnit, decimals = 1,
): string {
  if (t.source === "NONE") return "No target agreed";
  const f = (n: number) => formatKpi(n, unit, decimals);
  if (t.lo != null && t.hi != null) return `${f(t.lo)} – ${f(t.hi)}`;
  if (t.point != null) return f(t.point);
  return "No target agreed";
}

export const SOURCE_LABEL: Record<string, string> = {
  AGREED: "Agreed with the client",
  DERIVED: "Derived from this client's own history",
  BENCHMARK: "External benchmark",
  NONE: "Reported, not judged",
};
