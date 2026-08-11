/**
 * Automated close types — checklist, readiness, exceptions.
 * Automate the checklist. Do not automate professional judgment.
 */

export type CloseRunStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "READY_FOR_REVIEW"
  | "READY_TO_PUBLISH"
  | "CLOSED"
  | "REOPENED";

export type ChecklistItemStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "PASS"
  | "FAIL"
  | "NEEDS_REVIEW"
  | "NOT_APPLICABLE"
  | "WAIVED"
  | "STALE";

export type CloseCategory =
  | "DATA"
  | "DOCUMENTS"
  | "RECONCILIATIONS"
  | "FINANCIAL_CHECKS"
  | "VARIANCE_REVIEW"
  | "ACCOUNTING_REVIEW"
  | "ADVISOR_REVIEW"
  | "PUBLISHING_READINESS";

export type CheckKind = "AUTOMATED" | "MANUAL";

export type CheckKey =
  | "integration_sources_current"
  | "gate_pass"
  | "figures_present"
  | "doc_payroll_approved"
  | "doc_ar_approved"
  | "doc_debt_approved"
  | "recon_payroll"
  | "recon_ar"
  | "recon_debt"
  | "recon_no_critical_open"
  | "balance_sheet_balances"
  | "cash_present"
  | "variance_revenue_mom"
  | "variance_payroll_mom"
  | "variance_opex_mom"
  | "manual_unusual_entries"
  | "manual_related_party"
  | "commentary_present"
  | "publish_evaluate_clear";

export type VarianceRule = {
  metric: "revenue" | "payroll" | "opex" | "netIncome" | "cash" | "arTotal";
  pctThreshold: number;
  absThresholdK: number;
  provenance: "FIRM_DEFAULT" | "CLIENT_POLICY";
};

export type ClosePolicy = {
  id: string;
  clientId: string | null;
  name: string;
  requiredDocuments: string[];
  requiredReconciliations: string[];
  checkKeys: CheckKey[];
  varianceRules: VarianceRule[];
  blockingRules: Record<string, boolean>;
  reviewRequirements: { advisorCommentary: boolean; cpaReviewer: boolean };
};

export type CheckDefinition = {
  key: CheckKey;
  label: string;
  category: CloseCategory;
  description: string;
  kind: CheckKind;
  blockingDefault: boolean;
  /** Dependency tags — if a tag's fingerprint changes, this review goes STALE. */
  dependencyTags: string[];
};

export type CheckEvalResult = {
  status: ChecklistItemStatus;
  blocking: boolean;
  evidence: Record<string, unknown>;
  inputHash: string;
  detail?: string;
  exception?: {
    type: string;
    severity: "INFO" | "WARNING" | "CRITICAL";
    title: string;
    description: string;
  } | null;
};

export type CloseChecklistItem = {
  id: string;
  closeRunId: string;
  checkKey: CheckKey;
  category: CloseCategory;
  title: string;
  kind: CheckKind;
  required: boolean;
  blocking: boolean;
  status: ChecklistItemStatus;
  assignedTo: string | null;
  dueAt: string | null;
  completedBy: string | null;
  completedAt: string | null;
  waivedBy: string | null;
  waivedAt: string | null;
  waiveReason: string | null;
  note: string | null;
  evidence: Record<string, unknown>;
  inputHash: string | null;
  reviewedHash: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  lastEvaluatedAt: string | null;
  exceptionId: string | null;
};

export type CloseRun = {
  id: string;
  clientId: string;
  periodId: string;
  status: CloseRunStatus;
  startedBy: string | null;
  startedAt: string | null;
  targetCloseDate: string | null;
  completedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  releaseId: string | null;
  lastEvaluatedAt: string | null;
  summary: CloseSummary;
  reopenReason: string | null;
  reopenedBy: string | null;
  reopenedAt: string | null;
  overdue: boolean;
};

export type CloseSummary = {
  requiredTotal: number;
  requiredComplete: number;
  progressPct: number;
  byCategory: Record<string, { total: number; complete: number }>;
  openExceptions: number;
  blockingExceptions: number;
  blockers: { checkKey: string; title: string; detail: string }[];
  whyNotClosed: string[];
};

export type CloseReadiness = {
  status: CloseRunStatus;
  canMarkReadyForReview: boolean;
  canFeedPublish: boolean;
  blockers: { checkKey: string; title: string; detail: string }[];
  whyNotClosed: string[];
};
