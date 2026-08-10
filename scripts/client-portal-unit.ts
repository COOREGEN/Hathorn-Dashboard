/**
 * Phase 11 — Client portal visibility / snapshot unit tests.
 * Run: npm run client-portal:test
 */
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "fs";
import path from "path";
import { closeDb, db, uid } from "../lib/db";
import { hashPassword } from "../lib/auth";
import { createFirm } from "../lib/tenancy";
import {
  createInsight,
  setInsightStatus,
  listInsights,
  createQuestion,
  answerQuestion,
  listQuestions,
  createMonthlyReport,
  listReports,
  getPublishedReport,
  reportContentFingerprint,
  shareScenario,
  listSharedScenarios,
  setDocumentVisibility,
  assertClientCanAccessDocument,
  listClientVisibleDocuments,
  createDocumentRequest,
  fulfillDocumentRequest,
  getPortalConfig,
} from "../lib/client-portal";
import { CLIENT_TOOLS } from "../lib/ai/copilot/permissions";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(e);
  }
}

function withTempDb(fn: () => void) {
  const prev = process.env.DATA_DIR;
  const tmp = path.join(process.cwd(), "data", `_portal_unit_${process.pid}_${Date.now()}`);
  process.env.DATA_DIR = tmp;
  mkdirSync(tmp, { recursive: true });
  closeDb();
  try { fn(); } finally {
    closeDb();
    process.env.DATA_DIR = prev;
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
  }
}

