/**
 * Advisor draft from deterministic intelligence — AI explains, never invents drivers.
 */

import { config } from "../config";
import { fetchWithTimeout } from "../security";
import { sanitizeForPrompt } from "../ai/copilot/citations";
import type { IntelligenceOverview } from "./types";

export type IntelligenceSummary = {
  source: "claude" | "deterministic";
  text: string;
  warning?: string;
};

function deterministicDraft(o: IntelligenceOverview): string {
  const rev = o.kpis.find((k) => k.key === "revenue");
  const gm = o.kpis.find((k) => k.key === "grossMarginPct");
  const cash = o.kpis.find((k) => k.key === "cash");
  const lines = [
    "PERFORMANCE",
    `${o.periodLabel} (${o.sourceKind.replace(/_/g, " ")}).`,
    rev
      ? `Revenue ${rev.formatted}` +
        (rev.trend?.percentageChange != null
          ? ` (${rev.trend.percentageChange >= 0 ? "+" : ""}${rev.trend.percentageChange}% MoM).`
          : ".")
      : "",
    gm
      ? `Gross margin ${gm.formatted}` +
        (gm.trend?.pointsChange != null
          ? ` (${gm.trend.pointsChange >= 0 ? "+" : ""}${gm.trend.pointsChange} pts MoM).`
          : ".")
      : "",
    cash ? `Cash ${cash.formatted}.` : "",
    "",
    "PROFITABILITY",
    o.profitability.availability === "WORKING"
      ? `Entity direct margins available (${o.profitability.sourceQuality.replace(/_/g, " ")}). ` +
        `Customer/project/location profitability is unavailable — those dimensions are not in the ledger.`
      : o.profitability.reason || "Profitability limited.",
    o.profitability.rows[0]
      ? `Highest-revenue entity: ${o.profitability.rows[0].name} at ${o.profitability.rows[0].grossMarginPct ?? "—"}% direct margin.`
      : "",
    "",
    "CASH",
    o.cash.runwayApplicable
      ? `Runway ≈ ${o.cash.runwayMonths} months on ${o.cash.burnBasis} burn basis.`
      : o.cash.runwayReason,
    "",
    "KEY SIGNALS",
    ...(o.signals.length
      ? o.signals.slice(0, 6).map((s, i) => `${i + 1}. ${s.title} [${s.method}]`)
      : ["No material signals under current thresholds."]),
    "",
    "KNOWN DRIVERS",
    ...o.drivers.flatMap((d) =>
      d.slices.slice(0, 4).map((s) =>
        `${d.label}: ${s.label} ${s.delta >= 0 ? "+" : ""}${s.delta}K`)),
    "",
    "MANAGEMENT QUESTIONS",
    "• What changed in pricing or mix that could explain margin movement?",
    "• Were labor or subcontractor costs temporary or structural?",
    "• Does the AR aging movement match known collection delays?",
    "",
    "OUTLOOK",
    o.forecast.comparison
      ? `Management forecast growth ${o.forecast.comparison.managementGrowthPct}% vs historical trend ${o.forecast.comparison.trendGrowthPct}% ` +
        `(Δ ${o.forecast.comparison.differencePoints} pts). Review assumptions — not a verdict.`
      : o.forecast.reason || "Forecast comparison limited.",
    "",
    "Evidence status: all figures above come from Hathorn deterministic engines. Possible causes are not established facts.",
  ];
  return lines.filter(Boolean).join("\n");
}

export async function explainIntelligence(
  overview: IntelligenceOverview,
): Promise<IntelligenceSummary> {
  const fallback = deterministicDraft(overview);
  if (!config.anthropic.enabled) {
    return {
      source: "deterministic",
      text: fallback,
      warning: "Drafted without a model key. Set ANTHROPIC_API_KEY for narrative polish.",
    };
  }

  const payload = {
    period: overview.periodLabel,
    sourceKind: overview.sourceKind,
    kpis: overview.kpis.map((k) => ({
      key: k.key, value: k.value, formatted: k.formatted,
      mom: k.trend ? {
        difference: k.trend.difference,
        percentageChange: k.trend.percentageChange,
        pointsChange: k.trend.pointsChange,
      } : null,
    })),
    signals: overview.signals.map((s) => ({
      title: s.title, method: s.method, detail: s.detail, severity: s.severity,
    })),
    drivers: overview.drivers,
    cash: overview.cash,
    profitability: {
      sourceQuality: overview.profitability.sourceQuality,
      topEntities: overview.profitability.rows.slice(0, 5),
      unavailable: ["Customer", "Project", "Job", "Location"],
    },
    forecast: overview.forecast,
    readinessNotes: overview.readiness.notes,
  };

  const system = `You are drafting an advisor Financial Intelligence brief for Hathorn Dashboard.
Use ONLY the structured JSON. Never invent numbers, customers, projects, or causes.
Separate KNOWN drivers (in the JSON) from POSSIBLE drivers (speculation).
If the cause is not in the data, say the data confirms the movement but does not establish the cause.
Sections: PERFORMANCE, PROFITABILITY, CASH, KEY SIGNALS, KNOWN DRIVERS, POSSIBLE DRIVERS, MANAGEMENT QUESTIONS, OUTLOOK.
Plain text. Conservative tone.`;

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
        temperature: 0.2,
        system,
        messages: [{
          role: "user",
          content: `INTELLIGENCE_JSON:\n${sanitizeForPrompt(JSON.stringify(payload), 12000)}`,
        }],
      }),
    }, 45_000);
    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const data = await res.json();
    const text = (data.content || [])
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n")
      .trim();
    if (!text) throw new Error("Empty model response");
    return { source: "claude", text };
  } catch (e: any) {
    return {
      source: "deterministic",
      text: fallback,
      warning: `Analysis narrative unavailable (${e?.message || "error"}). Deterministic figures remain below.`,
    };
  }
}
