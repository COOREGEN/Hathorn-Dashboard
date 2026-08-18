/**
 * Tax Intelligence types — advisory research, never filing or GL mutation.
 *
 * Every deterministic rule carries tax_year + authority. AI explains supplied
 * structure only and must not invent IRC citations or limits.
 */

export type TaxIssueStatus =
  | "OPEN"
  | "RESEARCHING"
  | "NEEDS_INFORMATION"
  | "DRAFT_CONCLUSION"
  | "REVIEWED"
  | "CLOSED";

export type AuthoritySourceType =
  | "IRC"
  | "TREASURY_REG"
  | "IRB"
  | "REV_RULING"
  | "REV_PROCEDURE"
  | "NOTICE"
  | "ANNOUNCEMENT"
  | "FORM_INSTRUCTIONS"
  | "PUBLICATION"
  | "FAQ_WEB"
  | "COURT"
  | "OTHER";

export type FactType = "string" | "number" | "boolean" | "date" | "percent" | "currency";

export type FactProvenance =
  | "USER_ENTERED"
  | "ADVISOR_CONFIRMED"
  | "QUICKBOOKS"
  | "UPLOADED_DOCUMENT"
  | "PAYROLL_REGISTER"
  | "PRIOR_RETURN"
  | "EXTERNAL"
  | "ACCOUNTING_READ";

export type TaxAuthority = {
  id: string;
  sourceType: AuthoritySourceType;
  title: string;
  citation: string;
  url: string | null;
  taxYear: number | null;
  effectiveDate: string | null;
  publishedDate: string | null;
  retrievedAt: string | null;
  contentHash: string | null;
  status: "ACTIVE" | "SUPERSEDED" | "DRAFT";
};

export type TaxSourceSnapshot = {
  id: string;
  authorityId: string;
  retrievedAt: string;
  contentHash: string;
  contentText: string;
  metadata: Record<string, unknown>;
};

export type TaxIssue = {
  id: string;
  clientId: string;
  title: string;
  description: string;
  taxYear: number;
  entityType: string;
  status: TaxIssueStatus;
  createdBy: string;
  assignedTo: string | null;
  analysisJson: TaxAnalysis | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaxIssueFact = {
  id: string;
  taxIssueId: string;
  factKey: string;
  factValue: string;
  factType: FactType;
  provenance: FactProvenance;
  sourceDocumentId: string | null;
  verified: boolean;
  createdBy: string;
  createdAt: string;
};

export type TaxAuthorityReference = {
  authorityId: string;
  citation: string;
  title: string;
  sourceType: AuthoritySourceType;
  url: string | null;
};

export type TaxRuleResult = {
  ruleKey: string;
  ruleVersion: string;
  taxYear: number;
  status: "ELIGIBLE" | "NOT_ELIGIBLE" | "NEEDS_INFORMATION" | "UNSUPPORTED_TAX_YEAR" | "ERROR";
  outputs: Record<string, number | string | boolean | null>;
  missingFacts: string[];
  authorityRefs: TaxAuthorityReference[];
  detail: string;
};

export type TaxAnalysis = {
  issue: string;
  knownFacts: string[];
  missingFacts: string[];
  authorities: TaxAuthorityReference[];
  analysis: string;
  scenarioObservations: string[];
  risks: string[];
  preliminaryConclusion: string;
  requiresProfessionalReview: true;
  taxYear: number;
  researchDate: string;
  source: "claude" | "signals";
};

export type TaxScenario = {
  id: string;
  taxIssueId: string;
  name: string;
  taxYear: number;
  factsJson: Record<string, string>;
  createdBy: string;
  createdAt: string;
};

export const SUPPORTED_TAX_YEARS = [2025] as const;

export const ENTITY_TYPES = [
  "SOLE_PROP", "PARTNERSHIP", "S_CORP", "C_CORP", "LLC", "OTHER",
] as const;
