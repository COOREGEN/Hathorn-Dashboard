/**
 * Security regression unit checks (offline / synthetic data only).
 * Run: npm run security:test
 */
import assert from "node:assert/strict";
import { sanitizeAiContext, sanitizeAiPayload } from "../lib/ai/sanitize-context";
import { sanitizeForPrompt } from "../lib/ai/copilot/citations";
import { redactObject } from "../lib/ops/redact";
import { allowDemoSeed, resolveAppEnv } from "../lib/ops/env";
import { documentFilePath, storeDocumentFile, documentsRoot } from "../lib/documents/storage";
import { rmSync, mkdirSync, existsSync } from "fs";
import path from "path";

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

async function main() {
  console.log("\nSecurity unit tests (synthetic only)\n");

  await check("SSN patterns redacted before AI", () => {
    const r = sanitizeAiContext("Employee SSN 123-45-6789 on file");
    assert.match(r.text, /REDACTED_SSN/);
    assert.ok(!r.text.includes("123-45-6789"));
    assert.ok(r.categories.includes("SSN_ITIN"));
  });

  await check("bank account labels redacted", () => {
    const r = sanitizeAiContext("Wire to account number 987654321012");
    assert.match(r.text, /REDACTED_BANK/);
  });

  await check("secrets and enc blobs redacted", () => {
    const r = sanitizeAiContext("token Bearer abc.def.ghi and enc:v1:AAAA");
    assert.ok(r.text.includes("REDACTED_SECRET"));
  });

  await check("sanitizeAiPayload strips secret keys", () => {
    const out = sanitizeAiPayload({
      revenue: 100,
      password: "secret",
      nested: { refresh_token: "xyz", note: "ok" },
    }) as any;
    assert.equal(out.password, "[REDACTED]");
    assert.equal(out.nested.refresh_token, "[REDACTED]");
    assert.equal(out.nested.note, "ok");
    assert.equal(out.revenue, 100);
  });

  await check("sanitizeForPrompt uses AI sanitation", () => {
    const t = sanitizeForPrompt("SSN 111-22-3333 <script>x</script>");
    assert.ok(!t.includes("111-22-3333"));
    assert.ok(!t.includes("<script>"));
  });

  await check("redactObject covers ssn and tokens", () => {
    const out = redactObject({ ssn: "123", api_key: "k", note: "safe" });
    assert.equal(out.ssn, "[REDACTED]");
    assert.equal(out.api_key, "[REDACTED]");
    assert.equal(out.note, "safe");
  });

  await check("PRODUCTION never allows demo seed", () => {
    const prev = process.env.APP_ENV;
    const prevAllow = process.env.ALLOW_DEMO_SEED;
    const prevLocal = process.env.LEDGER_ALLOW_LOCAL_PROD;
    process.env.APP_ENV = "PRODUCTION";
    process.env.ALLOW_DEMO_SEED = "1";
    process.env.LEDGER_ALLOW_LOCAL_PROD = "1";
    assert.equal(resolveAppEnv(), "PRODUCTION");
    assert.equal(allowDemoSeed(), false);
    process.env.APP_ENV = prev;
    if (prevAllow === undefined) delete process.env.ALLOW_DEMO_SEED;
    else process.env.ALLOW_DEMO_SEED = prevAllow;
    if (prevLocal === undefined) delete process.env.LEDGER_ALLOW_LOCAL_PROD;
    else process.env.LEDGER_ALLOW_LOCAL_PROD = prevLocal;
  });

  await check("quarantine storage path is under documents/quarantine", () => {
    const prev = process.env.DATA_DIR;
    const tmp = path.join(process.cwd(), "data", `_sec_unit_${process.pid}`);
    process.env.DATA_DIR = tmp;
    mkdirSync(tmp, { recursive: true });
    try {
      const { storageReference, absolutePath } = storeDocumentFile({
        clientId: "client_abc123",
        documentId: "doc_abc123def",
        ext: ".csv",
        bytes: Buffer.from("a,b\n1,2\n"),
        quarantine: true,
      });
      assert.ok(storageReference.includes("/quarantine/"));
      assert.ok(absolutePath.includes(`${path.sep}quarantine${path.sep}`));
      assert.ok(existsSync(absolutePath));
      const normal = documentFilePath("client_abc123", "doc_abc123def", ".csv");
      assert.ok(!normal.includes(`${path.sep}quarantine${path.sep}`));
    } finally {
      process.env.DATA_DIR = prev;
      try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
    }
  });

  await check("financial amounts are not destroyed by sanitation", () => {
    const r = sanitizeAiContext("Revenue was $190.9K and NI 25.1");
    assert.ok(r.text.includes("190.9"));
    assert.ok(r.text.includes("25.1"));
  });

  console.log(`\nSecurity: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
