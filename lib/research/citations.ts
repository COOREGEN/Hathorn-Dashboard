/**
 * Citation grounding — every citation in an analysis must map to supplied hits/sources.
 */

import type { AccountingCitation, ResearchHit } from "./types";

export function citationsFromHits(hits: ResearchHit[]): AccountingCitation[] {
  const seen = new Set<string>();
  const out: AccountingCitation[] = [];
  for (const h of hits) {
    const key = `${h.sourceId}:${h.section || ""}:${h.excerpt.slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...h.citation });
  }
  return out;
}

/** Drop any model-invented citations not present in the allowed set. */
export function groundCitations(
  claimed: AccountingCitation[] | undefined,
  allowed: AccountingCitation[],
): AccountingCitation[] {
  const allowIds = new Set(allowed.map((c) => c.sourceId));
  const allowCitations = new Set(allowed.map((c) => (c.citation || "").toLowerCase()).filter(Boolean));
  if (!Array.isArray(claimed)) return allowed.slice(0, 8);
  const grounded = claimed.filter((c) => {
    if (c?.sourceId && allowIds.has(c.sourceId)) return true;
    if (c?.citation && allowCitations.has(String(c.citation).toLowerCase())) return true;
    return false;
  }).map((c) => {
    const hit = allowed.find((a) => a.sourceId === c.sourceId || a.citation === c.citation)!;
    return {
      ...hit,
      section: c.section || hit.section,
      page: c.page ?? hit.page,
      excerpt: c.excerpt || hit.excerpt,
    };
  });
  return grounded.length ? grounded : allowed.slice(0, 8);
}

/**
 * Flag sources whose effective_date metadata is after the reporting period year.
 * Never invents effective dates — only uses values present on citations/hits.
 */
export function flagEffectiveDateMismatch(
  reportingPeriod: string | null,
  hits: ResearchHit[],
): string[] {
  if (!reportingPeriod) return [];
  const yearMatch = reportingPeriod.match(/(20\d{2})/);
  if (!yearMatch) return [];
  const reportYear = Number(yearMatch[1]);
  const warnings: string[] = [];
  for (const h of hits) {
    const eff = h.citation.effectiveDate;
    if (!eff) continue;
    const effYearMatch = String(eff).match(/(20\d{2})/);
    if (!effYearMatch) continue;
    const effYear = Number(effYearMatch[1]);
    if (effYear > reportYear) {
      warnings.push(
        `Effective-date mismatch: ${h.citation.citation || h.citation.title} effective ${eff} vs reporting period ${reportingPeriod}.`,
      );
    }
  }
  return warnings;
}
