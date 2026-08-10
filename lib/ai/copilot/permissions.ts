/**
 * Which tools each audience may invoke. Enforcement is at execution — not prompt.
 */

import type { CopilotContext } from "./types";

/** Staff tool names (read-only registry). */
export const STAFF_TOOLS = [
  "getFinancialSummary",
  "getMetricHistory",
  "getPublishedRelease",
  "getPlanningScenario",
  "searchDocuments",
  "getReconciliationStatus",
  "getCloseStatus",
  "getExceptions",
  "getIntegrationHealth",
  "getTaxIssue",
  "searchAccountingGuidance",
  "getClientPortfolioStatus",
  "getAttentionDigest",
  "getFinancialSignals",
  "getProfitabilityAnalysis",
  "getTrendAnalysis",
  "getCashIntelligence",
  "getDriverAnalysis",
  "getForecastAccuracy",
  "resolvePeriod",
] as const;

/** Reduced client registry — published / explicitly shared surface only. */
export const CLIENT_TOOLS = [
  "getPublishedRelease",
  "resolvePeriod",
  "getClientInsights",
  "getClientSharedForecast",
  "getClientReport",
  "getClientManagementQuestions",
] as const;

export type CopilotToolName = (typeof STAFF_TOOLS)[number] | (typeof CLIENT_TOOLS)[number];

export function toolsForAudience(audience: CopilotContext["audience"]): readonly string[] {
  return audience === "CLIENT" ? CLIENT_TOOLS : STAFF_TOOLS;
}

export function canUseTool(ctx: CopilotContext, tool: string): boolean {
  return toolsForAudience(ctx.audience).includes(tool);
}
