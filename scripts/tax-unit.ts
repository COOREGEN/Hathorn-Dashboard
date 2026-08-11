/**
 * Offline Tax Intelligence unit checks.
 * Run: npm run tax:test
 */
import assert from "node:assert/strict";
import { runSec179ExpenseLimit, SEC179_2025_DOLLAR_LIMIT } from "../lib/tax/rules/sec179-expense";
import { runTaxRule } from "../lib/tax/rules";
import { draftTaxAnalysis, identifyMissingFacts } from "../lib/tax/analysis";
import { factGraphStatus } from "../lib/tax/fact-graph";
import { assertSafeAuthorityUrl, AUTHORITY_HOST_ALLOWLIST } from "../lib/tax/fetch-authority";
import type { TaxIssue, TaxIssueFact } from "../lib/tax/types";

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

const baseFacts = {
  equipment_cost: "150000",
  placed_in_service: "true",
  business_use_pct: "100",
};

async function main() {
  console.log("\n── Tax Intelligence unit ──");

  await check("Fact Graph default disabled / blocked", () => {
    delete process.env.IRS_FACT_GRAPH_ENABLED;
    const st = factGraphStatus();
    assert.equal(st.enabled, false);
  });

  await check("wrong tax year rejected", () => {
    const r = runSec179ExpenseLimit({ taxYear: 2026, facts: baseFacts });
    assert.equal(r.status, "UNSUPPORTED_TAX_YEAR");
  });

  await check("missing facts → NEEDS_INFORMATION", () => {
    const r = runSec179ExpenseLimit({
      taxYear: 2025,
      facts: { equipment_cost: "100000" },
    });
    assert.equal(r.status, "NEEDS_INFORMATION");
    assert.ok(r.missingFacts.includes("placed_in_service"));
    assert.ok(r.missingFacts.includes("business_use_pct"));
  });

  await check("business use ≤50% not eligible", () => {
    const r = runSec179ExpenseLimit({
      taxYear: 2025,
      facts: { ...baseFacts, business_use_pct: "40" },
    });
    assert.equal(r.status, "NOT_ELIGIBLE");
    assert.equal(r.outputs.allowable_section179, 0);
  });

  await check("positive eligibility under dollar limit", () => {
    const r = runSec179ExpenseLimit({ taxYear: 2025, facts: baseFacts });
    assert.equal(r.status, "ELIGIBLE");
    assert.equal(r.outputs.allowable_section179, 150000);
    assert.equal(r.outputs.dollar_limit, SEC179_2025_DOLLAR_LIMIT);
    assert.ok(r.authorityRefs.some((a) => a.citation.includes("179")));
  });

  await check("boundary: phase-out reduces limit", () => {
    const r = runSec179ExpenseLimit({
      taxYear: 2025,
      facts: {
        ...baseFacts,
        equipment_cost: "2000000",
        total_section179_property_cost: "3500000", // 370k over 3.13M
      },
    });
    assert.equal(r.status, "ELIGIBLE");
    // limit 1.25M - 370k = 880k; qualifying 2M → allowable 880k
    assert.equal(r.outputs.allowable_section179, 880_000);
  });

  await check("reproducibility", () => {
    const a = runTaxRule({ ruleKey: "sec179_expense_limit", taxYear: 2025, facts: baseFacts });
    const b = runTaxRule({ ruleKey: "sec179_expense_limit", taxYear: 2025, facts: baseFacts });
    assert.equal(JSON.stringify(a.outputs), JSON.stringify(b.outputs));
  });

  await check("SSRF: localhost blocked", async () => {
    await assert.rejects(() => assertSafeAuthorityUrl("http://127.0.0.1/x"), /HTTPS|allowlist|Private|Invalid/i);
    await assert.rejects(() => assertSafeAuthorityUrl("https://127.0.0.1/x"), /allowlist|Private/i);
    await assert.rejects(() => assertSafeAuthorityUrl("https://evil.example/x"), /allowlist/i);
    assert.ok(AUTHORITY_HOST_ALLOWLIST.has("www.irs.gov"));
  });

  await check("AI draft cites only supplied authorities and requires review", () => {
    const issue: TaxIssue = {
      id: "i1", clientId: "c1", title: "§179 test", description: "",
      taxYear: 2025, entityType: "S_CORP", status: "OPEN",
      createdBy: "u", assignedTo: null, analysisJson: null,
      reviewedBy: null, reviewedAt: null, createdAt: "", updatedAt: "",
    };
    const facts: TaxIssueFact[] = [
      {
        id: "f1", taxIssueId: "i1", factKey: "equipment_cost", factValue: "150000",
        factType: "currency", provenance: "USER_ENTERED", sourceDocumentId: null,
        verified: false, createdBy: "u", createdAt: "",
      },
    ];
    const rule = runSec179ExpenseLimit({ taxYear: 2025, facts: { equipment_cost: "150000" } });
    const draft = draftTaxAnalysis({
      issue, facts, authorities: rule.authorityRefs, ruleResults: [rule],
    });
    assert.equal(draft.requiresProfessionalReview, true);
    assert.ok(draft.missingFacts.length > 0);
    for (const a of draft.authorities) {
      assert.ok(rule.authorityRefs.some((x) => x.authorityId === a.authorityId));
    }
  });

  await check("identifyMissingFacts does not invent values", () => {
    const missing = identifyMissingFacts([], [
      runSec179ExpenseLimit({ taxYear: 2025, facts: {} }),
    ]);
    assert.ok(missing.includes("equipment_cost"));
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main();
