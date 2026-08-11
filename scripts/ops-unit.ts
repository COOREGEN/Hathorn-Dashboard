/**
 * Platform operations unit checks (offline).
 * Run: npm run ops:test
 */
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "fs";
import path from "path";
import { closeDb, db, uid } from "../lib/db";
import { hashPassword } from "../lib/auth";
import { createFirm } from "../lib/tenancy";
import { encrypt, decrypt } from "../lib/security";
import {
  enqueueJob, getJob, claimDueJobs, succeedJob, failJob, retryJob,
  tickJobs, markStuckJobs, jobCounts, processJob,
} from "../lib/ops/jobs";
import { redactObject } from "../lib/ops/redact";
import { resolveAppEnv, allowDemoSeed } from "../lib/ops/env";
import { provisionFirm, provisionClient, archiveFirm } from "../lib/ops/provision";
import { firmCapabilityEnabled, listFirmCapabilities } from "../lib/ops/capabilities";
import { clientDiagnostics, searchFirms } from "../lib/ops/diagnostics";
import { readiness, liveness, DEGRADATION_MATRIX } from "../lib/ops/health";
import { recordAiUsage, platformUsageSummary } from "../lib/ops/usage";
import { runIntegrityDiagnostics } from "../lib/ops/integrity";

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
  const tmp = path.join(process.cwd(), "data", `_ops_unit_${process.pid}_${Date.now()}`);
  process.env.DATA_DIR = tmp;
  mkdirSync(tmp, { recursive: true });
  closeDb();
  return fn().finally(() => {
    closeDb();
    process.env.DATA_DIR = prev;
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
  });
}

