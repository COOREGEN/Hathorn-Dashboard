/**
 * Hathorn Accounting Guidance facade — staff research orchestration.
 */

export { getResearchRetriever, NativeResearchRetriever } from "./retrieval";
export { generateTechnicalAnalysis, draftTechnicalAnalysis, identifyMissingLeaseFacts } from "./analysis";
export { citationsFromHits, groundCitations, flagEffectiveDateMismatch } from "./citations";
export { validateProposedJournalEntry, assertBalanced } from "./journal-entry";
export { ragflowStatus } from "./ragflow";
export {
  canIndexForAiCorpus, assertIndexableRights, isAccountingAuthority, isFactSource,
  guidanceHierarchyLabel,
} from "./source-registry";
export type { AccountingContentProvider } from "./source-registry";
export { assertSafeResearchUrl, RESEARCH_HOST_ALLOWLIST } from "./fetch-source";
export * from "./types";
