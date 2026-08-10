/**
 * Lightweight intent router. Keywords first; permissions stay deterministic at tools.
 */

import type { CopilotIntent } from "./types";

const RULES: { intent: CopilotIntent; patterns: RegExp[] }[] = [
  {
    intent: "INTELLIGENCE",
    patterns: [
      /\bwhat'?s happening\b/i,
      /\bwhere (are we|do we) (making|losing) money\b/i,
      /\bwhat changed this month\b/i,
      /\bwhat should management investigate\b/i,
      /\bprofitability\b/i,
      /\banomal(?:y|ies)\b/i,
      /\bfinancial signals?\b/i,
      /\bwhy did (gross )?margin\b/i,
      /\bdriver analysis\b/i,
      /\bcash (runway|burn|intelligence)\b/i,
      /\btrend projection\b/i,
    ],
  },
  {
    intent: "ATTENTION",
    patterns: [
      /\bwhat needs (my |our )?attention\b/i,
      /\bpriority\b/i,
      /\burgent\b/i,
      /\btoday'?s (queue|work)\b/i,
    ],
  },
  {
    intent: "MEETING_PREP",
    patterns: [
      /\bprepare (me )?for (my |the )?meeting\b/i,
      /\bmeeting prep\b/i,
      /\bbrief(ing)? (for|on)\b/i,
    ],
  },
  {
    intent: "CLOSE",
    patterns: [
      /\bclose\b/i,
      /\bblocked\b/i,
      /\bwhy isn'?t .+ closed\b/i,
      /\breadiness\b/i,
      /\breview ready\b/i,
    ],
  },
  {
    intent: "EXCEPTION",
    patterns: [
      /\bexception\b/i,
      /\bassigned (items?|exceptions?)\b/i,
      /\bunresolved\b/i,
      /\bwaive\b/i,
    ],
  },
  {
    intent: "RECONCILIATION",
    patterns: [
      /\breconcile\b/i,
      /\breconciliation\b/i,
      /\bdoes ar tie\b/i,
      /\bar (off|difference|diff)\b/i,
      /\bpayroll (difference|diff|tie)\b/i,
    ],
  },
  {
    intent: "INTEGRATION",
    patterns: [
      /\bintegration\b/i,
      /\bquickbooks\b/i,
      /\bqbo\b/i,
      /\bsync(ed|hron)\b/i,
      /\bstale\b/i,
      /\breconnect\b/i,
      /\bfreshness\b/i,
    ],
  },
  {
    intent: "TAX",
    patterns: [
      /\btax\b/i,
      /\birc\b/i,
      /\birs\b/i,
      /\b§\s*179\b/i,
      /\bsection 179\b/i,
      /\bauthority supports\b/i,
    ],
  },
  {
    intent: "ACCOUNTING_GUIDANCE",
    patterns: [
      /\bgap\b/i,
      /\basc\b/i,
      /\bfasb\b/i,
      /\baccounting guidance\b/i,
      /\btechnical (memo|accounting)\b/i,
      /\btreatment\b/i,
    ],
  },
  {
    intent: "DOCUMENT",
    patterns: [
      /\bdocument\b/i,
      /\blease\b/i,
      /\bdebt schedule\b/i,
      /\buploaded\b/i,
      /\bpage \d+\b/i,
      /\bextraction\b/i,
    ],
  },
  {
    intent: "FP_AND_A",
    patterns: [
      /\bforecast\b/i,
      /\bscenario\b/i,
      /\bplanning\b/i,
      /\bfp&?a\b/i,
      /\bwhat happens if\b/i,
      /\bgrowth (drops?|rate)\b/i,
    ],
  },
  {
    intent: "PORTFOLIO",
    patterns: [
      /\bwhich clients\b/i,
      /\bportfolio\b/i,
      /\bacross (the )?(book|firm)\b/i,
      /\brevenue drop\b/i,
    ],
  },
  {
    intent: "FINANCIAL_ACTUALS",
    patterns: [
      /\brevenue\b/i,
      /\bgross margin\b/i,
      /\bpayroll\b/i,
      /\bnet income\b/i,
      /\bcash\b/i,
      /\bwhat (was|were|is|are) .*(published|reported)\b/i,
      /\bworking (books|data|figures)\b/i,
      /\blast (six|12|twelve) months\b/i,
      /\bwhy did\b/i,
      /\bwhat changed\b/i,
    ],
  },
];

