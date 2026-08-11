/**
 * Offline Reconciliation unit checks.
 * Run: npm run recon:test
 */
import assert from "node:assert/strict";
import { dollarsToCents, ledgerKToCents, formatCents, sumCents } from "../lib/reconciliation/money";
import { classifyDifference, firmDefaultTolerance, effectiveToleranceCents } from "../lib/reconciliation/tolerance";
import { finalizeResult } from "../lib/reconciliation/result";
import { deriveExceptions } from "../lib/reconciliation/exceptions";
import { draftExceptionAnalysis } from "../lib/reconciliation/analysis";
import type { ReconciliationResult } from "../lib/reconciliation/types";

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

function basePartial(over: Partial<Parameters<typeof finalizeResult>[0]> = {}) {
  return {
    type: "PAYROLL" as const,
    controlAmountCents: 100_00,
    supportingAmountCents: 100_00,
    readiness: "READY" as const,
    issues: [] as string[],
    blockingIssues: [] as string[],
    policy: firmDefaultTolerance("PAYROLL"),
    control: { label: "Control", amountCents: 100_00, currency: "USD" },
    supporting: { label: "Supporting", amountCents: 100_00, currency: "USD" },
    controlSource: "payroll_lines",
    supportingSource: "source_documents:x",
    sourceRefs: [],
    dataQuality: [] as string[],
    ...over,
  };
}

async function main() {
  console.log("\n── Reconciliation unit ──");

  await check("cents avoid float surprises", () => {
    assert.equal(dollarsToCents(0.1 + 0.2), 30);
    assert.equal(ledgerKToCents(1.5), 150_000);
    assert.equal(sumCents([10, 20, 30]), 60);
    assert.equal(formatCents(12345), "$123.45");
  });

  await check("exact match", () => {
    const r = finalizeResult(basePartial());
    assert.equal(r.status, "MATCHED");
    assert.equal(r.differenceCents, 0);
  });

  await check("within tolerance", () => {
    const r = finalizeResult(basePartial({
      supportingAmountCents: 100_00 + 50_00, // +$50; payroll tol $100
      supporting: { label: "S", amountCents: 150_00, currency: "USD" },
    }));
    assert.equal(r.status, "WITHIN_TOLERANCE");
  });

  await check("outside tolerance → EXCEPTION", () => {
    const r = finalizeResult(basePartial({
      supportingAmountCents: 100_00 + 250_00,
      supporting: { label: "S", amountCents: 350_00, currency: "USD" },
    }));
    assert.equal(r.status, "EXCEPTION");
    assert.equal(r.absoluteDifferenceCents, 250_00);
  });

  await check("missing schedule → NEEDS_DATA", () => {
    const r = finalizeResult(basePartial({
      supportingAmountCents: null,
      blockingIssues: ["MISSING_SUPPORTING_SCHEDULE — no approved payroll register"],
      readiness: "NEEDS_DATA",
    }));
    assert.equal(r.status, "NEEDS_DATA");
    assert.ok(r.issues.some((i) => /MISSING_SUPPORTING_SCHEDULE/i.test(i)));
  });

  await check("period mismatch blocks comparison", () => {
    const r = finalizeResult(basePartial({
      blockingIssues: ["STALE_SOURCE — register period does not match 2026-04."],
      readiness: "STALE_SOURCE",
      supportingAmountCents: 100_00,
    }));
    assert.equal(r.status, "NEEDS_DATA");
  });

  await check("invalid / null totals → NEEDS_DATA", () => {
    const r = finalizeResult(basePartial({
      controlAmountCents: null,
      supportingAmountCents: null,
      blockingIssues: ["INVALID_TOTAL — register has no gross pay total."],
      readiness: "NEEDS_DATA",
    }));
    assert.equal(r.status, "NEEDS_DATA");
  });

  await check("AR difference creates reconciliation exception", () => {
    const result: ReconciliationResult = finalizeResult({
      ...basePartial({
        type: "ACCOUNTS_RECEIVABLE",
        policy: firmDefaultTolerance("ACCOUNTS_RECEIVABLE"),
        controlAmountCents: 855_210_00,
        supportingAmountCents: 850_100_00,
      }),
    });
    assert.equal(result.status, "EXCEPTION");
    const ex = deriveExceptions(result);
    assert.ok(ex.some((e) => e.type === "RECONCILIATION_DIFFERENCE"));
    assert.ok(ex.every((e) => ["INFO", "WARNING", "CRITICAL"].includes(e.severity)));
  });

  await check("duplicate / data quality surfaced", () => {
    const result = finalizeResult(basePartial({
      dataQuality: ["Duplicate invoice: INV-1", "Negative AR balance: INV-2"],
      supportingAmountCents: 100_00,
    }));
    const ex = deriveExceptions(result);
    assert.ok(ex.some((e) => e.type === "DUPLICATE_SOURCE"));
    assert.ok(ex.some((e) => e.type === "DATA_QUALITY"));
  });

  await check("debt missing schedule", () => {
    const r = finalizeResult(basePartial({
      type: "DEBT",
      policy: firmDefaultTolerance("DEBT"),
      supportingAmountCents: null,
      blockingIssues: ["MISSING_SUPPORTING_SCHEDULE — no approved debt schedule for this period."],
      readiness: "NEEDS_DATA",
    }));
    assert.equal(r.status, "NEEDS_DATA");
    const ex = deriveExceptions(r);
    assert.ok(ex.some((e) => e.type === "MISSING_SUPPORTING_SCHEDULE"));
  });

  await check("tolerance provenance is firm default unless configured", () => {
    const pol = firmDefaultTolerance("ACCOUNTS_RECEIVABLE");
    assert.equal(pol.source, "FIRM_DEFAULT");
    assert.equal(effectiveToleranceCents(pol, 1_000_000_00), 500_00);
    const c = classifyDifference({
      controlAmountCents: 100, supportingAmountCents: 100, policy: pol, blockingIssues: [],
    });
    assert.equal(c.toleranceSource, "FIRM_DEFAULT");
  });

  await check("AI draft cannot change locked amounts", () => {
    const result = finalizeResult(basePartial({
      supportingAmountCents: 500_00,
      supporting: { label: "S", amountCents: 500_00, currency: "USD" },
    }));
    const draft = draftExceptionAnalysis(result);
    assert.equal(draft.locked.controlAmountCents, result.controlAmountCents);
    assert.equal(draft.locked.supportingAmountCents, result.supportingAmountCents);
    assert.equal(draft.locked.differenceCents, result.differenceCents);
    assert.equal(draft.locked.status, result.status);
    assert.equal(draft.requiresProfessionalReview, true);
    assert.ok(draft.possibleExplanations.some((x) => /does not establish/i.test(x)));
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main();
