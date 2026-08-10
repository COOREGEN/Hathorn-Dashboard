/**
 * Deterministic arithmetic for Copilot — never defer material math to the LLM.
 */

export function pctChange(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return Math.round(((current - prior) / Math.abs(prior)) * 1000) / 10;
}

export function pointsDelta(current: number, prior: number): number {
  return Math.round((current - prior) * 10) / 10;
}

export function marginPct(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function formatK(n: number): string {
  const s = n < 0 ? "−" : "";
  const v = Math.abs(n);
  return v >= 1000 ? `${s}$${(v / 1000).toFixed(2)}M` : `${s}$${v.toFixed(1)}K`;
}

export function formatPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}

export function varianceBlock(opts: {
  label: string;
  current: number;
  prior: number;
  unit?: "currency" | "pct" | "points";
}): { label: string; current: string; prior: string; delta: string; points?: number; pct?: number | null } {
  const unit = opts.unit || "currency";
  if (unit === "pct" || unit === "points") {
    const pts = pointsDelta(opts.current, opts.prior);
    return {
      label: opts.label,
      current: formatPct(opts.current),
      prior: formatPct(opts.prior),
      delta: `${pts >= 0 ? "+" : ""}${pts.toFixed(1)} points`,
      points: pts,
    };
  }
  const pct = pctChange(opts.current, opts.prior);
  const abs = Math.round((opts.current - opts.prior) * 10) / 10;
  return {
    label: opts.label,
    current: formatK(opts.current),
    prior: formatK(opts.prior),
    delta: `${abs >= 0 ? "+" : ""}${formatK(abs).replace(/^\$/, "$")}` +
      (pct == null ? "" : ` (${pct >= 0 ? "+" : ""}${pct}%)`),
    pct,
  };
}
