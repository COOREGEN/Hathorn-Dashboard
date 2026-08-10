/**
 * What "better" means, per metric.
 *
 * Treating every metric as higher-is-better or lower-is-better is the most common way a
 * comparison table misleads. Labor ratio is the example that matters here: the platform
 * scored it lower-is-better, so a home-care agency dropping from 78% to 55% read as a
 * large improvement. It is not an improvement — at 55% the agency is either not
 * delivering the hours it billed, or costs are landing in the wrong account. Both
 * extremes are unhealthy, which is a *range*, not a direction.
 *
 * Four directions cover everything on the statement:
 *
 *   higher_is_better  revenue, gross profit, cash
 *   lower_is_better   overtime premium, aged receivables
 *   target            a single number to hit, with tolerance
 *   target_range      a band where both sides are wrong — labor ratio, current ratio
 */

export type Direction = "higher_is_better" | "lower_is_better" | "target" | "target_range";

export type MetricRule = {
  key: string;
  label: string;
  direction: Direction;
  unit: "money" | "percent" | "count" | "ratio";
  /** Movement below this is noise and is reported as flat. */
  materiality: { absolute?: number; relative?: number };
  /** For `target` and `target_range`. */
  target?: number;
  tolerance?: number;
  range?: { low: number; high: number };
  /** Outside this, the value is not merely off-target but implausible. */
  softBounds?: { low: number; high: number };
  guidance?: string;
};

/**
 * `laborTarget` comes from the client record, so a dental practice and a home-care
 * agency get different bands without forking anything.
 */
export function metricRules(
  laborTarget: { lo: number; hi: number },
  language?: { revenueLabel: string; directCostLabel: string; laborRatioLabel: string; laborGuidance: string },
): Record<string, MetricRule> {
  const L = language ?? {
    revenueLabel: "Revenue", directCostLabel: "Direct labor", laborRatioLabel: "Labor ratio",
    laborGuidance: "Above the band, margin is going to labor. Below it, check that billed hours were actually delivered and that costs are posting to the right account.",
  };
  return {
    revenue: {
      key: "revenue", label: L.revenueLabel, direction: "higher_is_better", unit: "money",
      materiality: { absolute: 2, relative: 2 },
    },
    directCost: {
      key: "directCost", label: L.directCostLabel, direction: "lower_is_better", unit: "money",
      materiality: { absolute: 2, relative: 2 },
    },
    grossProfit: {
      key: "grossProfit", label: "Gross profit", direction: "higher_is_better", unit: "money",
      materiality: { absolute: 1, relative: 3 },
    },
    grossMarginPct: {
      key: "grossMarginPct", label: "Gross margin", direction: "higher_is_better", unit: "percent",
      materiality: { absolute: 0.5 },
    },
    opex: {
      key: "opex", label: "Overhead", direction: "lower_is_better", unit: "money",
      materiality: { absolute: 1, relative: 5 },
    },
    netIncome: {
      key: "netIncome", label: "Net income", direction: "higher_is_better", unit: "money",
      materiality: { absolute: 1, relative: 5 },
    },
    netMarginPct: {
      key: "netMarginPct", label: "Net margin", direction: "higher_is_better", unit: "percent",
      materiality: { absolute: 0.5 },
    },

    // The correction. A labor ratio has a floor as well as a ceiling: above the band
    // margin is being given away, below it the hours almost certainly were not
    // delivered as billed.
    laborPct: {
      key: "laborPct", label: L.laborRatioLabel, direction: "target_range", unit: "percent",
      materiality: { absolute: 0.5 },
      range: { low: laborTarget.lo, high: laborTarget.hi },
      softBounds: { low: laborTarget.lo - 15, high: laborTarget.hi + 15 },
      guidance: L.laborGuidance,
    },

    otPremium: {
      key: "otPremium", label: "Overtime premium", direction: "lower_is_better", unit: "money",
      materiality: { absolute: 0.5, relative: 10 },
    },
    hours: {
      key: "hours", label: "Hours delivered", direction: "higher_is_better", unit: "count",
      materiality: { relative: 2 },
    },
    cash: {
      key: "cash", label: "Cash on hand", direction: "higher_is_better", unit: "money",
      materiality: { absolute: 5, relative: 5 },
    },
    arTotal: {
      key: "arTotal", label: "Receivables", direction: "lower_is_better", unit: "money",
      materiality: { absolute: 5, relative: 5 },
      guidance: "Falling receivables are good when collections improved and bad when revenue fell. Read alongside revenue.",
    },

    // Both extremes are wrong here too: under 1.5 is a liquidity risk, far above it is
    // idle capital.
    currentRatio: {
      key: "currentRatio", label: "Current ratio", direction: "target_range", unit: "ratio",
      materiality: { absolute: 0.05 },
      range: { low: 1.5, high: 3.0 },
      softBounds: { low: 0.8, high: 5.0 },
      guidance: "Below 1.5 is a liquidity risk. Far above 3.0 usually means cash that could be deployed.",
    },
  };
}

