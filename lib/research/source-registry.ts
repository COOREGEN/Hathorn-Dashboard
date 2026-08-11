/**
 * Source classification helpers — authority vs fact sources, rights gates.
 * Research software ≠ licensed content.
 */

import type { AccountingSourceType, ContentRights } from "./types";
import { INDEXABLE_RIGHTS } from "./types";

/** May enter the persistent AI research corpus (chunks). */
export function canIndexForAiCorpus(rights: ContentRights): boolean {
  return INDEXABLE_RIGHTS.includes(rights);
}

/** Unknown rights never enter the AI corpus. */
export function assertIndexableRights(rights: ContentRights) {
  if (rights === "UNKNOWN") {
    throw new Error("UNKNOWN content rights cannot enter the persistent research corpus.");
  }
  if (rights === "REFERENCE_ONLY") {
    throw new Error("REFERENCE_ONLY sources are metadata-only and are not indexed.");
  }
  if (!canIndexForAiCorpus(rights)) {
    throw new Error(`Content rights ${rights} cannot be indexed.`);
  }
}

/** Authoritative / interpretive accounting guidance (not client fact documents). */
const AUTHORITY_TYPES: AccountingSourceType[] = [
  "FASB_ASC", "FASB_ASU", "FASB_STAFF", "SEC", "SEC_SAB", "PCAOB", "IFRS", "AICPA",
  "OTHER_AUTHORITATIVE", "OTHER_INTERPRETIVE", "FIRM_POLICY", "TECHNICAL_MEMO",
];

/** Client / engagement fact material — never GAAP authority by itself. */
const FACT_SOURCE_TYPES: AccountingSourceType[] = [
  "CONTRACT", "AGREEMENT", "SUPPORTING_DOCUMENT", "ENGAGEMENT", "CLIENT_POLICY",
];

export function isAccountingAuthority(sourceType: string): boolean {
  return AUTHORITY_TYPES.includes(sourceType as AccountingSourceType);
}

export function isFactSource(sourceType: string): boolean {
  return FACT_SOURCE_TYPES.includes(sourceType as AccountingSourceType);
}

export function guidanceHierarchyLabel(sourceType: string): string {
  if (sourceType === "FIRM_POLICY" || sourceType === "TECHNICAL_MEMO") {
    return "INTERNAL FIRM GUIDANCE";
  }
  if (isFactSource(sourceType)) return "CLIENT FACT SOURCE";
  if (["FASB_ASC", "FASB_ASU", "FASB_STAFF", "SEC", "SEC_SAB", "PCAOB", "IFRS", "AICPA", "OTHER_AUTHORITATIVE"].includes(sourceType)) {
    return "AUTHORITATIVE GUIDANCE";
  }
  return "INTERPRETIVE GUIDANCE";
}

/**
 * Future seam for licensed commercial / FASB providers.
 * Not implemented — no vendor integration until agreements exist.
 */
export interface AccountingContentProvider {
  search(query: string, context?: Record<string, unknown>): Promise<{ id: string; title: string; excerpt: string }[]>;
  getSource(id: string): Promise<{ id: string; title: string; body?: string } | null>;
}

export class FirmLibraryContentProvider implements AccountingContentProvider {
  async search(): Promise<{ id: string; title: string; excerpt: string }[]> {
    return [];
  }
  async getSource(): Promise<null> {
    return null;
  }
}
