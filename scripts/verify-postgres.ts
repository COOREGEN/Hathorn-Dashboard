/**
 * Verifies a Postgres target already holds a migrated book.
 *
 *   DATABASE_URL=postgres://… npm run db:verify
 *
 * Run after `npm run db:migrate-postgres`. Does not cut the app over — the app
 * runtime remains SQLite until a Postgres driver lands. This script proves the
 * migration path before you trust it with a cutover project.
 */
import Database from "better-sqlite3";
import { Client } from "pg";
import path from "path";
import { verifyFinancials, TRANSFER_ORDER } from "../lib/postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_URL first.");
    process.exit(1);
  }

  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  const sqlite = new Database(path.join(dataDir, "ledger.db"), { readonly: true, fileMustExist: true });
  const pg = new Client({ connectionString: url });
  await pg.connect();

  try {
    console.log(`Checking ${TRANSFER_ORDER.length} tables…`);
    let ok = true;
    for (const table of TRANSFER_ORDER) {
      let src = 0;
      try { src = (sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as any).n; } catch { continue; }
      let dest = 0;
      try {
        dest = (await pg.query(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0].n;
      } catch (e: any) {
        console.error(`  ✗ ${table}: missing in Postgres (${e.message})`);
        ok = false;
        continue;
      }
      const match = dest >= src;
      console.log(`  ${match ? "✓" : "✗"} ${table.padEnd(22)} sqlite ${src}  postgres ${dest}`);
      if (!match) ok = false;
    }

    console.log("\nFinancial probes…");
    const check = await verifyFinancials({ sqlite, pg });
    for (const c of check.checks) {
      console.log(`  ${c.ok ? "✓" : "✗"} ${c.name.padEnd(20)} sqlite ${c.sqlite}  postgres ${c.pg}`);
    }
    if (!ok || !check.ok) {
      console.error("\nVerification failed. Do not cut over.");
      process.exit(1);
    }
    console.log("\nPostgres book matches SQLite financials.");
  } finally {
    await pg.end();
    sqlite.close();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