/** Detect prompt-injection style requests that try to bypass tools. */
export function detectHostilePrompt(question: string): {
  refuseEstimate: boolean;
  refuseInventCitation: boolean;
  refuseCrossFirm: boolean;
} {
  const q = question.toLowerCase();
  return {
    refuseEstimate: /ignore (the )?tools|just estimate|guess (the |july )?revenue|make up|from (your )?memory|without (using )?tools/.test(q),
    refuseInventCitation: /invent (an )?asc|fabricate|make up.*(irc|asc|citation)|fake citation/.test(q),
    refuseCrossFirm: /firm b|another firm|other firm|cross[- ]firm|all firms/.test(q),
  };
}

export function routeIntent(question: string): CopilotIntent {
  const q = question.trim();
  if (!q) return "UNSUPPORTED";
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(q))) return rule.intent;
  }
  if (/\b(how|why|what|show|compare|prepare)\b/i.test(q)) return "GENERAL_CLIENT_CONTEXT";
  return "UNSUPPORTED";
}

/** Ordered tool plan for an intent — executed under the call budget. */
export function toolPlanForIntent(
  intent: CopilotIntent,
  opts: { hasClient: boolean; audience: "STAFF" | "CLIENT"; wantsPublished?: boolean },
): string[] {
  if (opts.audience === "CLIENT") {
    switch (intent) {
      case "FINANCIAL_ACTUALS":
      case "GENERAL_CLIENT_CONTEXT":
      case "MEETING_PREP":
        return ["resolvePeriod", "getPublishedRelease"];
      default:
        return ["getPublishedRelease"];
    }
  }

  const client = opts.hasClient;
  switch (intent) {
    case "INTELLIGENCE":
      return client
        ? [
            "resolvePeriod",
            "getFinancialSignals",
            "getProfitabilityAnalysis",
            "getDriverAnalysis",
            "getTrendAnalysis",
            "getCashIntelligence",
            "getForecastAccuracy",
          ]
        : ["getAttentionDigest", "getFinancialSignals"];
    case "ATTENTION":
      return ["getAttentionDigest"];
    case "PORTFOLIO":
      return ["getClientPortfolioStatus", "getAttentionDigest"];
    case "CLOSE":
      return client
        ? ["resolvePeriod", "getCloseStatus", "getExceptions", "getReconciliationStatus", "getIntegrationHealth"]
        : ["getCloseStatus", "getExceptions", "getAttentionDigest"];
    case "EXCEPTION":
      return ["getExceptions"];
    case "RECONCILIATION":
      return client
        ? ["resolvePeriod", "getReconciliationStatus"]
        : ["getExceptions", "getCloseStatus"];
    case "INTEGRATION":
      return client ? ["getIntegrationHealth"] : ["getAttentionDigest", "getClientPortfolioStatus"];
    case "TAX":
      return client ? ["getTaxIssue"] : ["getTaxIssue"];
    case "ACCOUNTING_GUIDANCE":
      return ["searchAccountingGuidance"];
    case "DOCUMENT":
      return client ? ["searchDocuments"] : ["searchDocuments"];
    case "FP_AND_A":
      return client ? ["getPlanningScenario"] : ["getPlanningScenario"];
    case "MEETING_PREP":
      return client
        ? [
            "resolvePeriod",
            "getFinancialSummary",
            "getPublishedRelease",
            "getCloseStatus",
            "getExceptions",
            "getPlanningScenario",
            "getIntegrationHealth",
          ]
        : ["getAttentionDigest"];
    case "FINANCIAL_ACTUALS":
      if (opts.wantsPublished) {
        return client
          ? ["resolvePeriod", "getPublishedRelease", "getMetricHistory"]
          : ["getClientPortfolioStatus"];
      }
      return client
        ? ["resolvePeriod", "getFinancialSummary", "getMetricHistory", "getDriverAnalysis", "getFinancialSignals", "getPublishedRelease"]
        : ["getClientPortfolioStatus", "getAttentionDigest"];
    case "GENERAL_CLIENT_CONTEXT":
      return client
        ? ["resolvePeriod", "getFinancialSummary", "getFinancialSignals", "getCloseStatus", "getExceptions"]
        : ["getAttentionDigest"];
    default:
      return client ? ["getFinancialSummary"] : ["getAttentionDigest"];
  }
}

export function wantsPublishedData(question: string): boolean {
  return /\bpublished\b|\breported to the client\b|\bwhat did we (tell|send|report)\b|\brelease\b/i.test(question);
}

export function wantsWorkingData(question: string): boolean {
  return /\bworking (books|data|figures)\b|\blatest books\b|\bcurrent (books|figures|ledger)\b/i.test(question);
}
