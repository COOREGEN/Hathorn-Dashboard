/**
 * Remove proven seed/demo fixture rows from a staging-named Postgres database.
 *
 * Keeps Hathorn Advisory Group firm and hathornadvisorygroup.com staff users.
 * Removes: Northbridge, Lakeside, Bright Path, Impact 5, Example CPA / Harbor Dental,
 * .example / .test / ops-*@test.local users that belong to those fixtures.
 *
 *   APP_ENV=STAGING CONFIRM_STAGING_FIXTURE_PURGE=1 \
 *     DATABASE_MIGRATOR_URL=postgres://…/hathorn_staging \
 *     npm run db:purge-staging-fixtures
 *
 * Dry run (default): omit APPLY=1 to print the plan only.
 * Destructive: APPLY=1
 */
import { Client } from "pg";
import { assertSafeForStagingFixturePurge } from "../lib/ops/db-target";

/** Proven fixture client slugs from lib/seed.ts + seed-verticals + seed-management. */
const FIXTURE_CLIENT_SLUGS = [
  "northbridge",
  "lakeside-stays",
  "bright-path",
  "impact-5",
  "harbor-dental",
] as const;

/** Proven synthetic firm (isolation fixture) — not Hathorn Advisory Group. */
const FIXTURE_FIRM_SLUGS = ["example-cpa"] as const;

const FIXTURE_USER_EMAILS = [
  "owner@northbridge.example",
  "admin@example-cpa.test",
  "owner@harbor-dental.test",
] as const;

interface Plan {
  clients: { id: string; name: string; slug: string }[];
  firms: { id: string; name: string; slug: string }[];
  users: { id: string; email: string }[];
  uncertain: string[];
}

async function tablesWithColumn(pg: Client, column: string): Promise<string[]> {
  const res = await pg.query(
    `SELECT table_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = $1
      ORDER BY table_name`,
    [column],
  );
  return res.rows.map((r) => r.table_name as string);
}

async function buildPlan(pg: Client): Promise<Plan> {
  const clients = (
    await pg.query(
      `SELECT id, name, slug FROM clients WHERE slug = ANY($1::text[]) ORDER BY slug`,
      [FIXTURE_CLIENT_SLUGS],
    )
  ).rows as Plan["clients"];

  const firms = (
    await pg.query(
      `SELECT id, name, slug FROM firms WHERE slug = ANY($1::text[]) ORDER BY slug`,
      [FIXTURE_FIRM_SLUGS],
    )
  ).rows as Plan["firms"];

  const users = (
    await pg.query(
      `SELECT id, email FROM users
        WHERE email = ANY($1::text[])
           OR email LIKE '%@test.local'
           OR email LIKE '%.example'
           OR email LIKE '%.test'
        ORDER BY email`,
      [FIXTURE_USER_EMAILS],
    )
  ).rows as Plan["users"];

  // Never delete Hathorn staff by domain accident.
  const filteredUsers = users.filter((u) => !u.email.endsWith("@hathornadvisorygroup.com"));

  const uncertain: string[] = [];
  // Clients under Hathorn that are not in the known slug list — leave alone.
  const other = await pg.query(
    `SELECT name, slug FROM clients
      WHERE firm_id = (SELECT id FROM firms WHERE slug='hathorn-advisory' LIMIT 1)
        AND slug <> ALL($1::text[])
      ORDER BY name`,
    [FIXTURE_CLIENT_SLUGS],
  );
  for (const r of other.rows) {
    uncertain.push(`Kept (not in seed slug allowlist): client ${r.name} (${r.slug})`);
  }

  return { clients, firms, users: filteredUsers, uncertain };
}

async function deleteByClientIds(pg: Client, clientIds: string[]) {
  if (!clientIds.length) return;

  const periods = await pg.query(`SELECT id FROM periods WHERE client_id = ANY($1::text[])`, [clientIds]);
  const periodIds = periods.rows.map((r) => r.id as string);
  if (periodIds.length) {
    const periodTables = await tablesWithColumn(pg, "period_id");
    for (const table of periodTables) {
      const r = await pg.query(`DELETE FROM ${quote(table)} WHERE period_id = ANY($1::text[])`, [periodIds]);
      if (r.rowCount) console.log(`  ${table}: ${r.rowCount} rows`);
    }
  }

  const tables = await tablesWithColumn(pg, "client_id");
  const ordered = tables.filter((t) => t !== "clients");
  for (const table of ordered) {
    const r = await pg.query(`DELETE FROM ${quote(table)} WHERE client_id = ANY($1::text[])`, [clientIds]);
    if (r.rowCount) console.log(`  ${table}: ${r.rowCount} rows`);
  }
  const r = await pg.query(`DELETE FROM clients WHERE id = ANY($1::text[])`, [clientIds]);
  console.log(`  clients: ${r.rowCount} rows`);
}