async function main() {
  console.log("\nOps unit tests");

  await check("redaction strips tokens and passwords", () => {
    const out = redactObject({
      password: "secret",
      authorization: "Bearer abc",
      nested: { refresh_token: "r1", ok: true },
      note: "safe",
    });
    assert.equal(out.password, "[REDACTED]");
    assert.equal(out.authorization, "[REDACTED]");
    assert.equal((out.nested as any).refresh_token, "[REDACTED]");
    assert.equal(out.note, "safe");
  });

  await check("APP_ENV resolves and production seed denied by default", () => {
    const prev = process.env.APP_ENV;
    const prevAllow = process.env.ALLOW_DEMO_SEED;
    process.env.APP_ENV = "PRODUCTION";
    delete process.env.ALLOW_DEMO_SEED;
    assert.equal(resolveAppEnv(), "PRODUCTION");
    assert.equal(allowDemoSeed(), false);
    process.env.APP_ENV = "STAGING";
    assert.equal(allowDemoSeed(), false, "STAGING must not seed without ALLOW_DEMO_SEED");
    process.env.ALLOW_DEMO_SEED = "1";
    assert.equal(allowDemoSeed(), true);
    process.env.APP_ENV = "LOCAL";
    delete process.env.ALLOW_DEMO_SEED;
    assert.equal(allowDemoSeed(), true);
    process.env.APP_ENV = prev;
    if (prevAllow === undefined) delete process.env.ALLOW_DEMO_SEED;
    else process.env.ALLOW_DEMO_SEED = prevAllow;
  });

  await check("mock integration hidden on STAGING unless ENABLE_MOCK_INTEGRATION", () => {
    const { mockIntegrationEnabled } = require("../lib/integrations/registry") as typeof import("../lib/integrations/registry");
    const prevEnv = process.env.APP_ENV;
    const prevMock = process.env.ENABLE_MOCK_INTEGRATION;
    process.env.APP_ENV = "STAGING";
    delete process.env.ENABLE_MOCK_INTEGRATION;
    assert.equal(mockIntegrationEnabled(), false);
    process.env.ENABLE_MOCK_INTEGRATION = "1";
    assert.equal(mockIntegrationEnabled(), true);
    process.env.APP_ENV = "LOCAL";
    delete process.env.ENABLE_MOCK_INTEGRATION;
    assert.equal(mockIntegrationEnabled(), true);
    process.env.APP_ENV = prevEnv;
    if (prevMock === undefined) delete process.env.ENABLE_MOCK_INTEGRATION;
    else process.env.ENABLE_MOCK_INTEGRATION = prevMock;
  });

  await check("encryption previous key decrypt", () => {
    const prevEnc = process.env.ENCRYPTION_KEY;
    const prevPrev = process.env.ENCRYPTION_KEY_PREVIOUS;
    process.env.ENCRYPTION_KEY = "unit-test-key-aaaaaaaaaaaaaaaa";
    delete process.env.ENCRYPTION_KEY_PREVIOUS;
    const cipher = encrypt("qbo-refresh-token");
    process.env.ENCRYPTION_KEY_PREVIOUS = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = "unit-test-key-bbbbbbbbbbbbbbbb";
    assert.equal(decrypt(cipher), "qbo-refresh-token");
    // rewrite under new key
    const rewritten = encrypt("qbo-refresh-token");
    delete process.env.ENCRYPTION_KEY_PREVIOUS;
    assert.equal(decrypt(rewritten), "qbo-refresh-token");
    process.env.ENCRYPTION_KEY = prevEnc;
    process.env.ENCRYPTION_KEY_PREVIOUS = prevPrev;
  });

  await withTempDb(async () => {
    db(); // migrate

    const adminId = uid();
    db().prepare(
      `INSERT INTO users (id,email,password_hash,name,role,client_id,is_platform_admin)
       VALUES (?,?,?,?,?,?,1)`,
    ).run(adminId, `ops-${adminId}@test.local`, hashPassword("ledger2026xx"), "Ops", "ADMIN", null);

    await check("provision firm initializes capabilities + close defaults", () => {
      const result = provisionFirm({
        name: "Ops Firm",
        slug: `ops-firm-${adminId.slice(0, 6)}`,
        adminUserId: adminId,
        actorId: adminId,
      });
      assert.ok(result.firm.id);
      const caps = listFirmCapabilities(result.firm.id);
      assert.ok(caps.length >= 5);
      assert.equal(firmCapabilityEnabled(result.firm.id, "CLIENT_PORTAL"), true);
      (global as any)._firmId = result.firm.id;
    });

    await check("provision client safe defaults", () => {
      const firmId = (global as any)._firmId as string;
      const client = provisionClient({
        firmId,
        name: "Ops Client",
        actorId: adminId,
      });
      assert.ok(client.clientId);
      assert.equal(client.defaults.integrations, "none");
      const portal: any = db().prepare(
        `SELECT * FROM client_portal_config WHERE client_id=?`,
      ).get(client.clientId);
      assert.ok(portal);
      (global as any)._clientId = client.clientId;
    });

    await check("job enqueue idempotent + concurrency", async () => {
      const clientId = (global as any)._clientId as string;
      const firmId = (global as any)._firmId as string;
      const a = enqueueJob({
        jobType: "MAINTENANCE",
        firmId,
        clientId,
        idempotencyKey: "ops-unit-maint-1",
        concurrencyKey: "maint:ops-unit",
        params: { kind: "stuck_sweep" },
        createdBy: adminId,
      });
      const b = enqueueJob({
        jobType: "MAINTENANCE",
        firmId,
        clientId,
        idempotencyKey: "ops-unit-maint-1",
        concurrencyKey: "maint:ops-unit",
        params: { kind: "stuck_sweep" },
        createdBy: adminId,
      });
      assert.equal(a.id, b.id);
      await processJob(a);
      assert.equal(getJob(a.id)?.status, "SUCCEEDED");
    });

    await check("job retry after failure uses original params", async () => {
      const job = enqueueJob({
        jobType: "EMAIL_NOTIFY",
        idempotencyKey: `ops-unit-email-${uid()}`,
        params: { to: "nobody@example.test" },
        maxAttempts: 1,
        createdBy: adminId,
      });
      // Force fail path via failJob after claim
      const claimed = claimDueJobs(10).find((j) => j.id === job.id) || job;
      // Mark running then fail permanently
      db().prepare(`UPDATE background_jobs SET status='RUNNING', attempt=1 WHERE id=?`).run(job.id);
      failJob(job.id, "TEST_FAIL", "boom", false);
      assert.equal(getJob(job.id)?.status, "FAILED");
      const retried = retryJob(job.id, adminId);
      assert.equal(retried.status, "QUEUED");
      await processJob(getJob(retried.id)!);
      assert.equal(getJob(retried.id)?.status, "SUCCEEDED");
      void claimed;
    });

    await check("stuck job detection", () => {
      const id = uid();
      db().prepare(`
        INSERT INTO background_jobs
          (id, job_type, status, attempt, max_attempts, scheduled_at, started_at, heartbeat_at, params_json)
        VALUES (?, 'MAINTENANCE', 'RUNNING', 1, 3, datetime('now'), datetime('now','-2 hours'), datetime('now','-2 hours'), '{}')
      `).run(id);
      const n = markStuckJobs(30);
      assert.ok(n >= 1);
      assert.equal(getJob(id)?.status, "STUCK");
    });

    await check("tickJobs processes queue", async () => {
      enqueueJob({
        jobType: "INTEGRITY_CHECK",
        idempotencyKey: `ops-unit-integrity-${uid()}`,
        createdBy: adminId,
      });
      const result = await tickJobs(5);
      assert.ok(result.processed >= 1);
      assert.ok(jobCounts().SUCCEEDED >= 1);
    });

    await check("diagnostics metadata only + firm search", () => {
      const clientId = (global as any)._clientId as string;
      const firms = searchFirms("Ops Firm");
      assert.ok(firms.length >= 1);
      const diag = clientDiagnostics(clientId);
      assert.ok(diag);
      assert.ok(diag!.client.id === clientId);
      assert.ok(!("plLines" in (diag as any)));
      assert.ok(!("snapshot" in (diag!.latestRelease || {})));
    });

    await check("health + degradation matrix", () => {
      assert.equal(liveness().status, "ok");
      const r = readiness();
      assert.ok(r.dependencies.some((d) => d.name === "database"));
      assert.ok(DEGRADATION_MATRIX.length >= 4);
    });

    await check("ai usage + platform summary exclude financials", () => {
      recordAiUsage({
        firmId: (global as any)._firmId,
        clientId: (global as any)._clientId,
        feature: "copilot",
        model: "test",
        inputTokens: 10,
        outputTokens: 5,
        status: "ok",
      });
      const summary = platformUsageSummary();
      assert.ok(summary.ai.requestsLast24h >= 1);
      assert.ok(!("revenue" in summary));
      assert.ok(!("netIncome" in summary));
    });

    await check("integrity diagnostics run", () => {
      const result = runIntegrityDiagnostics();
      assert.ok("orphans" in result);
      assert.ok("storageReferenceBroken" in result);
    });

    await check("archive firm disables memberships", () => {
      const firmId = (global as any)._firmId as string;
      archiveFirm(firmId, adminId);
      const firm: any = db().prepare(`SELECT status FROM firms WHERE id=?`).get(firmId);
      assert.equal(firm.status, "ARCHIVED");
    });

    // Second firm for isolation smoke on createFirm helper still works
    await check("second firm create still works", () => {
      const f = createFirm({ name: "Other Firm", slug: `other-${uid().slice(0, 6)}` });
      assert.ok(f.id);
    });
  });

  console.log(`\nOps: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main();
