/**
 * Apply row-level security policies after Postgres cutover.
 *
 *   DATABASE_URL=postgres://migrator:pass@host/ledger npx tsx scripts/apply-rls.ts
 *
 * Optional app role setup (recommended):
 *   HATHORN_APP_ROLE=hathorn_app
 *   HATHORN_APP_PASSWORD=...          # only when creating the role
 *   DATABASE_APP_URL=postgres://hathorn_app:pass@host/ledger
 *
 * The migrator connection must be able to CREATE POLICY and ALTER ROLE.
 * The application role must NOT have BYPASSRLS.
 */
import fs from "fs";
import path from "path";
import { Client } from "pg";

const SQL_PATH = path.join(__dirname, "../docs/postgres-rls.sql");

function roleFromEnv(): string | null {
  const explicit = process.env.HATHORN_APP_ROLE?.trim();
  if (explicit) return explicit;

  const appUrl = process.env.DATABASE_APP_URL?.trim();
  if (!appUrl) return null;

  try {
    return new URL(appUrl.replace(/^postgres(ql)?:\/\//, "http://")).username || null;
  } catch {
    return null;
  }
}

function assertSafeRoleName(role: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(role)) {
    throw new Error(`Unsafe role name: ${role}`);
  }
}

async function ensureAppRole(pg: Client, role: string): Promise<void> {
  assertSafeRoleName(role);

  const exists = await pg.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
  if (!exists.rowCount) {
    const password = process.env.HATHORN_APP_PASSWORD;
    if (password) {
      await pg.query(`CREATE ROLE ${role} LOGIN PASSWORD $1`, [password]);
      console.log(`Created role ${role}.`);
    } else {
      await pg.query(`CREATE ROLE ${role} LOGIN`);
      console.log(`Created role ${role} (no password — set HATHORN_APP_PASSWORD or alter role).`);
    }
  } else {
    console.log(`Role ${role} already exists.`);
  }

  // Application role must never bypass RLS, even if it inherited superuser elsewhere.
  await pg.query(`ALTER ROLE ${role} NOBYPASSRLS`);

  const bypass = await pg.query(
    `SELECT rolbypassrls FROM pg_roles WHERE rolname = $1`,
    [role],
  );
  if (bypass.rows[0]?.rolbypassrls) {
    throw new Error(`Role ${role} still has BYPASSRLS after ALTER ROLE NOBYPASSRLS`);
  }
  console.log(`Confirmed ${role} does not BYPASSRLS.`);

  const dbName = (await pg.query("SELECT current_database() AS n")).rows[0].n as string;
  await pg.query(`GRANT CONNECT ON DATABASE ${quoteIdent(dbName)} TO ${role}`);
  await pg.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await pg.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
  await pg.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
  await pg.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`,
  );
  await pg.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${role}`,
  );
  console.log(`Granted schema/table privileges to ${role}.`);
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function listRlsTables(pg: Client): Promise<string[]> {
  const res = await pg.query(`
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
    ORDER BY c.relname
  `);
  return res.rows.map((r) => r.table_name as string);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "Set DATABASE_URL (migrator/superuser), e.g.\n" +
        "  DATABASE_URL=postgres://migrator:pass@host/ledger npx tsx scripts/apply-rls.ts",
    );
    process.exit(1);
  }

  if (!fs.existsSync(SQL_PATH)) {
    console.error(`Missing SQL file: ${SQL_PATH}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(SQL_PATH, "utf8");
  const pg = new Client({ connectionString: url });
  await pg.connect();
  console.log("Connected as migrator.");

  try {
    console.log(`Applying ${SQL_PATH}…`);
    await pg.query(sql);
    console.log("RLS policies applied.");

    const appRole = roleFromEnv();
    if (appRole) {
      await ensureAppRole(pg, appRole);
    } else {
      console.log("No HATHORN_APP_ROLE or DATABASE_APP_URL — skipped app role setup.");
    }

    const tables = await listRlsTables(pg);
    console.log(`\nTables with relrowsecurity = true (${tables.length}):`);
    for (const t of tables) console.log(`  • ${t}`);
  } finally {
    await pg.end();
  }
}

main().catch((e) => {
  console.error("apply-rls failed:", e.message);
  process.exit(1);
});
