/**
 * Offline Integration Hub unit checks.
 * Run: npm run integrations:test
 */
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "fs";
import path from "path";
import { closeDb, db, uid } from "../lib/db";
import {
  computeHealth, classifyProviderError, sanitizeErrorMessage,
  ensureClientIntegrations, listConnections, publicConnection,
  syncConnection, listCanonical,
} from "../lib/integrations";

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


function ensureTestFirm() {
  const existing: any = db().prepare("SELECT id FROM firms WHERE slug='test-firm'").get();
  if (existing) return existing.id as string;
  const id = uid();
  db().prepare(`INSERT INTO firms (id, name, slug, status, brand_primary, brand_accent, logo_text, report_footer)
    VALUES (?,?,?,'ACTIVE',?,?,?,?)`).run(id, "Test Firm", "test-firm", "#2C504D", "#DB5928", "TEST", "Prepared by Test Firm");
  return id;
}

function withTempDb(fn: () => Promise<void>) {
  const prev = process.env.DATA_DIR;
  const tmp = path.join(process.cwd(), "data", `_integ_unit_${process.pid}_${Date.now()}`);
  process.env.DATA_DIR = tmp;
  mkdirSync(tmp, { recursive: true });
  closeDb();
  return fn().finally(() => {
    closeDb();
    process.env.DATA_DIR = prev;
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
  });
}

