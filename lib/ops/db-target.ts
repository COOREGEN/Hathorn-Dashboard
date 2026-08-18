/**
 * Database target safety — refuse destructive seed/reset/purge against production-like DBs.
 *
 * Multiple signals: APP_ENV, database name, hostname heuristics, and explicit confirm flags.
 * Fail closed when the target looks like a live book.
 */
import { resolveAppEnv, type AppEnv } from "./env";

export type DbTargetKind = "test" | "staging" | "production" | "local" | "unknown";

export interface ParsedDbUrl {
  raw: string;
  host: string;
  port: string;
  database: string;
  user: string;
}

const PROD_NAME_RE = /(^|[_-])(prod|production)([_-]|$)/i;
const TEST_NAME_RE = /(^|[_-])(test|ci|fixture|proof)([_-]|$)/i;
const STAGING_NAME_RE = /(^|[_-])(staging|stage|pilot)([_-]|$)/i;
const PROD_HOST_RE = /(prod|production)\./i;

export function parseDatabaseUrl(url: string): ParsedDbUrl {
  const normalized = url.replace(/^postgres(ql)?:\/\//i, "http://");
  let u: URL;
  try {
    u = new URL(normalized);
  } catch {
    throw new Error("DATABASE_URL is not a valid connection string.");
  }
  const database = decodeURIComponent(u.pathname.replace(/^\//, "").split("/")[0] || "");
  if (!database) throw new Error("DATABASE_URL is missing a database name.");
  return {
    raw: url,
    host: u.hostname || "",
    port: u.port || "5432",
    database,
    user: decodeURIComponent(u.username || ""),
  };
}

export function classifyDatabaseName(name: string): DbTargetKind {
  if (PROD_NAME_RE.test(name)) return "production";
  if (TEST_NAME_RE.test(name)) return "test";
  if (STAGING_NAME_RE.test(name)) return "staging";
  if (/^(ledger|hathorn)$/i.test(name)) return "unknown";
  return "unknown";
}

export function looksLikeProductionTarget(target: ParsedDbUrl, env: AppEnv = resolveAppEnv()): boolean {
  if (env === "PRODUCTION") return true;
  if (classifyDatabaseName(target.database) === "production") return true;
  if (PROD_HOST_RE.test(target.host)) return true;
  return false;
}

export function isDisposableTestTarget(target: ParsedDbUrl): boolean {
  return classifyDatabaseName(target.database) === "test";
}

/**
 * Destructive fixture load / wipe (seed→migrate into a DB, DROP DATABASE, TRUNCATE book).
 * Allowed only for clearly named test DBs, or LOCAL sqlite-adjacent tooling with confirm.
 */
export function assertSafeForFixtureLoad(url: string, opts?: { allowStagingConfirm?: boolean }): ParsedDbUrl {
  const target = parseDatabaseUrl(url);
  const env = resolveAppEnv();

  if (looksLikeProductionTarget(target, env)) {
    throw new Error(
      `Refusing fixture load against production-like target ` +
      `(db=${target.database}, host=${target.host}, APP_ENV=${env}).`,
    );
  }

  if (isDisposableTestTarget(target)) return target;

  if (classifyDatabaseName(target.database) === "staging") {
    if (opts?.allowStagingConfirm && process.env.CONFIRM_STAGING_FIXTURE_PURGE === "1" && env === "STAGING") {
      return target;
    }
    throw new Error(
      `Refusing fixture load/wipe on staging DB "${target.database}". ` +
      `Use hathorn_test (or *_test) for automated fixtures.`,
    );
  }

  // Unknown names: only LOCAL/TEST with an explicit override.
  if (env === "LOCAL" || env === "TEST") {
    if (process.env.ALLOW_UNKNOWN_DB_FIXTURE === "1") return target;
    throw new Error(
      `Database "${target.database}" is not a recognized test target (*_test / *_ci / *_fixture). ` +
      `Set ALLOW_UNKNOWN_DB_FIXTURE=1 only for intentional local experiments.`,
    );
  }

  throw new Error(
    `Refusing fixture load (db=${target.database}, APP_ENV=${env}). ` +
    `Point DATABASE_URL at a dedicated test database.`,
  );
}

/** Staging fixture purge — never production; requires explicit confirm. */
export function assertSafeForStagingFixturePurge(url: string): ParsedDbUrl {
  const target = parseDatabaseUrl(url);
  const env = resolveAppEnv();

  if (looksLikeProductionTarget(target, env) || classifyDatabaseName(target.database) === "production") {
    throw new Error(`Refusing staging purge against production-like DB "${target.database}".`);
  }
  if (classifyDatabaseName(target.database) !== "staging") {
    throw new Error(
      `Staging fixture purge requires a staging-named database (got "${target.database}").`,
    );
  }
  if (process.env.CONFIRM_STAGING_FIXTURE_PURGE !== "1") {
    throw new Error("Set CONFIRM_STAGING_FIXTURE_PURGE=1 to purge synthetic seed rows from staging.");
  }
  if (env !== "STAGING" && env !== "LOCAL") {
    throw new Error(`Staging fixture purge refused under APP_ENV=${env}.`);
  }
  return target;
}

/** Seed→Postgres migrate must never target production. */
export function assertSafeForPostgresMigrate(url: string): ParsedDbUrl {
  const target = parseDatabaseUrl(url);
  const env = resolveAppEnv();
  if (looksLikeProductionTarget(target, env)) {
    throw new Error(
      `Refusing migrate-to-postgres against production-like target ` +
      `(db=${target.database}, APP_ENV=${env}).`,
    );
  }
  // Staging migrate is allowed only with an explicit confirm (manual cutover), not ambient CI.
  if (classifyDatabaseName(target.database) === "staging" && process.env.CONFIRM_STAGING_MIGRATE !== "1") {
    throw new Error(
      `Refusing migrate into staging DB "${target.database}" without CONFIRM_STAGING_MIGRATE=1. ` +
      `Automated fixtures belong in hathorn_test.`,
    );
  }
  if (isDisposableTestTarget(target)) return target;
  if (classifyDatabaseName(target.database) === "staging") return target;
  if ((env === "LOCAL" || env === "TEST") && process.env.ALLOW_UNKNOWN_DB_FIXTURE === "1") return target;
  if (env === "LOCAL" || env === "TEST") {
    // Local ad-hoc DBs (ledger, etc.) still need an explicit flag once guards are on.
    throw new Error(
      `Migrate target "${target.database}" is not *_test / staging. ` +
      `Use hathorn_test or set ALLOW_UNKNOWN_DB_FIXTURE=1.`,
    );
  }
  throw new Error(`Refusing migrate (db=${target.database}, APP_ENV=${env}).`);
}
