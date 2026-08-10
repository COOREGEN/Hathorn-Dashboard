/**
 * Accounting Guidance / Technical Research types.
 *
 * Research software ≠ licensed content. No unauthorized ASC corpus.
 * AI conclusions must cite supplied sources only.
 */

export type ContentRights =
  | "PUBLIC"
  | "USER_PROVIDED"
  | "LICENSED"
  | "INTERNAL"
  | "REFERENCE_ONLY"
  | "UNKNOWN";

export type AccountingSourceType =
  | "FASB_ASC"
  | "FASB_ASU"
  | "FASB_STAFF"
  | "SEC"
  | "SEC_SAB"
  | "PCAOB"
  | "IFRS"
  | "AICPA"
  | "FIRM_POLICY"
  | "CLIENT_POLICY"
  | "ENGAGEMENT"
  | "TECHNICAL_MEMO"
  | "CONTRACT"
  | "AGREEMENT"
  | "SUPPORTING_DOCUMENT"
  | "OTHER_AUTHORITATIVE"
  | "OTHER_INTERPRETIVE";

export type SourceScope = "FIRM" | "CLIENT";

export type ResearchIssueStatus =
  | "OPEN"
  | "FACT_GATHERING"
  | "RESEARCHING"
  | "DRAFT"
  | "NEEDS_REVIEW"
  | "FINAL"
  | "CLOSED";

export type ResearchCategory =
  | "REVENUE_RECOGNITION"
  | "LEASES"
  | "FIXED_ASSETS"
  | "INTANGIBLES"
  | "DEBT"
  | "EQUITY"
  | "STOCK_COMPENSATION"
  | "BUSINESS_COMBINATIONS"
  | "CONSOLIDATION"
  | "CONTINGENCIES"
  | "CREDIT_LOSSES"
  | "INVENTORY"
  | "FAIR_VALUE"
  | "INCOME_TAXES"
  | "FOREIGN_CURRENCY"
  | "NONPROFIT"
  | "PRESENTATION"
  | "CASH_FLOW"
  | "RELATED_PARTIES"
  | "SUBSEQUENT_EVENTS"
  | "GOING_CONCERN"
  | "OTHER";

export type EntityContext =
  | "PUBLIC_BUSINESS_ENTITY"
  | "PRIVATE_COMPANY"
  | "NONPROFIT"
  | "EMPLOYEE_BENEFIT_PLAN"
  | "GOVERNMENTAL"
  | "OTHER";

export type FactType = "string" | "number" | "boolean" | "date" | "percent" | "currency";

export type FactProvenance =
  | "USER_ENTERED"
  | "CLIENT_DOCUMENT"
  | "CONTRACT"
  | "QUICKBOOKS"
  | "SUPPORTING_SCHEDULE"
  | "PRIOR_MEMO"
  | "MANAGEMENT_REP"
  | "ADVISOR_CONFIRMED"
  | "EXTERNAL";

export type AccountingCitation = {
  sourceId: string;
  title: string;
  publisher?: string;
  citation?: string;
  sourceType: AccountingSourceType;
  page?: number;
  section?: string;
  excerpt?: string;
  sourceUrl?: string;
  contentRights: ContentRights;
  /** ISO date or year string when known — never fabricated. */
  effectiveDate?: string | null;
};

export type ResearchHit = {
  chunkId: string;
  sourceId: string;
  score: number;
  section: string | null;
  page: number | null;
  excerpt: string;
  citation: AccountingCitation;
};

export type ProposedJournalLine = {
  side: "DR" | "CR";
  account: string;
  amount: number;
  memo?: string;
};

export type ProposedJournalEntry = {
  description: string;
  lines: ProposedJournalLine[];
  balanced: boolean;
  totalDebits: number;
  totalCredits: number;
};

export type TechnicalAccountingAnalysis = {
  issue: string;
  relevantFacts: string[];
  missingFacts: string[];
  guidanceSummary: string;
  analysis: string;
  alternatives: string[];
  accountingImpact: string;
  disclosureConsiderations: string[];
  openQuestions: string[];
  preliminaryConclusion: string;
  citations: AccountingCitation[];
  proposedJournalEntry: ProposedJournalEntry | null;
  technicalMemo: string;
  requiresProfessionalReview: true;
  reportingPeriod: string | null;
  researchDate: string;
  source: "claude" | "signals";
  model: string;
  warnings: string[];
};

export type AccountingSource = {
  id: string;
  sourceType: AccountingSourceType;
  title: string;
  citation: string;
  publisher: string;
  sourceUrl: string | null;
  contentRights: ContentRights;
  scope: SourceScope;
  clientId: string | null;
  reportingPeriod: string | null;
  publishedDate: string | null;
  effectiveDate: string | null;
  retrievedAt: string | null;
  contentHash: string | null;
  documentId: string | null;
  status: "ACTIVE" | "SUPERSEDED" | "DRAFT";
  bodyText: string | null;
};

export type AccountingResearchIssue = {
  id: string;
  clientId: string | null;
  title: string;
  description: string;
  category: ResearchCategory;
  reportingPeriod: string | null;
  entityContext: EntityContext;
  status: ResearchIssueStatus;
  createdBy: string;
  assignedTo: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const RESEARCH_CATEGORIES: { value: ResearchCategory; label: string }[] = [
  { value: "LEASES", label: "Leases" },
  { value: "REVENUE_RECOGNITION", label: "Revenue Recognition" },
  { value: "FIXED_ASSETS", label: "Fixed Assets" },
  { value: "DEBT", label: "Debt" },
  { value: "CASH_FLOW", label: "Cash Flow Classification" },
  { value: "PRESENTATION", label: "Financial Statement Presentation" },
  { value: "RELATED_PARTIES", label: "Related Parties" },
  { value: "OTHER", label: "Other" },
];

/** Rights that may be indexed into the persistent research corpus. */
export const INDEXABLE_RIGHTS: ContentRights[] = [
  "PUBLIC", "USER_PROVIDED", "LICENSED", "INTERNAL",
];