function seedClient(firmId: string) {
  const clientId = uid();
  db().prepare(`
    INSERT INTO clients (id, firm_id, name, slug, template, brand_primary, brand_accent, logo_text)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(clientId, firmId, "Portal Co", `pc-${clientId.slice(0, 6)}`, "editorial", "#2C504D", "#DB5928", "P");
  const entityId = uid();
  db().prepare("INSERT INTO entities (id,client_id,name,status) VALUES (?,?,?,?)")
    .run(entityId, clientId, "Main", "ACTIVE");
  const periodId = uid();
  db().prepare(`
    INSERT INTO periods (id,client_id,year,month,status,published_at,days_covered,accounting_basis,currency,reconciled,gate_pass)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(periodId, clientId, 2026, 4, "PUBLISHED", "2026-05-10", 30, "ACCRUAL", "USD", 1, 1);
  db().prepare(`INSERT INTO pl_lines (id,period_id,entity_id,category,label,amount) VALUES (?,?,?,?,?,?)`)
    .run(uid(), periodId, entityId, "REVENUE", "Services", 100);
  db().prepare(`INSERT INTO pl_lines (id,period_id,entity_id,category,label,amount) VALUES (?,?,?,?,?,?)`)
    .run(uid(), periodId, entityId, "DIRECT_COST", "Labor", 55);
  db().prepare(`INSERT INTO cash_balances (id,period_id,operating,reserve) VALUES (?,?,?,?)`)
    .run(uid(), periodId, 40, 10);
  db().prepare(`INSERT INTO story_notes (id,period_id,slot,tone,heading,body,sort) VALUES (?,?,?,?,?,?,?)`)
    .run(uid(), periodId, "WHAT_CHANGED", "info", "What changed", "Revenue held; labor rose.", 0);
  // Minimal release snapshot so lockedStatements works
  const snap = {
    period: { id: periodId, year: 2026, month: 4, label: "Apr 2026", daysCovered: 30 },
    figures: {
      revenue: 100, directCost: 55, grossProfit: 45, grossMarginPct: 45,
      opex: 10, netIncome: 35, netMarginPct: 35, laborPct: 55, totalPayroll: 55,
      otPremium: 0, arTotal: 0, cash: { operating: 40, reserve: 10, total: 50 },
    },
    entities: [],
    receivables: [],
    commentary: [{ slot: "WHAT_CHANGED", tone: "info", heading: "What changed", body: "Revenue held; labor rose." }],
  };
  db().prepare(`
    INSERT INTO release_records
      (id, client_id, period_id, version, status, snapshot, published_by, published_at, checksum)
    VALUES (?,?,?,1,'ACTIVE',?,?,datetime('now'),?)
  `).run(uid(), clientId, periodId, JSON.stringify(snap), "seed", "seed");
  return { clientId, periodId };
}

console.log("\n=== Client portal unit tests ===\n");

test("client tools exclude internal systems", () => {
  const forbidden = [
    "getExceptions", "getCloseStatus", "getFinancialSummary",
    "getFinancialSignals", "searchDocuments", "getPlanningScenario",
  ];
  for (const t of forbidden) assert.ok(!(CLIENT_TOOLS as readonly string[]).includes(t));
  assert.ok((CLIENT_TOOLS as readonly string[]).includes("getPublishedRelease"));
  assert.ok((CLIENT_TOOLS as readonly string[]).includes("getClientInsights"));
});

test("draft insight hidden; published visible", () => {
  withTempDb(() => {
    const firm = createFirm({ name: "Firm A", slug: `a-${uid().slice(0, 6)}` });
    const { clientId, periodId } = seedClient(firm.id);
    const insight = createInsight({
      clientId, periodId, title: "Draft only", body: "Internal draft", actorId: "u1",
    });
    assert.equal(listInsights({ clientId, forClient: true }).length, 0);
    setInsightStatus({
      insightId: insight.id, firmId: firm.id, status: "PUBLISHED", actorId: "u1",
    });
    assert.equal(listInsights({ clientId, forClient: true }).length, 1);
  });
});

test("document visibility default INTERNAL", () => {
  withTempDb(() => {
    const firm = createFirm({ name: "Firm A", slug: `a-${uid().slice(0, 6)}` });
    const { clientId } = seedClient(firm.id);
    const docId = uid();
    db().prepare(`
      INSERT INTO source_documents
        (id, client_id, document_type, original_filename, mime_type, file_size,
         storage_reference, sha256, status, uploaded_by, visibility)
      VALUES (?,?, 'OTHER', 'secret.csv', 'text/csv', 10, 'documents/x', 'abc', 'UPLOADED', 'u1', 'INTERNAL')
    `).run(docId, clientId);
    assert.equal(assertClientCanAccessDocument(docId, clientId), false);
    assert.equal(listClientVisibleDocuments(clientId).length, 0);
    setDocumentVisibility({
      documentId: docId, firmId: firm.id, visibility: "CLIENT_VISIBLE", actorId: "u1",
    });
    assert.equal(assertClientCanAccessDocument(docId, clientId), true);
  });
});

test("management question answer is not auto-verified", () => {
  withTempDb(() => {
    const firm = createFirm({ name: "Firm A", slug: `a-${uid().slice(0, 6)}` });
    const { clientId, periodId } = seedClient(firm.id);
    const q = createQuestion({
      clientId, periodId, question: "Was labor temporary?", actorId: "u1", publish: true,
    });
    const userId = uid();
    db().prepare(
      "INSERT INTO users (id,email,password_hash,name,role,client_id) VALUES (?,?,?,?,?,?)",
    ).run(userId, "c@t.test", hashPassword("ledger2026x"), "Client", "CLIENT", clientId);
    const answered = answerQuestion({
      questionId: q.id, clientId, userId, body: "Yes, three contractors.",
    });
    assert.equal(answered?.status, "ANSWERED");
    assert.equal(answered?.responseReviewedAt, null);
    assert.ok(listQuestions({ clientId, forClient: true }).some((x) => x.id === q.id));
  });
});

test("report snapshot stable after brand change", () => {
  withTempDb(() => {
    const firm = createFirm({ name: "Firm A", slug: `a-${uid().slice(0, 6)}` });
    const { clientId, periodId } = seedClient(firm.id);
    const report = createMonthlyReport({
      clientId, periodId, actorId: "u1", publish: true,
    });
    const before = reportContentFingerprint(report.id);
    const frozenName = report.branding.firmName;
    db().prepare("UPDATE firms SET name=?, brand_primary=? WHERE id=?")
      .run("Renamed Firm", "#111111", firm.id);
    const again = getPublishedReport(report.id, clientId)!;
    assert.equal(reportContentFingerprint(report.id), before);
    assert.equal(again.branding.firmName, frozenName);
    assert.equal(listReports({ clientId, forClient: true }).length, 1);
  });
});

test("cross-client report denied", () => {
  withTempDb(() => {
    const firm = createFirm({ name: "Firm A", slug: `a-${uid().slice(0, 6)}` });
    const a = seedClient(firm.id);
    const b = seedClient(firm.id);
    const report = createMonthlyReport({
      clientId: a.clientId, periodId: a.periodId, actorId: "u1", publish: true,
    });
    assert.equal(getPublishedReport(report.id, b.clientId), null);
  });
});

test("portal config defaults", () => {
  withTempDb(() => {
    const firm = createFirm({ name: "Firm A", slug: `a-${uid().slice(0, 6)}` });
    const { clientId } = seedClient(firm.id);
    const cfg = getPortalConfig(clientId);
    assert.equal(cfg.showInsights, true);
    assert.equal(cfg.showReports, true);
  });
});

test("document request fulfill requires matching client", () => {
  withTempDb(() => {
    const firm = createFirm({ name: "Firm A", slug: `a-${uid().slice(0, 6)}` });
    const a = seedClient(firm.id);
    const b = seedClient(firm.id);
    const req = createDocumentRequest({
      clientId: a.clientId, title: "Aging", actorId: "u1",
    });
    const docId = uid();
    db().prepare(`
      INSERT INTO source_documents
        (id, client_id, document_type, original_filename, mime_type, file_size,
         storage_reference, sha256, status, uploaded_by, visibility)
      VALUES (?,?, 'OTHER', 'a.csv', 'text/csv', 10, 'documents/x', 'abc', 'UPLOADED', 'u1', 'INTERNAL')
    `).run(docId, b.clientId);
    assert.equal(
      fulfillDocumentRequest({
        requestId: req.id, clientId: a.clientId, documentId: docId, userId: "u2",
      }),
      null,
    );
  });
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
