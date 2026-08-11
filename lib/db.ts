import Database from "better-sqlite3";
import { readFileSync, mkdirSync } from "fs";
import path from "path";
import crypto from "crypto";
import { runMigrations } from "./migrations";
import {
  closePostgresPool,
  isPostgresRuntimeEnabled,
  openPostgresDatabase,
} from "./db-pg";
import type { LedgerDatabase } from "./db-types";

let _db: LedgerDatabase | null = null;
let _engine: "sqlite" | "postgres" = "sqlite";

export function dbEngine(): "sqlite" | "postgres" {
  return isPostgresRuntimeEnabled() ? "postgres" : _engine;
}

function wrapSqlite(sqlite: Database.Database): LedgerDatabase {
  return {
    prepare: (sql: string) => sqlite.prepare(sql) as any,
    exec: (sql: string) => { sqlite.exec(sql); },
    transaction: <T>(fn: () => T) => {
      const tx = sqlite.transaction(fn);
      return () => tx();
    },
    pragma: (src: string) => sqlite.pragma(src) as any,
    backup: async (dest: string) => { await sqlite.backup(dest); },
    close: () => sqlite.close(),
  };
}

export function db(): LedgerDatabase {
  if (!_db) {
    if (isPostgresRuntimeEnabled()) {
      _engine = "postgres";
      _db = openPostgresDatabase();
    } else {
      _engine = "sqlite";
      const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");
      mkdirSync(dir, { recursive: true });
      const sqlite = new Database(path.join(dir, "ledger.db"));
      sqlite.pragma("journal_mode = WAL");
      sqlite.pragma("foreign_keys = ON");
      // Durability over raw speed: this is client financial data.
      sqlite.pragma("synchronous = FULL");
      sqlite.exec(readFileSync(path.join(process.cwd(), "lib", "schema.sql"), "utf8"));
      runMigrations(sqlite);
      _db = wrapSqlite(sqlite);
    }
  }
  return _db;
}

/**
 * Closes the cached connection.
 *
 * Needed by restore: replacing the database file underneath an open handle leaves the
 * connection pointing at an inode that no longer exists, and every subsequent query
 * fails with "disk I/O error". Closing first, then letting db() reopen lazily, is the
 * only safe way to swap the file in a running process.
 */
export function closeDb() {
  if (!_db) return;
  if (_engine === "postgres" || isPostgresRuntimeEnabled()) {
    try { _db.close(); } catch { /* ignore */ }
    closePostgresPool();
  } else {
    try { _db.pragma("wal_checkpoint(TRUNCATE)"); } catch { /* nothing to checkpoint */ }
    try { _db.close(); } catch { /* ignore */ }
  }
  _db = null;
}

export const uid = () => crypto.randomBytes(12).toString("hex");

export const monthName = (m: number) =>
  ["", "January", "February", "March", "April", "May", "June", "July",
   "August", "September", "October", "November", "December"][m];

export const monthShort = (m: number) =>
  ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m];

/** Structured log line. Cheap now, essential the first time something breaks at a client. */
export function log(level: "info" | "warn" | "error", event: string, detail: Record<string, any> = {}) {
  let safeDetail: Record<string, unknown> = detail || {};
  let corr: { correlationId?: string; firmId?: string | null; clientId?: string | null; userId?: string | null } = {};
  let appEnv = process.env.APP_ENV || process.env.NODE_ENV || "local";
  try {
    // Lazy require avoids circular imports at module init.
    const { redactObject } = require("./ops/redact") as typeof import("./ops/redact");
    const { getCorrelation } = require("./ops/correlation") as typeof import("./ops/correlation");
    const { resolveAppEnv } = require("./ops/env") as typeof import("./ops/env");
    safeDetail = redactObject(detail || {});
    corr = getCorrelation();
    appEnv = resolveAppEnv();
  } catch { /* ops modules unavailable during very early boot */ }

  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    environment: appEnv,
    dbEngine: dbEngine(),
    correlationId: corr.correlationId && corr.correlationId !== "no-corr" ? corr.correlationId : undefined,
    firmId: corr.firmId || undefined,
    clientId: corr.clientId || undefined,
    userId: corr.userId || undefined,
    ...safeDetail,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
