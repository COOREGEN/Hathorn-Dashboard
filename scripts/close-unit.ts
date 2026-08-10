/**
 * Offline Close Automation unit checks.
 * Run: npm run close:test
 */
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "fs";
import path from "path";
import { closeDb, db, uid } from "../lib/db";
import {
  buildSummary, evaluateCloseCheck, evaluateCloseReadiness,
  hashPayload, combineDeps, resolvePolicy, startOrGetCloseRun,
  refreshCloseRun, reviewCheck, waiveCheck, listChecklist, getCloseRun,
} from "../lib/close";
import type { CloseChecklistItem } from "../lib/close";

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

function withTempDb(fn: () => Promise<void>) {
  const prev = process.env.DATA_DIR;
  const tmp = path.join(process.cwd(), "data", `_close_unit_${process.pid}_${Date.now()}`);
  process.env.DATA_DIR = tmp;
  mkdirSync(tmp, { recursive: true });
  closeDb();
  return fn().finally(() => {
    closeDb();
    process.env.DATA_DIR = prev;
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
  });
}

function seedMinimal() {
  const clientId = uid();
  const periodId = uid();
  db().prepare(`
    INSERT INTO clients (id, name, slug, template, brand_primary, brand_accent, logo_text)
    VALUES (?,?,?,?,?,?,?)
  `).run(clientId, "Close Test Co", `close-${clientId.slice(0, 8)}`, "editorial", "#2C504D", "#DB5928", "CLOSE");
  const entityId = uid();
  db().prepare(`INSERT INTO entities (id, client_id, name) VALUES (?,?,?)`)
    .run(entityId, clientId, "Ops");
  db().prepare(`
    INSERT INTO periods (id, client_id, year, month, status, gate_pass)
    VALUES (?,?,?,?, 'IN_REVIEW', 1)
  `).run(periodId, clientId, 2026, 4);
  db().prepare(`
    INSERT INTO pl_lines (id, period_id, entity_id, category, label, amount)
    VALUES (?,?,?,?,?,?)
  `).run(uid(), periodId, entityId, "REVENUE", "Services", 100);
  db().prepare(`
    INSERT INTO payroll_lines (id, period_id, entity_id, wages, ot_premium, taxes, workers_comp, processing, hours_paid)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(uid(), periodId, entityId, 60, 0, 5, 1, 0.5, 800);
  db().prepare(`
    INSERT INTO cash_balances (id, period_id, operating, reserve) VALUES (?,?,?,?)
  `).run(uid(), periodId, 50, 10);
  // prior month for variance
  const priorId = uid();
  db().prepare(`
    INSERT INTO periods (id, client_id, year, month, status, gate_pass)
    VALUES (?,?,?,?, 'PUBLISHED', 1)
  `).run(priorId, clientId, 2026, 3);
  db().prepare(`
    INSERT INTO pl_lines (id, period_id, entity_id, category, label, amount)
    VALUES (?,?,?,?,?,?)
  `).run(uid(), priorId, entityId, "REVENUE", "Services", 80);
  db().prepare(`
    INSERT INTO payroll_lines (id, period_id, entity_id, wages, ot_premium, taxes, workers_comp, processing, hours_paid)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(uid(), priorId, entityId, 40, 0, 4, 1, 0.5, 600);
  return { clientId, periodId, entityId };
}

function item(partial: Partial<CloseChecklistItem> & { checkKey: any; title: string }): CloseChecklistItem {
  return {
    id: uid(), closeRunId: "r", category: "DATA", kind: "AUTOMATED",
    required: true, blocking: true, status: "PENDING",
    assignedTo: null, dueAt: null, completedBy: null, completedAt: null,
    waivedBy: null, waivedAt: null, waiveReason: null, note: null,
    evidence: {}, inputHash: null, reviewedHash: null, reviewedBy: null,
    reviewedAt: null, lastEvaluatedAt: null, exceptionId: null,
    ...partial,
  };
}

async function main() {
  console.log("\n── Close Automation unit ──");

  await check("progress is completed/required (transparent)", () => {
    const items = [
      item({ checkKey: "figures_present", title: "A", status: "PASS" }),
      item({ checkKey: "gate_pass", title: "B", status: "FAIL" }),
      item({ checkKey: "cash_present", title: "C", status: "WAIVED", blocking: false }),
      item({ checkKey: "doc_debt_approved", title: "D", status: "NOT_APPLICABLE", required: true }),
    ];
    const s = buildSummary(items, 1, 1);
    assert.equal(s.requiredTotal, 3); // NOT_APPLICABLE excluded from required set in buildSummary
    assert.ok(s.progressPct >= 0 && s.progressPct <= 100);
    assert.ok(s.blockers.some((b) => b.title === "B"));
  });

  await check("blocking FAIL prevents READY_TO_PUBLISH", () => {
    const items = [
      item({ checkKey: "figures_present", title: "Figures", status: "PASS" }),
      item({ checkKey: "gate_pass", title: "Gate", status: "FAIL", blocking: true }),
      item({ checkKey: "publish_evaluate_clear", title: "Publish", status: "FAIL", blocking: true }),
      item({ checkKey: "commentary_present", title: "Commentary", status: "FAIL", blocking: true }),
    ];
    const r = evaluateCloseReadiness({
      items, openBlockingExceptions: 0, periodPublished: false, releaseId: null, wasReopened: false,
    });
    assert.equal(r.status, "BLOCKED");
    assert.equal(r.canFeedPublish, false);
  });

  await check("non-blocking open warning does not force BLOCKED alone", () => {
    const items = [
      item({ checkKey: "figures_present", title: "Figures", status: "PASS" }),
      item({ checkKey: "variance_opex_mom", title: "OpEx", status: "NEEDS_REVIEW", blocking: false, required: true }),
      item({ checkKey: "publish_evaluate_clear", title: "Publish", status: "FAIL", blocking: true }),
      item({ checkKey: "commentary_present", title: "Commentary", status: "PASS" }),
      item({ checkKey: "manual_unusual_entries", title: "Manual", status: "PASS", kind: "MANUAL", blocking: false }),
    ];
    // Still blocked by publish_evaluate — but non-blocking NEEDS_REVIEW alone wouldn't
    const onlyWarn = items.map((i) =>
      i.checkKey === "publish_evaluate_clear"
        ? { ...i, status: "PASS" as const, blocking: true }
        : i.checkKey === "variance_opex_mom"
          ? i
          : { ...i, status: "PASS" as const },
    );
    const r = evaluateCloseReadiness({
      items: onlyWarn, openBlockingExceptions: 0, periodPublished: false, releaseId: null, wasReopened: false,
    });
    // NEEDS_REVIEW on non-blocking keeps IN_PROGRESS (not READY)
    assert.ok(["IN_PROGRESS", "READY_FOR_REVIEW", "READY_TO_PUBLISH"].includes(r.status));
    assert.notEqual(r.status, "BLOCKED");
  });

  await check("hash changes detect stale inputs", () => {
    const a = hashPayload({ ar: 100 });
    const b = hashPayload({ ar: 150 });
    assert.notEqual(a, b);
    const fps1 = { ar: a, debt: "x" };
    const fps2 = { ar: b, debt: "x" };
    assert.notEqual(combineDeps(fps1, ["ar"]), combineDeps(fps2, ["ar"]));
    assert.equal(combineDeps(fps1, ["debt"]), combineDeps(fps2, ["debt"]));
  });

  await check("firm policy resolves with defaults", async () => {
    await withTempDb(async () => {
      const { clientId } = seedMinimal();
      const p = resolvePolicy(clientId);
      assert.ok(p.checkKeys.includes("gate_pass"));
      assert.ok(p.varianceRules.some((r) => r.metric === "payroll"));
    });
  });

  await check("start close + evaluate produces checklist", async () => {
    await withTempDb(async () => {
      const { clientId, periodId } = seedMinimal();
      const run = startOrGetCloseRun({ clientId, periodId, startedBy: "tester" });
      assert.ok(run.id);
      const items = listChecklist(run.id);
      assert.ok(items.length >= 10);
      assert.ok(items.some((i) => i.checkKey === "figures_present"));
    });
  });

  await check("waiver stays WAIVED not PASS", async () => {
    await withTempDb(async () => {
      const { clientId, periodId } = seedMinimal();
      const run = startOrGetCloseRun({ clientId, periodId, startedBy: "tester" });
      const item = listChecklist(run.id).find((i) => i.checkKey === "doc_payroll_approved")!;
      const after = waiveCheck({
        itemId: item.id, userId: "advisor", reason: "Schedule delayed — accepted for this month", role: "ADVISOR",
      });
      const waived = listChecklist(after.id).find((i) => i.id === item.id)!;
      assert.equal(waived.status, "WAIVED");
      assert.notEqual(waived.status, "PASS");
      assert.ok(waived.waiveReason);
    });
  });

  await check("bookkeeper cannot waive", async () => {
    await withTempDb(async () => {
      const { clientId, periodId } = seedMinimal();
      const run = startOrGetCloseRun({ clientId, periodId, startedBy: "tester" });
      const item = listChecklist(run.id)[0];
      assert.throws(
        () => waiveCheck({
          itemId: item.id, userId: "books", reason: "because I said so ok", role: "BOOKKEEPER",
        }),
        /ADMIN|ADVISOR|waive/i,
      );
    });
  });

  await check("stale review when payroll lines change", async () => {
    await withTempDb(async () => {
      const { clientId, periodId, entityId } = seedMinimal();
      // Approve payroll doc so recon/doc paths have something; focus on variance/figures hash
      const run = startOrGetCloseRun({ clientId, periodId, startedBy: "tester" });
      let items = listChecklist(run.id);
      const figures = items.find((i) => i.checkKey === "figures_present")!;
      // Force a reviewed PASS with current hash
      db().prepare(`
        UPDATE close_checklist_items SET status='PASS', reviewed_hash=input_hash, reviewed_at=?, reviewed_by='adv'
        WHERE id=?
      `).run(new Date().toISOString(), figures.id);
      // Mutate ledger
      db().prepare(`UPDATE pl_lines SET amount=amount+50 WHERE period_id=? AND category='REVENUE'`)
        .run(periodId);
      refreshCloseRun(run.id, "tester");
      items = listChecklist(run.id);
      const after = items.find((i) => i.checkKey === "figures_present")!;
      assert.equal(after.status, "STALE");
      // Unrelated debt check should not become STALE from revenue change if it was N/A or untouched
      const debt = items.find((i) => i.checkKey === "recon_debt")!;
      assert.notEqual(debt.status, "STALE");
      void entityId;
    });
  });

  await check("figures_present evaluates PASS with seeded revenue", async () => {
    await withTempDb(async () => {
      const { clientId, periodId } = seedMinimal();
      const r = evaluateCloseCheck("figures_present", clientId, periodId);
      assert.equal(r.status, "PASS");
    });
  });

  await check("review of NEEDS_REVIEW sets PASS with reviewed_hash", async () => {
    await withTempDb(async () => {
      const { clientId, periodId } = seedMinimal();
      // Spike payroll MoM above 10% — prior 40 wages+taxes vs current 60+...
      const run = startOrGetCloseRun({ clientId, periodId, startedBy: "tester" });
      let items = listChecklist(run.id);
      let payrollVar = items.find((i) => i.checkKey === "variance_payroll_mom")!;
      // If not NEEDS_REVIEW, force it
      if (payrollVar.status !== "NEEDS_REVIEW") {
        db().prepare(`UPDATE close_checklist_items SET status='NEEDS_REVIEW', input_hash='abc' WHERE id=?`)
          .run(payrollVar.id);
      }
      reviewCheck({ itemId: payrollVar.id, userId: "adv", note: "OT spike confirmed" });
      items = listChecklist(run.id);
      payrollVar = items.find((i) => i.checkKey === "variance_payroll_mom")!;
      assert.equal(payrollVar.status, "PASS");
      assert.ok(payrollVar.reviewedHash);
      assert.ok(getCloseRun(run.id));
    });
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
