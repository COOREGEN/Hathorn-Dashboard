/**
 * Scenario explanation — AI drafts; advisor reviews.
 *
 * Deterministic signals first; Claude only explains supplied structure.
 */

import { config } from "../config";
import { fetchWithTimeout } from "../security";
import { PLANNING_LANGUAGE_RULES } from "./accounting-rules";
import { planningSignals } from "./variance-analysis";
import type { ModelRunRecord } from "../fpa/types";

export type ScenarioExplanation = {
  source: "claude" | "signals";
  text: string;
  warning?: string;
};

function fallbackText(run: ModelRunRecord): string {
  const signals = planningSignals(run.results, run.assumptions);
  const b = run.results.baseline;
  const last = run.results.forecast[run.results.forecast.length - 1];
  const lines = [
    "WHAT CHANGED",
    `Baseline (ACTUAL) ${b.label}: revenue $${b.revenue}K, gross profit $${b.grossProfit}K, ` +
      `opex $${b.opex}K, net income $${b.netIncome}K.`,
    last
      ? `Month-12 FORECAST: revenue $${last.revenue}K, gross profit $${last.grossProfit}K, ` +
        `net income $${last.netIncome}K under the ${run.scenario} scenario.`
      : "Forecast did not produce months — see validation checks.",
    "",
    "KEY DRIVER",
    `Based on the model assumption of ${run.assumptions.annualRevenueGrowthPct}% annual revenue growth ` +
      `and ${run.assumptions.grossMarginPct}% gross margin.`,
    "",
    "RISK",
    signals.find((s) => s.severity !== "info")?.detail
      || "No threshold risk flagged from the supplied figures.",
    "",
    "MANAGEMENT QUESTION",
    "Which assumption — growth or margin — is least certain for the next two quarters?",
    "",
    "POTENTIAL ACTION",
    "Confirm the growth rate against the sales pipeline before treating this forecast as a plan.",
  ];
  return lines.join("\n");
}

export async function explainScenarioRun(run: ModelRunRecord): Promise<ScenarioExplanation> {
  const signals = planningSignals(run.results, run.assumptions);
  if (!config.anthropic.enabled) {
    return {
      source: "signals",
      text: fallbackText(run),
      warning: "Drafted from deterministic signals. Set ANTHROPIC_API_KEY for fuller narrative.",
    };
  }

  const payload = {
    scenario: run.scenario,
    engine: run.engine,
    engineVersion: run.engineVersion,
    assumptions: run.assumptions,
    baseline: run.results.baseline,
    forecastLast: run.results.forecast[run.results.forecast.length - 1] ?? null,
    totals: run.results.totals,
    checks: run.checks,
    signals,
  };

  const prompt = `${PLANNING_LANGUAGE_RULES}

Structured model run (JSON):
${JSON.stringify(payload, null, 2)}

Write an advisor draft with exactly these section headings:
WHAT CHANGED
KEY DRIVER
RISK
MANAGEMENT QUESTION
POTENTIAL ACTION

Plain text only. No markdown fences.`;

  try {
    const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.anthropic.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.anthropic.model,
        max_tokens: 1600,
        messages: [{ role: "user", content: prompt }],
      }),
    }, 45_000);
    if (!res.ok) throw new Error(`Anthropic API returned ${res.status}`);
    const data = await res.json();
    const text = (data.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
    if (!text) throw new Error("Empty model response");
    return { source: "claude", text };
  } catch (e: any) {
    return {
      source: "signals",
      text: fallbackText(run),
      warning: `AI unavailable (${e?.message || "error"}); fell back to deterministic draft.`,
    };
  }
}