/* ------------------------------------------------------------------ */

export type Assessment = {
  /** null when the movement is below materiality — reported as flat, not as good or bad. */
  favourable: boolean | null;
  material: boolean;
  /** Set for range metrics: which side of the band, or inside it. */
  bandPosition?: "below" | "inside" | "above";
  note?: string;
};

/** Is a movement large enough to talk about? */
export function isMaterial(rule: MetricRule, current: number, basis: number): boolean {
  const abs = Math.abs(current - basis);
  const rel = basis === 0 ? Infinity : (abs / Math.abs(basis)) * 100;

  // Both thresholds must be cleared when both are configured: a large percentage of a
  // trivial number is still trivial, and a large absolute move in a huge number is not
  // necessarily notable.
  const absOk = rule.materiality.absolute === undefined || abs >= rule.materiality.absolute;
  const relOk = rule.materiality.relative === undefined || rel >= rule.materiality.relative;
  if (rule.materiality.absolute !== undefined && rule.materiality.relative !== undefined) {
    return absOk && relOk;
  }
  return absOk && relOk;
}

/**
 * Judges a movement against the metric's own definition of better.
 *
 * For a range metric the question is not "did it go up" but "did it move toward the
 * band". Falling from 80% to 74% against a 65–72% band is an improvement; falling from
 * 68% to 55% through the floor is not.
 */
export function assess(rule: MetricRule, current: number, basis: number): Assessment {
  const material = isMaterial(rule, current, basis);
  if (!material) return { favourable: null, material: false };

  if (rule.direction === "higher_is_better") {
    return { favourable: current > basis, material: true };
  }
  if (rule.direction === "lower_is_better") {
    return { favourable: current < basis, material: true, note: rule.guidance };
  }
  if (rule.direction === "target" && rule.target !== undefined) {
    return {
      favourable: Math.abs(current - rule.target) < Math.abs(basis - rule.target),
      material: true,
    };
  }

  // target_range
  const range = rule.range;
  if (!range) return { favourable: null, material: true };

  const position = (v: number): "below" | "inside" | "above" =>
    v < range.low ? "below" : v > range.high ? "above" : "inside";
  const distance = (v: number) =>
    v < range.low ? range.low - v : v > range.high ? v - range.high : 0;

  const nowPos = position(current);
  const wasPos = position(basis);
  const nowDist = distance(current);
  const wasDist = distance(basis);

  if (nowPos === "inside" && wasPos !== "inside") {
    return { favourable: true, material: true, bandPosition: nowPos,
             note: `Now inside the ${range.low}–${range.high}% target band.` };
  }
  if (nowPos !== "inside" && wasPos === "inside") {
    return { favourable: false, material: true, bandPosition: nowPos,
             note: `Left the ${range.low}–${range.high}% band, now ${nowPos} it. ${rule.guidance ?? ""}`.trim() };
  }
  if (nowPos === "inside" && wasPos === "inside") {
    return { favourable: null, material: true, bandPosition: "inside",
             note: "Both periods sit inside the target band." };
  }
  // Both outside: better means closer to the band, and crossing from one side to the
  // other is never an improvement even when the distance shrinks.
  if (nowPos !== wasPos) {
    return { favourable: false, material: true, bandPosition: nowPos,
             note: `Moved from ${wasPos} the band to ${nowPos} it. ${rule.guidance ?? ""}`.trim() };
  }
  return {
    favourable: nowDist < wasDist,
    material: true,
    bandPosition: nowPos,
    note: nowDist < wasDist
      ? `Moving toward the ${range.low}–${range.high}% band but still ${nowPos} it.`
      : `Moving further ${nowPos} the ${range.low}–${range.high}% band. ${rule.guidance ?? ""}`.trim(),
  };
}

/** Where a single value sits relative to its band, for display without a comparison. */
export function bandStatus(rule: MetricRule, value: number): {
  position: "below" | "inside" | "above" | "n/a"; label: string; healthy: boolean;
} {
  if (rule.direction !== "target_range" || !rule.range) {
    return { position: "n/a", label: "", healthy: true };
  }
  const { low, high } = rule.range;
  if (value < low) return { position: "below", label: `Below the ${low}–${high}% band`, healthy: false };
  if (value > high) return { position: "above", label: `Above the ${low}–${high}% band`, healthy: false };
  return { position: "inside", label: `Inside the ${low}–${high}% band`, healthy: true };
}
