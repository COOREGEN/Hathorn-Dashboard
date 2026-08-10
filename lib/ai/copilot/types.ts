/**
 * Ask Hathorn — Copilot types.
 *
 * The AI is the interface. Tools and deterministic engines are the source of truth.
 */

export type CopilotIntent =
  | "FINANCIAL_ACTUALS"
  | "FP_AND_A"
  | "DOCUMENT"
  | "RECONCILIATION"
  | "CLOSE"
  | "EXCEPTION"
  | "INTEGRATION"
  | "TAX"
  | "ACCOUNTING_GUIDANCE"
  | "PORTFOLIO"
  | "MEETING_PREP"
  | "ATTENTION"
  | "INTELLIGENCE"
  | "GENERAL_CLIENT_CONTEXT"
  | "UNSUPPORTED";

export type SourceStatus =
  | "SUPPORTED_BY_SOURCE_DATA"
  | "PARTIALLY_SUPPORTED"
  | "INSUFFICIENT_DATA"
  | "SOURCE_VERIFICATION_REQUIRED"
  | "DRAFT_NOT_FINAL"
  | "UNAVAILABLE";

export type CopilotCitation = {
  sourceType:
    | "financial_period"
    | "financial_release"
    | "fpa_model_run"
    | "document"
    | "document_extraction"
    | "reconciliation"
    | "close_run"
    | "exception"
    | "integration"
    | "tax_issue"
    | "tax_authority"
    | "accounting_source"
    | "accounting_issue"
    | "portfolio"
    | "calculation"
    | "financial_signal"
    | "intelligence_run";
  sourceId?: string;
  title: string;
  clientId?: string;
  period?: string;
  page?: number;
  section?: string;
  url?: string;
  retrievedAt?: string;
};

export type ToolTrace = {
  tool: string;
  ok: boolean;
  ms: number;
  error?: string;
  /** Compact label for UI — never internal function noise. */
  label: string;
};

export type CopilotToolResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
  citations?: CopilotCitation[];
  warnings?: string[];
  sourceStatus?: SourceStatus;
};

export type CopilotContext = {
  userId: string;
  role: string;
  firmId: string;
  isPlatformAdmin: boolean;
  /** Bound client when opened inside a client workspace. */
  clientId: string | null;
  /** Preferred period id when known. */
  periodId: string | null;
  /** Year/month hint from UI. */
  year?: number | null;
  month?: number | null;
  audience: "STAFF" | "CLIENT";
};

export type CopilotAskInput = {
  question: string;
  conversationId?: string | null;
  clientId?: string | null;
  periodId?: string | null;
  year?: number | null;
  month?: number | null;
};

export type CopilotResponse = {
  ok: boolean;
  conversationId: string;
  messageId: string;
  answer: string;
  intent: CopilotIntent;
  sourceStatus: SourceStatus;
  citations: CopilotCitation[];
  warnings: string[];
  toolsUsed: ToolTrace[];
  keyNumbers?: { label: string; value: string; detail?: string }[];
  modelProvider: string | null;
  modelName: string | null;
  error?: string;
};

export const MAX_TOOL_CALLS = 10;
export const COPILOT_PRODUCT_NAME = "Ask Hathorn";
