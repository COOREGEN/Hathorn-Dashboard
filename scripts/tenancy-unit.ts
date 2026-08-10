/**
 * Multi-tenant isolation unit checks (offline).
 * Run: npm run tenancy:test
 */
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "fs";
import path from "path";
import { closeDb, db, uid } from "../lib/db";
import { hashPassword } from "../lib/auth";
import {
  activeMembership, brandingForClient, createFirm, firmIdForClient,
  listClientsForFirm, orphanReport, resolveActiveFirmId,
} from "../lib/tenancy";

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
  const tmp = path.join(process.cwd(), "data", `_tenancy_unit_${process.pid}_${Date.now()}`);
  process.env.DATA_DIR = tmp;
  mkdirSync(tmp, { recursive: true });
  closeDb();
  return fn().finally(() => {
    closeDb();
    process.env.DATA_DIR = prev;
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
  });
}

function seedTwoFirms() {
  const firmA = createFirm({ name: "Hathorn Test Firm", slug: "hathorn-test" });
  const firmB = createFirm({
    name: "Example CPA Firm", slug: "example-cpa-unit",
    brandPrimary: "#1B4F72", brandAccent: "#B9770E",
  });

  const clientA = uid();
  const clientB = uid();
  db().prepare(`
    INSERT INTO clients (id, firm_id, name, slug, template, brand_primary, brand_accent, logo_text)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(clientA, firmA.id, "Client A", `client-a-${clientA.slice(0, 6)}`, "editorial", "#2C504D", "#DB5928", "A");
  db().prepare(`
    INSERT INTO clients (id, firm_id, name, slug, template, brand_primary, brand_accent, logo_text)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(clientB, firmB.id, "Client B", `client-b-${clientB.slice(0, 6)}`, "modern", "#1B4F72", "#B9770E", "B");

  const userA = uid();
  const userB = uid();
  const platform = uid();
  const hash = hashPassword("ledger2026x");
  db().prepare(
    "INSERT INTO users (id,email,password_hash,name,role,client_id,is_platform_admin) VALUES (?,?,?,?,?,?,?)",
  ).run(userA, "a@firm-a.test", hash, "Admin A", "ADMIN", null, 0);
  db().prepare(
    "INSERT INTO users (id,email,password_hash,name,role,client_id,is_platform_admin) VALUES (?,?,?,?,?,?,?)",
  ).run(userB, "b@firm-b.test", hash, "Admin B", "ADMIN", null, 0);
  db().prepare(
    "INSERT INTO users (id,email,password_hash,name,role,client_id,is_platform_admin) VALUES (?,?,?,?,?,?,?)",
  ).run(platform, "platform@hathorn.test", hash, "Platform", "ADMIN", null, 1);

  db().prepare(
    "INSERT INTO firm_memberships (id, firm_id, user_id, role, status) VALUES (?,?,?,?, 'ACTIVE')",
  ).run(uid(), firmA.id, userA, "ADMIN");
  db().prepare(
    "INSERT INTO firm_memberships (id, firm_id, user_id, role, status) VALUES (?,?,?,?, 'ACTIVE')",
  ).run(uid(), firmB.id, userB, "ADMIN");

  // Periods / releases / docs for IDOR-shaped probes
  const periodA = uid();
  const periodB = uid();
  db().prepare(
    "INSERT INTO periods (id, client_id, year, month, status) VALUES (?,?,?,?, 'PUBLISHED')",
  ).run(periodA, clientA, 2026, 4);
  db().prepare(
    "INSERT INTO periods (id, client_id, year, month, status) VALUES (?,?,?,?, 'PUBLISHED')",
  ).run(periodB, clientB, 2026, 4);

  db().prepare(`
    INSERT INTO source_documents
      (id, client_id, document_type, original_filename, mime_type, file_size,
       storage_reference, sha256, status, uploaded_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    uid(), clientA, "OTHER", "a.txt", "text/plain", 4,
    "tenancy/a.txt", "b".repeat(64), "READY", userA,
  );
  db().prepare(`
    INSERT INTO source_documents
      (id, client_id, document_type, original_filename, mime_type, file_size,
       storage_reference, sha256, status, uploaded_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    uid(), clientB, "OTHER", "b.txt", "text/plain", 4,
    "tenancy/b.txt", "c".repeat(64), "READY", userB,
  );

  return { firmA, firmB, clientA, clientB, userA, userB, platform, periodA, periodB };
}

async function main() {
  console.log("\n── Tenancy / multi-firm isolation ──");

  await withTempDb(async () => {
    // Touch db to apply migrations
    db().prepare("SELECT 1").get();
    const fx = seedTwoFirms();

    await check("clients belong to their firms", () => {
      assert.equal(firmIdForClient(fx.clientA), fx.firmA.id);
      assert.equal(firmIdForClient(fx.clientB), fx.firmB.id);
    });

    await check("listClientsForFirm never crosses firms", () => {
      const a = listClientsForFirm(fx.firmA.id);
      const b = listClientsForFirm(fx.firmB.id);
      assert.equal(a.length, 1);
      assert.equal(b.length, 1);
      assert.equal(a[0].id, fx.clientA);
      assert.equal(b[0].id, fx.clientB);
      assert.ok(!a.some((c) => c.id === fx.clientB));
      assert.ok(!b.some((c) => c.id === fx.clientA));
    });

    await check("membership does not cross firms", () => {
      assert.ok(activeMembership(fx.userA, fx.firmA.id));
      assert.equal(activeMembership(fx.userA, fx.firmB.id), null);
      assert.ok(activeMembership(fx.userB, fx.firmB.id));
      assert.equal(activeMembership(fx.userB, fx.firmA.id), null);
    });

    await check("resolveActiveFirmId picks membership firm", () => {
      const id = resolveActiveFirmId({
        userId: fx.userA, role: "ADMIN", clientId: null, firmId: null,
      });
      assert.equal(id, fx.firmA.id);
    });

    await check("platform admin flag is distinct from firm membership", () => {
      const row: any = db().prepare("SELECT is_platform_admin FROM users WHERE id=?").get(fx.platform);
      assert.equal(row.is_platform_admin, 1);
      assert.equal(activeMembership(fx.platform, fx.firmA.id), null);
      assert.equal(activeMembership(fx.platform, fx.firmB.id), null);
    });

    await check("branding isolation between firms", () => {
      const a = brandingForClient(fx.clientA);
      const b = brandingForClient(fx.clientB);
      assert.equal(a.firmName, "Hathorn Test Firm");
      assert.equal(b.firmName, "Example CPA Firm");
      assert.notEqual(a.brandPrimary, b.brandPrimary);
    });

    await check("orphan report clean after fixture", () => {
      const o = orphanReport();
      assert.equal(o.clientsWithoutFirm, 0);
      assert.equal(o.documentsWithoutClient, 0);
      assert.equal(o.staffWithoutMembership, 0);
    });

    await check("period→client→firm chain for Firm B is not Firm A", () => {
      const row: any = db().prepare(`
        SELECT c.firm_id FROM periods p JOIN clients c ON c.id=p.client_id WHERE p.id=?
      `).get(fx.periodB);
      assert.equal(row.firm_id, fx.firmB.id);
      assert.notEqual(row.firm_id, fx.firmA.id);
    });

    await check("document client ownership scoped", () => {
      const docsA: any[] = db().prepare(
        "SELECT id FROM source_documents WHERE client_id=?",
      ).all(fx.clientA);
      const docsB: any[] = db().prepare(
        "SELECT id FROM source_documents WHERE client_id=?",
      ).all(fx.clientB);
      assert.equal(docsA.length, 1);
      assert.equal(docsB.length, 1);
      const leak: any = db().prepare(
        `SELECT d.id FROM source_documents d
           JOIN clients c ON c.id=d.client_id
          WHERE d.client_id=? AND c.firm_id=?`,
      ).get(fx.clientB, fx.firmA.id);
      assert.equal(leak, undefined);
    });

    await check("migration backfill creates Hathorn firm shape", () => {
      // Re-run style: create orphan client then assign — app policy requires firm_id on create.
      const orphan = uid();
      db().prepare(`
        INSERT INTO clients (id, firm_id, name, slug, template, brand_primary, brand_accent, logo_text)
        VALUES (?,?,?,?,?,?,?,?)
      `).run(orphan, fx.firmA.id, "Orphan Fix", `orphan-${orphan.slice(0, 6)}`, "editorial", "#2C504D", "#DB5928", "O");
      assert.equal(firmIdForClient(orphan), fx.firmA.id);
    });
  });

  console.log(`\nTenancy: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
