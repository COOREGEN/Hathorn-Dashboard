/**
 * Offline Accounting Guidance unit checks.
 * Run: npm run research:test
 */
import assert from "node:assert/strict";
import { draftTechnicalAnalysis, identifyMissingLeaseFacts } from "../lib/research/analysis";
import { groundCitations, citationsFromHits, flagEffectiveDateMismatch } from "../lib/research/citations";
import { validateProposedJournalEntry, assertBalanced } from "../lib/research/journal-entry";
import { ragflowStatus } from "../lib/research/ragflow";
import {
  canIndexForAiCorpus, isAccountingAuthority, isFactSource, guidanceHierarchyLabel,
  assertIndexableRights,
} from "../lib/research/source-registry";
import { assertSafeResearchUrl, RESEARCH_HOST_ALLOWLIST } from "../lib/research/fetch-source";
import { NativeResearchRetriever } from "../lib/research/retrieval";
import type { AccountingResearchIssue, ResearchHit } from "../lib/research/types";

let passed = 0;
let failed = 0;

async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${(e as Error).message}`);
  }
}

const issue: AccountingResearchIssue = {
  id: "i1",
  clientId: "c1",
  title: "Equipment lease classification",
  description: "Synthetic pilot",
  category: "LEASES",
  reportingPeriod: "2026-06",
  entityContext: "PRIVATE_COMPANY",
  status: "OPEN",
  createdBy: "u",
  assignedTo: null,
  reviewedBy: null,
  reviewedAt: null,
  createdAt: "",
  updatedAt: "",
};

function hit(partial: Partial<ResearchHit> & { sourceId: string; sourceType: string; rights?: string }): ResearchHit {
  return {
    chunkId: `ch-${partial.sourceId}`,
    sourceId: partial.sourceId,
    score: 10,
    section: partial.section || "§chunk-1",
    page: null,
    excerpt: partial.excerpt || "Gather contract term and renewal options.",
    citation: {
      sourceId: partial.sourceId,
      title: partial.citation?.title || "Firm lease checklist",
      citation: partial.citation?.citation || "Hathorn Firm Guidance",
      sourceType: partial.sourceType as any,
      contentRights: (partial.rights || "INTERNAL") as any,
      excerpt: partial.excerpt || "Gather contract term and renewal options.",
      effectiveDate: partial.citation?.effectiveDate ?? null,
    },
  };
}

async function main() {
  console.log("\n── Accounting Guidance unit ──");

  await check("RAGFlow deferred by default", () => {
    delete process.env.RAGFLOW_ENABLED;
    const st = ragflowStatus();
    assert.equal(st.enabled, false);
    assert.match(st.reason, /DEFERRED/i);
  });

  await check("UNKNOWN rights cannot be indexed", async () => {
    assert.equal(canIndexForAiCorpus("UNKNOWN"), false);
    assert.throws(() => assertIndexableRights("UNKNOWN"), /UNKNOWN/);
    const r = new NativeResearchRetriever();
    await assert.rejects(
      () => r.indexSource({
        id: "x", title: "t", citation: "c", publisher: "p", sourceType: "OTHER_INTERPRETIVE",
        contentRights: "UNKNOWN", sourceUrl: null, bodyText: "secret", effectiveDate: null,
      }),
      /UNKNOWN|corpus|index/i,
    );
  });

  await check("REFERENCE_ONLY not indexable", () => {
    assert.equal(canIndexForAiCorpus("REFERENCE_ONLY"), false);
    assert.throws(() => assertIndexableRights("REFERENCE_ONLY"), /REFERENCE_ONLY|metadata/i);
  });

  await check("contract is fact source, not GAAP authority", () => {
    assert.equal(isFactSource("CONTRACT"), true);
    assert.equal(isAccountingAuthority("CONTRACT"), false);
    assert.equal(guidanceHierarchyLabel("CONTRACT"), "CLIENT FACT SOURCE");
    assert.equal(guidanceHierarchyLabel("FIRM_POLICY"), "INTERNAL FIRM GUIDANCE");
    assert.notEqual(guidanceHierarchyLabel("FIRM_POLICY"), "AUTHORITATIVE GUIDANCE");
  });

  await check("missing lease facts flagged", () => {
    const missing = identifyMissingLeaseFacts({ contract_term_months: "36" });
    assert.ok(missing.includes("payment_structure"));
    assert.ok(missing.includes("economic_life_years"));
    assert.ok(!missing.includes("contract_term_months"));
  });

  await check("citations grounded — invented ASC dropped", () => {
    const hits = [hit({ sourceId: "src-firm", sourceType: "FIRM_POLICY" })];
    const allowed = citationsFromHits(hits);
    const grounded = groundCitations(
      [
        { sourceId: "src-firm", title: "ok", sourceType: "FIRM_POLICY", contentRights: "INTERNAL" },
        {
          sourceId: "fake-asc", title: "Invented", citation: "ASC 842-10-25-2",
          sourceType: "FASB_ASC", contentRights: "PUBLIC",
        },
      ],
      allowed,
    );
    assert.ok(grounded.every((c) => c.sourceId === "src-firm"));
    assert.ok(!grounded.some((c) => /ASC 842-10-25-2/.test(c.citation || "")));
  });

  await check("no authorized guidance → ADDITIONAL RESEARCH REQUIRED", () => {
    const draft = draftTechnicalAnalysis({
      issue,
      facts: { contract_term_months: "36" },
      hits: [hit({ sourceId: "contract-1", sourceType: "CONTRACT", rights: "USER_PROVIDED",
        excerpt: "Lease agreement between parties." })],
      factLines: ["contract_term_months = 36"],
    });
    assert.equal(draft.requiresProfessionalReview, true);
    assert.match(draft.preliminaryConclusion, /ADDITIONAL RESEARCH REQUIRED|NEEDS MORE INFORMATION/i);
    assert.ok(draft.warnings.some((w) => /INSUFFICIENT AUTHORIZED GUIDANCE|CLIENT FACT SOURCE/i.test(w)));
    assert.ok(!draft.citations.some((c) => c.sourceType === "FASB_ASC" && c.sourceId === "fake"));
  });

  await check("firm guidance draft with missing facts", () => {
    const draft = draftTechnicalAnalysis({
      issue,
      facts: { contract_term_months: "36", payment_structure: "fixed" },
      hits: [hit({ sourceId: "src-firm", sourceType: "FIRM_POLICY" })],
      factLines: ["contract_term_months = 36", "payment_structure = fixed"],
    });
    assert.ok(draft.missingFacts.length > 0);
    assert.match(draft.preliminaryConclusion, /NEEDS MORE INFORMATION/i);
    assert.ok(draft.citations.every((c) => c.sourceId === "src-firm"));
    assert.match(draft.technicalMemo, /PURPOSE/);
    assert.match(draft.technicalMemo, /SOURCES/);
  });

  await check("journal entry must balance", () => {
    const ok = validateProposedJournalEntry([
      { side: "DR", account: "ROU Asset", amount: 100 },
      { side: "CR", account: "Lease Liability", amount: 100 },
    ]);
    assert.equal(ok.balanced, true);
    assertBalanced(ok);

    const bad = validateProposedJournalEntry([
      { side: "DR", account: "ROU Asset", amount: 100 },
      { side: "CR", account: "Lease Liability", amount: 90 },
    ]);
    assert.equal(bad.balanced, false);
    assert.throws(() => assertBalanced(bad), /does not balance/i);
  });

  await check("effective date mismatch flagged when metadata present", () => {
    const warnings = flagEffectiveDateMismatch("2020-12", [
      hit({
        sourceId: "s1",
        sourceType: "FASB_ASU",
        rights: "PUBLIC",
        citation: {
          sourceId: "s1", title: "Future ASU", citation: "ASU 2099-01",
          sourceType: "FASB_ASU", contentRights: "PUBLIC", effectiveDate: "2099-01-01",
        },
      }),
    ]);
    assert.ok(warnings.some((w) => /Effective-date mismatch/i.test(w)));
  });

  await check("SSRF: research URL allowlist", async () => {
    await assert.rejects(() => assertSafeResearchUrl("http://127.0.0.1/x"), /HTTPS|Private|Invalid/i);
    await assert.rejects(() => assertSafeResearchUrl("https://127.0.0.1/x"), /allowlist|Private/i);
    await assert.rejects(() => assertSafeResearchUrl("https://evil.example/x"), /allowlist/i);
    assert.ok(RESEARCH_HOST_ALLOWLIST.has("www.fasb.org"));
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main();
