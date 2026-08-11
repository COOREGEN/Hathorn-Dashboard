/** Deterministic math for Financial Intelligence — never defer to the LLM. */

export function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function pctChange(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return r1(((current - prior) / Math.abs(prior)) * 100);
}

export function pointsDelta(current: number, prior: number): number {
  return r1(current - prior);
}

export function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdev(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values)!;
  const v = values.reduce((s, x) => s + (x - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(v);
}

/** Sample z-score. Returns null when history is too thin (< 6 observations). */
export function zScore(current: number, history: number[], minN = 6): number | null {
  if (history.length < minN) return null;
  const m = mean(history);
  const s = stdev(history);
  if (m == null || s == null || s === 0) return null;
  return r2((current - m) / s);
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function formatMoneyK(n: number): string {
  const s = n < 0 ? "−" : "";
  const v = Math.abs(n);
  return v >= 1000 ? `${s}$${(v / 1000).toFixed(2)}M` : `${s}$${v.toFixed(1)}K`;
}

export function formatPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}

export function marginPct(gp: number, revenue: number): number | null {
  if (!revenue) return null;
  return r1((gp / revenue) * 100);
}

/**
 * Allocate a pool across positive weights. Totals reconcile to the pool within 0.1
 * after distributing residual pennies to the largest weight.
 */
export function allocateByWeights(
  pool: number,
  items: { key: string; weight: number }[],
): { key: string; amount: number }[] {
  const positive = items.filter((i) => i.weight > 0);
  if (!positive.length || pool === 0) {
    return items.map((i) => ({ key: i.key, amount: 0 }));
  }
  const totalW = sum(positive.map((i) => i.weight));
  const out = positive.map((i) => ({
    key: i.key,
    amount: r1((pool * i.weight) / totalW),
  }));
  const allocated = sum(out.map((o) => o.amount));
  const residual = r1(pool - allocated);
  if (residual !== 0 && out.length) {
    let maxI = 0;
    for (let i = 1; i < out.length; i++) {
      if ((positive.find((p) => p.key === out[i].key)?.weight || 0)
        > (positive.find((p) => p.key === out[maxI].key)?.weight || 0)) maxI = i;
    }
    out[maxI].amount = r1(out[maxI].amount + residual);
  }
  const zeroKeys = items.filter((i) => i.weight <= 0).map((i) => ({ key: i.key, amount: 0 }));
  return [...out, ...zeroKeys];
}
