/** Client Experience — presentation types. Visibility is always explicit. */

export const PORTAL_ENGINE_VERSION = "1.0.0";

export type InsightStatus = "DRAFT" | "APPROVED" | "PUBLISHED" | "ARCHIVED";
export type QuestionStatus = "DRAFT" | "PUBLISHED" | "ANSWERED" | "CLOSED";
export type ReportStatus = "DRAFT" | "APPROVED" | "PUBLISHED" | "RETRACTED";
export type ScenarioVisibility = "INTERNAL" | "CLIENT_SHARED" | "ARCHIVED";
export type DocumentVisibility = "INTERNAL" | "CLIENT_VISIBLE";
export type DocRequestStatus = "OPEN" | "UPLOADED" | "REVIEWED" | "CLOSED" | "NOT_APPLICABLE";

export type PortalModules = {
  showPlanning: boolean;
  showDocuments: boolean;
  showInsights: boolean;
  showCopilot: boolean;
  showFinancialStatements: boolean;
  showReports: boolean;
  /** Client may answer management questions (opt-in; Tier-1 default off). */
  allowClientAnswers: boolean;
  /** Client may upload against document requests (opt-in; Tier-1 default off). */
  allowClientUploads: boolean;
};

/**
 * Tier-1 defaults: curated statement + month/entity, optional published modules
 * for reading. Answers, uploads, and Ask stay off until an advisor enables them.
 */
export const DEFAULT_PORTAL_MODULES: PortalModules = {
  showPlanning: false,
  showDocuments: true,
  showInsights: true,
  showCopilot: false,
  showFinancialStatements: true,
  showReports: true,
  allowClientAnswers: false,
  allowClientUploads: false,
};

export const DEFAULT_PORTAL_METRICS: {
  metricKey: string; label: string; displayOrder: number; comparisonMode: string;
}[] = [
  { metricKey: "revenue", label: "Revenue", displayOrder: 1, comparisonMode: "YoY" },
  { metricKey: "grossMarginPct", label: "Gross Margin", displayOrder: 2, comparisonMode: "MoM" },
  { metricKey: "netIncome", label: "Net Income", displayOrder: 3, comparisonMode: "MoM" },
  { metricKey: "cash", label: "Cash", displayOrder: 4, comparisonMode: "MoM" },
  { metricKey: "arTotal", label: "Receivables", displayOrder: 5, comparisonMode: "MoM" },
  { metricKey: "laborPct", label: "Labor Ratio", displayOrder: 6, comparisonMode: "MoM" },
];

export type BrandingSnapshot = {
  firmName: string;
  clientName: string;
  clientPortalName: string;
  reportFooter: string;
  brandPrimary: string;
  brandAccent: string;
  logoText: string | null;
  showPlatformMark: boolean;
  capturedAt: string;
};

export type MonthlyReviewContent = {
  templateId: string;
  periodLabel: string;
  releaseId: string | null;
  releaseVersion: number | null;
  kpis: { key: string; label: string; value: number; formatted: string; delta: string | null }[];
  whatChanged: string;
  financialPerformance: { label: string; value: number; formatted: string }[];
  cash: { current: number; change: number | null; note: string };
  outlook: string;
  managementQuestions: string[];
  advisorCommentary: { heading: string; body: string }[];
  disclaimer: string;
  engineVersion: string;
};
