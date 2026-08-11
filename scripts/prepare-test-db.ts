/**
 * Build an isolated Postgres fixture database for smoke / proof / RLS / financial proofs.
 *
 * Never writes to hathorn_staging. Default target: hathorn_test.
 *
 *   APP_ENV=TEST npm run db:prepare-test
 *
 * Env:
 *   TEST_DATABASE_URL          app role URL (default postgres://hathorn_app:…/hathorn_test)
 *   TEST_DATABASE_MIGRATOR_URL migrator/superuser URL for DDL
 *   DATA_DIR                   SQLite seed dir (default ./data/test-seed)
 */
import { spawnSync } from "child_process";
import path from "path";
import { Client } from "pg";
import { assertSafeForFixtureLoad, parseDatabaseUrl } from "../lib/ops/db-target";
import { allowDemoSeed, resolveAppEnv } from "../lib/ops/env";

const ROOT = process.cwd();

function requireEnv(name: string, fallback?: string): string {
  const v = process.env[name] || fallback;
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv) {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, env, stdio: "inherit" });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args[0] || ""} failed with exit ${r.status}`);
  }
}

function adminUrlFromMigrator(migratorUrl: string): string {
  const t = parseDatabaseUrl(migratorUrl);
  // Connect to postgres maintenance DB to DROP/CREATE.
  return migratorUrl.replace(/\/[^/?]+(\?|$)/, "/postgres$1");
}

async function recreateDatabase(migratorUrl: string, dbName: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbName)) {
    throw new Error(`Unsafe database name: ${dbName}`);
  }
  const admin = new Client({ connectionString: adminUrlFromMigrator(migratorUrl) });
  await admin.connect();
  try {
    await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [dbName]);
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    const owner = parseDatabaseUrl(migratorUrl).user || "hathorn";
    await admin.query(`CREATE DATABASE ${dbName} OWNER ${owner}`);
    // App role connect privilege (role may already exist from staging).
    const appRole = process.env.HATHORN_APP_ROLE || "hathorn_app";
    const roleExists = await admin.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [appRole]);
    if (roleExists.rowCount) {
      await admin.query(`GRANT CONNECT ON DATABASE ${dbName} TO ${appRole}`);
    }
    console.log(`Recreated database ${dbName}.`);
  } finally {
    await admin.end();
  }
}

async function main() {
  const envName = resolveAppEnv();
  if (!allowDemoSeed(envName)) {
    throw new Error(
      `db:prepare-test refused under APP_ENV=${envName}. Use APP_ENV=TEST (or LOCAL).`,
    );
  }

  const migratorUrl = requireEnv(
    "TEST_DATABASE_MIGRATOR_URL",
    process.env.DATABASE_MIGRATOR_URL?.replace(/hathorn_staging/g, "hathorn_test")
      || "postgres://hathorn:hathorn_staging@127.0.0.1:5432/hathorn_test",
  );
  const appUrl = requireEnv(
    "TEST_DATABASE_URL",
    process.env.DATABASE_URL?.replace(/hathorn_staging/g, "hathorn_test")
      || "postgres://hathorn_app:hathorn_app@127.0.0.1:5432/hathorn_test",
  );

  const target = assertSafeForFixtureLoad(migratorUrl);
  if (target.database !== parseDatabaseUrl(appUrl).database) {
    throw new Error("TEST_DATABASE_URL and TEST_DATABASE_MIGRATOR_URL must name the same database.");
  }

  const dataDir = process.env.DATA_DIR || path.join(ROOT, "data", "test-seed");
  process.env.DATA_DIR = dataDir;

  console.log("=== Prepare isolated test database ===");
  console.log(`APP_ENV=${envName}`);
  console.log(`database=${target.database}`);
  console.log(`DATA_DIR=${dataDir}`);

  await recreateDatabase(migratorUrl, target.database);

  // 1) Seed SQLite fixtures (Northbridge, Example CPA, verticals).
  const seedEnv = { ...process.env };
  delete seedEnv.DATABASE_URL;
  delete seedEnv.DATABASE_MIGRATOR_URL;
  delete seedEnv.POSTGRES_RUNTIME_ENABLED;
  run("npx", ["tsx", "lib/seed.ts"], {
    ...seedEnv,
    APP_ENV: envName === "LOCAL" || envName === "TEST" ? envName : "TEST",
    DATA_DIR: dataDir,
    ALLOW_DEMO_SEED: "1",
    // Keep seed on SQLite — never open Postgres runtime during seed.
    POSTGRES_RUNTIME_ENABLED: "0",
  });

  // 2) Migrate SQLite → hathorn_test
  run("npx", ["tsx", "scripts/migrate-to-postgres.ts"], {
    ...process.env,
    APP_ENV: "TEST",
    DATA_DIR: dataDir,
    DATABASE_URL: migratorUrl,
    CONFIRM_STAGING_MIGRATE: "",
    ALLOW_UNKNOWN_DB_FIXTURE: "",
  });

  // 3) Apply RLS + grants for hathorn_app
  run("npx", ["tsx", "scripts/apply-rls.ts"], {
    ...process.env,
    DATABASE_URL: migratorUrl,
    DATABASE_APP_URL: appUrl,
    HATHORN_APP_ROLE: process.env.HATHORN_APP_ROLE || "hathorn_app",
    HATHORN_APP_PASSWORD: process.env.HATHORN_APP_PASSWORD || "hathorn_app",
  });

  console.log("\nTest database ready.");
  console.log(`  TEST_DATABASE_URL=${appUrl}`);
  console.log(`  TEST_DATABASE_MIGRATOR_URL=${migratorUrl}`);
  console.log("Point the app at these URLs for smoke/proof/RLS — leave hathorn_staging untouched.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
