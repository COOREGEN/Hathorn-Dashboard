/**
 * Moves the book from SQLite to Postgres.
 *
 *   DATABASE_URL=postgres://user:pass@host/db npx tsx scripts/migrate-to-postgres.ts
 *
 * Safe to re-run: rows already present are skipped, and the whole transfer is one
 * transaction. Nothing is deleted from SQLite — the old file remains the fallback until
 * you have run the app against Postgres and are satisfied.
 */
import Database from "better-sqlite3";
import { Client } from "pg";
import path from "path";
import { schemaFromDatabase, transfer, verifyFinancials, TRANSFER_ORDER } from "../lib/postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_URL first, e.g.\n  DATABASE_URL=postgres://user:pass@host/ledger npx tsx scripts/migrate-to-postgres.ts");
    process.exit(1);
  }

  const { assertSafeForPostgresMigrate } = await import("../lib/ops/db-target");
  const target = assertSafeForPostgresMigrate(url);
  console.log(`Migrate target: ${target.database} @ ${target.host}`);

  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  const sqlite = new Database(path.join(dataDir, "ledger.db"), { readonly: true, fileMustExist: true });
  const pg = new Client({ connectionString: url });
  await pg.connect();
  console.log("Connected to Postgres.");

  try {
    // 1. Schema, read from the live database rather than schema.sql — migrations create
    //    tables that file never learns about.
    await pg.query(schemaFromDatabase(sqlite));
    console.log("Schema applied.");

    // 2. Data.
    console.log(`Transferring ${TRANSFER_ORDER.length} tables…`);
    const report = await transfer({
      sqlite, pg,
      onProgress: (table, rows) => console.log(`  ${table.padEnd(20)} ${rows} rows`),
    });

    const failed = report.filter((r) => !r.ok);
    if (failed.length) {
      console.error("\nTransfer reported problems:");
      for (const f of failed) console.error(`  ${f.table}: ${f.note}`);
      process.exit(1);
    }

    // 3. Prove the numbers survived, not just the rows.
    console.log("\nVerifying computed financials…");
    const check = await verifyFinancials({ sqlite, pg });
    for (const c of check.checks) {
      console.log(`  ${c.ok ? "✓" : "✗"} ${c.name.padEnd(20)} sqlite ${c.sqlite}  postgres ${c.pg}`);
    }
    if (!check.ok) {
      console.error("\nFinancials do not match. Postgres has been left populated for inspection; do not cut over.");
      process.exit(1);
    }

    const total = report.reduce((s, r) => s + r.source, 0);
    console.log(`\nMigration complete: ${total.toLocaleString()} rows, every figure ties.`);
    console.log("Set DATABASE_URL in the app environment to cut over. Keep the SQLite file until you are satisfied.");
  } finally {
    await pg.end();
    sqlite.close();
  }
}

main().catch((e) => { console.error("Migration failed:", e.message); process.exit(1); });