function seedClient(): string {
  const id = uid();
  const firmId = ensureTestFirm();
  db().prepare(`
    INSERT INTO clients (id, firm_id, name, slug, template, brand_primary, brand_accent, logo_text)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(id, firmId, "Integ Test Co", `integ-${id.slice(0, 8)}`, "editorial", "#2C504D", "#DB5928", "INTEG");
  return id;
}

async function main() {
  console.log("\n── Integration Hub unit ──");

  await check("health: never synced → STALE", () => {
    assert.equal(computeHealth({
      status: "CONNECTED", lastSuccessfulSyncAt: null, lastErrorCode: null,
    }), "STALE");
  });

  await check("health: old success → STALE", () => {
    assert.equal(computeHealth({
      status: "CONNECTED",
      lastSuccessfulSyncAt: "2020-01-01T00:00:00.000Z",
      lastErrorCode: null,
    }), "STALE");
  });

  await check("health: reconnect required", () => {
    assert.equal(computeHealth({
      status: "RECONNECT_REQUIRED",
      lastSuccessfulSyncAt: new Date().toISOString(),
      lastErrorCode: "AUTH",
    }), "RECONNECT_REQUIRED");
  });

  await check("classify 429 as RATE_LIMIT", () => {
    assert.equal(classifyProviderError("too many requests", 429).errorClass, "RATE_LIMIT");
  });

  await check("classify revoked as AUTH", () => {
    assert.equal(classifyProviderError("invalid_grant: refresh token revoked").errorClass, "AUTH");
  });

  await check("sanitize redacts bearer tokens", () => {
    const s = sanitizeErrorMessage("Bearer abc.def.ghi failed refresh_token=secretvalue");
    assert.ok(!/abc\.def\.ghi/.test(s));
    assert.ok(!/secretvalue/.test(s));
    assert.ok(/redacted/i.test(s));
  });

  await check("mock sync is idempotent (no uncontrolled duplicates)", async () => {
    await withTempDb(async () => {
      const clientId = seedClient();
      ensureClientIntegrations(clientId, "tester");
      const mock = listConnections(clientId).find((c) => c.provider === "mock")!;
      const a = await syncConnection({
        connectionId: mock.id, clientId, triggeredBy: "tester",
      });
      assert.equal(a.run.status, "SUCCESS");
      assert.ok(a.run.recordsCreated > 0);

      const b = await syncConnection({
        connectionId: mock.id, clientId, triggeredBy: "tester",
      });
      assert.equal(b.run.status, "SUCCESS");
      assert.ok(b.run.recordsSkipped > 0, "second sync should skip identical fixtures");
      assert.equal(b.run.recordsCreated, 0);

      const canon = listCanonical(clientId, "REVENUE_LINE");
      assert.equal(canon.length, 1);
    });
  });

  await check("failed sync records FAILED without corrupting prior data", async () => {
    await withTempDb(async () => {
      const clientId = seedClient();
      ensureClientIntegrations(clientId, "tester");
      const mock = listConnections(clientId).find((c) => c.provider === "mock")!;
      await syncConnection({ connectionId: mock.id, clientId, triggeredBy: "tester" });
      const before = listCanonical(clientId).length;

      const fail = await syncConnection({
        connectionId: mock.id, clientId, triggeredBy: "tester",
        importPayload: {
          filename: "x", sha256: "x", docType: "FORCE_FAIL", force: "fail",
        },
      });
      assert.equal(fail.run.status, "FAILED");
      assert.equal(listCanonical(clientId).length, before);
      const conn = listConnections(clientId).find((c) => c.provider === "mock")!;
      assert.equal(conn.status, "ERROR");
    });
  });

  await check("auth failure → RECONNECT_REQUIRED", async () => {
    await withTempDb(async () => {
      const clientId = seedClient();
      ensureClientIntegrations(clientId, "tester");
      const mock = listConnections(clientId).find((c) => c.provider === "mock")!;
      const out = await syncConnection({
        connectionId: mock.id, clientId, triggeredBy: "tester",
        importPayload: {
          filename: "x", sha256: "x", docType: "FORCE_AUTH_FAIL", force: "auth",
        },
      });
      assert.equal(out.run.status, "FAILED");
      assert.equal(out.run.errorCode, "AUTH");
      const conn = listConnections(clientId).find((c) => c.provider === "mock")!;
      assert.equal(conn.status, "RECONNECT_REQUIRED");
      assert.equal(conn.health, "RECONNECT_REQUIRED");
    });
  });

  await check("partial failure → PARTIAL (not silent SUCCESS)", async () => {
    await withTempDb(async () => {
      const clientId = seedClient();
      ensureClientIntegrations(clientId, "tester");
      const mock = listConnections(clientId).find((c) => c.provider === "mock")!;
      const out = await syncConnection({
        connectionId: mock.id, clientId, triggeredBy: "tester",
        importPayload: {
          filename: "x", sha256: "x", docType: "PARTIAL_FAIL", force: "partial",
        },
      });
      assert.equal(out.run.status, "PARTIAL");
      assert.ok(out.run.recordsSkipped >= 1);
      const conn = listConnections(clientId).find((c) => c.provider === "mock")!;
      assert.equal(conn.status, "DEGRADED");
    });
  });

  await check("file import idempotent by sha256", async () => {
    await withTempDb(async () => {
      const clientId = seedClient();
      ensureClientIntegrations(clientId, "tester");
      const file = listConnections(clientId).find((c) => c.provider === "file")!;
      const payload = {
        filename: "pnl.csv", sha256: "deadbeefcafe", docType: "PNL", rowCount: 4,
      };
      const a = await syncConnection({
        connectionId: file.id, clientId, triggeredBy: "tester", importPayload: payload,
      });
      assert.equal(a.run.status, "SUCCESS");
      assert.ok(a.run.recordsCreated >= 1);
      const b = await syncConnection({
        connectionId: file.id, clientId, triggeredBy: "tester", importPayload: payload,
      });
      assert.equal(b.run.status, "SUCCESS");
      assert.ok(b.run.recordsSkipped >= 1);
    });
  });

  await check("publicConnection never exposes secret-like metadata keys", () => {
    const pub = publicConnection({
      id: "c1", clientId: "x", provider: "mock",
      externalAccountId: null, externalAccountName: null,
      status: "CONNECTED", connectedBy: null, connectedAt: null,
      lastSuccessfulSyncAt: null, lastAttemptedSyncAt: null,
      lastErrorCode: null, lastErrorMessage: null,
      metadata: {
        realmId: "123",
        access_token: "SECRET",
        refresh_token: "SECRET2",
        api_secret: "SECRET3",
        note: "ok",
      },
      health: "STALE",
      capabilities: ["PROFIT_AND_LOSS"],
    });
    const json = JSON.stringify(pub);
    assert.ok(!/SECRET/.test(json));
    assert.ok(!/"access_token"/.test(json));
    assert.ok(!/"refresh_token"/.test(json));
    assert.equal((pub.metadata as any).note, "ok");
    assert.equal((pub.metadata as any).realmId, "123");
  });

  await check("concurrent sync rejected", async () => {
    await withTempDb(async () => {
      const clientId = seedClient();
      ensureClientIntegrations(clientId, "tester");
      const mock = listConnections(clientId).find((c) => c.provider === "mock")!;
      db().prepare(`
        INSERT INTO integration_sync_runs
          (id, connection_id, client_id, provider, sync_type, status, started_at, triggered_by)
        VALUES (?,?,?,?,?,'RUNNING',datetime('now'),?)
      `).run(uid(), mock.id, clientId, "mock", "MANUAL", "tester");
      await assert.rejects(
        () => syncConnection({ connectionId: mock.id, clientId, triggeredBy: "tester" }),
        /already in progress/i,
      );
    });
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