async function deleteUsers(pg: Client, userIds: string[]) {
  if (!userIds.length) return;
  // Memberships / sessions / tokens first when present.
  for (const table of [
    "firm_memberships",
    "password_reset_tokens",
    "mfa_challenges",
    "login_attempts",
    "audit_log",
    "audit_events",
  ]) {
    const exists = await pg.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
      [table],
    );
    if (!exists.rowCount) continue;
    const cols = await pg.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1 AND column_name = ANY($2::text[])`,
      [table, ["user_id", "actor_id"]],
    );
    for (const c of cols.rows) {
      const col = c.column_name as string;
      const r = await pg.query(`DELETE FROM ${quote(table)} WHERE ${quote(col)} = ANY($1::text[])`, [userIds]);
      if (r.rowCount) console.log(`  ${table}: ${r.rowCount} rows`);
    }
  }
  const r = await pg.query(`DELETE FROM users WHERE id = ANY($1::text[])`, [userIds]);
  console.log(`  users: ${r.rowCount} rows`);
}

async function deleteFirms(pg: Client, firmIds: string[]) {
  if (!firmIds.length) return;
  const tables = await tablesWithColumn(pg, "firm_id");
  for (const table of tables.filter((t) => t !== "firms")) {
    const r = await pg.query(`DELETE FROM ${quote(table)} WHERE firm_id = ANY($1::text[])`, [firmIds]);
    if (r.rowCount) console.log(`  ${table}: ${r.rowCount} rows`);
  }
  const r = await pg.query(`DELETE FROM firms WHERE id = ANY($1::text[])`, [firmIds]);
  console.log(`  firms: ${r.rowCount} rows`);
}

function quote(ident: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(ident)) throw new Error(`Unsafe ident ${ident}`);
  return `"${ident}"`;
}

async function main() {
  const url = process.env.DATABASE_MIGRATOR_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_MIGRATOR_URL (staging migrator).");
  const target = assertSafeForStagingFixturePurge(url);
  const apply = process.env.APPLY === "1";

  const pg = new Client({ connectionString: url });
  await pg.connect();
  try {
    console.log(`Staging fixture purge target: ${target.database} @ ${target.host}`);
    console.log(apply ? "MODE: APPLY" : "MODE: dry-run (set APPLY=1 to execute)");

    const plan = await buildPlan(pg);
    console.log("\nClients to remove:");
    for (const c of plan.clients) console.log(`  - ${c.slug}: ${c.name} (${c.id})`);
    if (!plan.clients.length) console.log("  (none)");

    console.log("\nFirms to remove:");
    for (const f of plan.firms) console.log(`  - ${f.slug}: ${f.name} (${f.id})`);
    if (!plan.firms.length) console.log("  (none)");

    console.log("\nUsers to remove:");
    for (const u of plan.users) console.log(`  - ${u.email} (${u.id})`);
    if (!plan.users.length) console.log("  (none)");

    if (plan.uncertain.length) {
      console.log("\nUncertain / retained for manual review:");
      for (const u of plan.uncertain) console.log(`  · ${u}`);
    }

    // Safety: never remove Hathorn firm
    const hathorn = await pg.query(`SELECT id, name FROM firms WHERE slug='hathorn-advisory'`);
    if (!hathorn.rowCount) {
      console.warn("WARNING: Hathorn Advisory Group firm not found — aborting.");
      process.exit(2);
    }
    console.log(`\nRetaining firm: ${hathorn.rows[0].name} (${hathorn.rows[0].id})`);

    if (!apply) {
      console.log("\nDry run complete. Re-run with APPLY=1 to delete.");
      return;
    }

    await pg.query("BEGIN");
    try {
      console.log("\nDeleting client-scoped fixture rows…");
      await deleteByClientIds(pg, plan.clients.map((c) => c.id));
      console.log("Deleting fixture users…");
      await deleteUsers(pg, plan.users.map((u) => u.id));
      console.log("Deleting fixture firms…");
      await deleteFirms(pg, plan.firms.map((f) => f.id));
      await pg.query("COMMIT");
      console.log("\nPurge committed.");
    } catch (e) {
      await pg.query("ROLLBACK");
      throw e;
    }

    const after = await buildPlan(pg);
    console.log("\nRemaining fixture-slug clients:", after.clients.length);
    console.log("Remaining fixture firms:", after.firms.length);
    console.log("Remaining .example/.test users:", after.users.length);
    if (after.clients.length || after.firms.length || after.users.length) {
      throw new Error("Purge incomplete — fixture rows still present.");
    }
  } finally {
    await pg.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
