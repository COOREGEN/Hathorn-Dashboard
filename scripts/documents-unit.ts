/**
 * Offline Document Intelligence unit checks.
 * Run: npm run documents:test
 */
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, rmSync } from "fs";
import path from "path";
import { parseDelimitedText, parseNativeBuffer } from "../lib/documents/native-parser";
import { classifyDocument } from "../lib/documents/classify";
import { extractStructured } from "../lib/documents/extract";
import { documentIntelligenceStatus } from "../lib/documents/docling-adapter";
import {
  safeOriginalFilename, sanitizeId, documentFilePath, sha256Buffer, storeDocumentFile,
} from "../lib/documents/storage";
import { validateUpload } from "../lib/documents/validate";

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void | Promise<void>) {
  const run = async () => {
    try {
      await fn();
      passed += 1;
      console.log(`  ✓ ${name}`);
    } catch (e) {
      failed += 1;
      console.error(`  ✗ ${name}`);
      console.error(`    ${(e as Error).message}`);
    }
  };
  return run();
}

async function main() {
  console.log("\n── Document Intelligence unit ──");

  await check("Docling/worker default disabled", () => {
    delete process.env.DOCUMENT_INTELLIGENCE_ENABLED;
    const st = documentIntelligenceStatus();
    assert.equal(st.enabled, false);
  });

  await check("path traversal rejected in filename", () => {
    const name = safeOriginalFilename("../../etc/passwd");
    assert.equal(name, "passwd");
    assert.throws(() => sanitizeId("../x"));
    assert.throws(() => sanitizeId("a/b"));
  });

  await check("storage path stays under documents root", () => {
    const prev = process.env.DATA_DIR;
    const tmp = path.join(process.cwd(), "data", "_doc_unit_tmp");
    process.env.DATA_DIR = tmp;
    try {
      mkdirSync(tmp, { recursive: true });
      const p = documentFilePath("client1", "docabc123def", ".csv");
      assert.ok(p.includes(`${path.sep}documents${path.sep}client1${path.sep}`));
      assert.ok(!p.includes(".."));
    } finally {
      process.env.DATA_DIR = prev;
      try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
    }
  });

  await check("rejects disallowed file types", async () => {
    const evil = {
      name: "payload.exe",
      type: "application/octet-stream",
      size: 4,
      arrayBuffer: async () => new Uint8Array([0x4d, 0x5a, 0x90, 0x00]).buffer,
    };
    await assert.rejects(() => validateUpload(evil as any), /not allowed|type/i);
  });

  await check("payroll CSV extracts with high confidence", () => {
    const text = readFileSync("samples/documents/payroll-register.csv", "utf8");
    const parsed = parseDelimitedText(text, "payroll-register.csv");
    const type = classifyDocument("payroll-register.csv", parsed);
    assert.equal(type, "PAYROLL_REGISTER");
    const draft = extractStructured(type, parsed);
    assert.equal(draft.confidence, "HIGH_CONFIDENCE");
    assert.ok(draft.totals.grossPay != null && draft.totals.grossPay > 100000);
    assert.equal(draft.lineItems.length, 5);
  });

  await check("AR schedule extracts balances", () => {
    const text = readFileSync("samples/documents/ar-schedule.csv", "utf8");
    const parsed = parseDelimitedText(text, "ar-schedule.csv");
    const type = classifyDocument("ar-aging.csv", parsed);
    assert.equal(type, "AR_SCHEDULE");
    const draft = extractStructured(type, parsed);
    assert.ok((draft.totals.balance || 0) > 0);
  });

  await check("debt schedule extracts outstanding", () => {
    const text = readFileSync("samples/documents/debt-schedule.csv", "utf8");
    const parsed = parseDelimitedText(text, "debt-schedule.csv");
    const draft = extractStructured("DEBT_SCHEDULE", parsed);
    assert.ok((draft.totals.currentBalance || 0) > 100000);
  });

  await check("financial statement marked needs review (not trusted actuals)", () => {
    const text = readFileSync("samples/documents/income-statement.csv", "utf8");
    const parsed = parseDelimitedText(text, "income-statement.csv");
    const type = classifyDocument("P&L income statement.csv", parsed);
    assert.equal(type, "FINANCIAL_STATEMENT");
    const draft = extractStructured(type, parsed);
    assert.equal(draft.confidence, "NEEDS_REVIEW");
    assert.ok(draft.warnings.some((w) => /not update|draft|ledger/i.test(w)));
  });

  await check("sha256 is stable for duplicate detection", () => {
    const a = sha256Buffer(Buffer.from("same-bytes"));
    const b = sha256Buffer(Buffer.from("same-bytes"));
    assert.equal(a, b);
    assert.notEqual(a, sha256Buffer(Buffer.from("other")));
  });

  await check("native parser does not invent PDF tables", () => {
    const parsed = parseNativeBuffer(Buffer.from("%PDF-1.4"), "x.pdf", "application/pdf");
    assert.equal(parsed.tables.length, 0);
    assert.ok(parsed.warnings.length);
  });

  await check("store + hash round-trip", () => {
    const prev = process.env.DATA_DIR;
    const tmp = path.join(process.cwd(), "data", "_doc_unit_store");
    process.env.DATA_DIR = tmp;
    try {
      const bytes = Buffer.from("a,b\n1,2\n");
      const { absolutePath, storageReference } = storeDocumentFile({
        clientId: "c1", documentId: "d1d1d1d1d1d1", ext: ".csv", bytes,
      });
      assert.ok(storageReference.startsWith("documents/"));
      assert.ok(!storageReference.includes(tmp));
      assert.equal(readFileSync(absolutePath).toString(), bytes.toString());
    } finally {
      process.env.DATA_DIR = prev;
      try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
    }
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main();
