/**
 * Reconciliation + sub-ledger intelligence types.
 *
 * Deterministic tie-out owns the numbers. AI may only explain exceptions.
 * Operational reconciliation tolerance ≠ financial statement materiality.
 */

export type ReconciliationType =
  | "PAYROLL"
  | "ACCOUNTS_RECEIVABLE"
  | "DEBT";

export type ReconciliationRequirement =
  | "REQUIRED"
  | "OPTIONAL"
  | "NOT_APPLICABLE";

export type ReconciliationStatus =
  | "MATCHED"
  | "WITHIN_TOLERANCE"
  | "EXCEPTION"
  | "NEEDS_DATA"
  | "UNDER_REVIEW"
  | "RESOLVED";

export type ReconciliationReadiness =
  | "READY"
  | "NEEDS_DATA"
  | "MAPPING_REQUIRED"
  | "PERIOD_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "STALE_SOURCE";

export type ToleranceSource =
  | "FIRM_DEFAULT"
  | "CLIENT_POLICY"
  | "ENGAGEMENT_POLICY"
  | "MANUAL_REVIEWER";

export type ExceptionType =
  | "RECONCILIATION_DIFFERENCE"
  | "MISSING_SUPPORTING_SCHEDULE"
  | "PERIOD_MISMATCH"
  | "DUPLICATE_SOURCE"
  | "STALE_SOURCE"
  | "INVALID_TOTAL"
  | "MAPPING_REQUIRED"
  | "DATA_QUALITY"
  | "CURRENCY_MISMATCH";

export type ExceptionSeverity = "INFO" | "WARNING" | "CRITICAL";

export type ExceptionStatus =
  | "OPEN"
  | "ASSIGNED"
  | "UNDER_REVIEW"
  | "RESOLVED";

export type ResolutionCategory =
  | "TIMING_DIFFERENCE"
  | "SOURCE_ERROR"
  | "GL_ERROR"
  | "MAPPING_ISSUE"
  | "IMMATERIAL_ACCEPTED"
  | "MISSING_DATA_RECEIVED"
  | "OTHER";

export type SourceRef = {
  kind: string;
  id?: string | null;
  label: string;
  periodId?: string | null;
  periodLabel?: string | null;
  amountCents?: number | null;
  detail?: string;
};

export type AmountSnapshot = {
  label: string;
  amountCents: number | null;
  currency: string;
  components?: { label: string; amountCents: number }[];
  notes?: string[];
};

export type TolerancePolicy = {
  absoluteToleranceCents: number;
  percentageTolerance: number | null;
  source: ToleranceSource;
};

export type ReconciliationResult = {
  type: ReconciliationType;
  controlAmountCents: number | null;
  supportingAmountCents: number | null;
  differenceCents: number | null;
  absoluteDifferenceCents: number | null;
  percentageDifference: number | null;
  toleranceCents: number;
  toleranceSource: ToleranceSource;
  status: Extract<ReconciliationStatus, "MATCHED" | "WITHIN_TOLERANCE" | "EXCEPTION" | "NEEDS_DATA">;
  readiness: ReconciliationReadiness;
  issues: string[];
  control: AmountSnapshot;
  supporting: AmountSnapshot;
  controlSource: string;
  supportingSource: string;
  sourceRefs: SourceRef[];
  dataQuality: string[];
};

export type ExceptionAnalysis = {
  possibleExplanations: string[];
  questionsToInvestigate: string[];
  sourceItemsToReview: string[];
  potentialNextSteps: string[];
  requiresProfessionalReview: true;
  source: "signals" | "claude";
  model: string;
  /** Echo of deterministic inputs — AI must not alter these. */
  locked: {
    controlAmountCents: number | null;
    supportingAmountCents: number | null;
    differenceCents: number | null;
    status: string;
  };
};

export type SubledgerDefinition = {
  key: ReconciliationType;
  label: string;
  sourceType: string;
  controlDescription: string;
  supportingDescription: string;
  includes: string[];
  excludes: string[];
  defaultRequirement: ReconciliationRequirement;
  defaultAbsoluteToleranceCents: number;
};

export const ENGINE_VERSION = "hathorn-recon-1.0.0";

export const RECONCILIATION_TYPES: ReconciliationType[] = [
  "PAYROLL", "ACCOUNTS_RECEIVABLE", "DEBT",
];
