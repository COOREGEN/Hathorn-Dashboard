/**
 * Postgres runtime adapter with a better-sqlite3-shaped sync API.
 *
 * Uses a dedicated worker thread (lib/pg-worker.cjs) plus MessageChannel /
 * receiveMessageOnPort / Atomics.wait so synchronous prepare/get/all/run works
 * under Next.js and tsx without blocking the worker reply path.
 *
 * RLS session variables are applied with SET LOCAL semantics inside each
 * transaction so pooled connections cannot leak firm context across requests.
 *
 * Enable with:
 *   POSTGRES_RUNTIME_ENABLED=1
 *   DATABASE_URL=postgres://hathorn_app:...@host/ledger
 */
import {
  Worker,
  MessageChannel,
  receiveMessageOnPort,
  type MessagePort,
} from "worker_threads";
import path from "path";
import { translate } from "./postgres";
import { getDbContext } from "./db-context";

export type RunResult = { changes: number; lastInsertRowid: number | bigint };

type PgStatement = {
  get: (...params: any[]) => any;
  all: (...params: any[]) => any[];
  run: (...params: any[]) => RunResult;
};

export type PgDatabase = {
  prepare: (sql: string) => PgStatement;
  exec: (sql: string) => void;
  transaction: <T>(fn: () => T) => () => T;
  pragma: (src: string) => any;
  backup: (dest: string) => Promise<void>;
  close: () => void;
};

type RpcResult = {
  id: number;
  ok: boolean;
  rows?: any[];
  rowCount?: number;
  error?: string;
};

let _worker: Worker | null = null;
let _nextId = 1;
let _txDepth = 0;
/** Sync-stack mutex so begin/query/commit are atomic w.r.t. other request turns. */
let _gateDepth = 0;
function enterGate() { _gateDepth += 1; }
function leaveGate() { _gateDepth = Math.max(0, _gateDepth - 1); }

function ensureWorker(): Worker {
  if (_worker) return _worker;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required when POSTGRES_RUNTIME_ENABLED=1");

  // Resolve from project root — Next bundles lib/ into .next and __dirname is unreliable.
  const workerPath = path.join(process.cwd(), "lib", "pg-worker.cjs");
  _worker = new Worker(workerPath, {
    workerData: {
      connectionString: url,
      max: Number(process.env.PG_POOL_MAX || 10),
    },
  });
  _worker.on("error", (err) => {
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      event: "postgres.worker_error",
      message: err.message,
    }));
  });
  return _worker;
}

function rpc(type: string, payload: Record<string, unknown> = {}): RpcResult {
  const worker = ensureWorker();
  const id = _nextId++;
  const sab = new SharedArrayBuffer(4);
  const view = new Int32Array(sab);
  Atomics.store(view, 0, 0);

  const { port1, port2 } = new MessageChannel();
  worker.postMessage(
    { id, type, sab, port: port2, ...payload },
    [port2 as unknown as MessagePort],
  );

  let msg = receiveMessageOnPort(port1);
  while (!msg) {
    Atomics.wait(view, 0, 0);
    msg = receiveMessageOnPort(port1);
  }
  port1.close();
  const result = msg.message as RpcResult;
  if (!result.ok) throw new Error(result.error || "postgres rpc failed");
  return result;
}

/** Rewrite SQLite-only constructs, then shared placeholder/time translation. */
export function translateSqliteSql(sql: string): string {
  let out = sql;
  const hadIgnore = /\bINSERT\s+OR\s+IGNORE\s+INTO\b/i.test(out);
  out = out.replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, "INSERT INTO");

  // Mixed text/timestamptz COALESCE pairs from the SQLite era.
  out = out.replace(
    /COALESCE\((published_at|shared_at)\s*,\s*created_at\)/gi,
    "COALESCE($1::timestamptz, created_at)",
  );
  // Jobs: heartbeat/started are text; created_at is timestamptz.
  // Rewrite before the naive datetime() rewriter (nested parens break [^)]+).
  out = out.replace(
    /datetime\s*\(\s*COALESCE\s*\(\s*heartbeat_at\s*,\s*started_at\s*,\s*created_at\s*\)\s*\)/gi,
    "(COALESCE(heartbeat_at, started_at, created_at::text))::timestamptz",
  );
  out = out.replace(
    /COALESCE\s*\(\s*heartbeat_at\s*,\s*started_at\s*,\s*created_at\s*\)\s*<\s*datetime\('now',\s*\?\)/gi,
    "(COALESCE(heartbeat_at, started_at, created_at::text))::timestamptz < NOW() + CAST(? AS INTERVAL)",
  );
  out = out.replace(
    /COALESCE\s*\(\s*heartbeat_at\s*,\s*started_at\s*,\s*created_at\s*\)/gi,
    "COALESCE(heartbeat_at, started_at, created_at::text)",
  );
  // Text columns coalesced with "now" must stay text; timestamptz columns compare to NOW().
  out = out.replace(
    /COALESCE\(([a-zA-Z_][\w]*)\s*,\s*datetime\('now'\)\)/gi,
    "COALESCE($1, (NOW())::text)",
  );
  out = out.replace(
    /datetime\(COALESCE\(([^)]+)\)\)/gi,
    "(COALESCE($1))::timestamptz",
  );
  out = out
    .replace(/datetime\('now',\s*\?\)/gi, "NOW() + CAST(? AS INTERVAL)")
    .replace(
      /datetime\('now',\s*'-(\d+)\s*(minute|minutes|hour|hours|day|days)'\)/gi,
      (_m, n, unit) => `NOW() - INTERVAL '${n} ${String(unit).replace(/s$/, "")}'`,
    )
    .replace(
      /datetime\('now',\s*'\+(\d+)\s*(minute|minutes|hour|hours|day|days)'\)/gi,
      (_m, n, unit) => `NOW() + INTERVAL '${n} ${String(unit).replace(/s$/, "")}'`,
    );

  // Text timestamp columns compared against now() need an explicit cast.
  const textTs = "expires_at|updated_at|heartbeat_at|started_at|gate_run_at|published_at|stage_since|engagement_started|completed_at|scheduled_at|held_at|fixed_at|resolved_at|closed_at|uploaded_at|reviewed_at|detected_at";
  out = out.replace(
    new RegExp(`\\b(${textTs})\\s*(>|<|>=|<=)\\s*datetime\\('now'\\)`, "gi"),
    "($1)::timestamptz $2 NOW()",
  );
  out = out.replace(/datetime\('now'\)/gi, "NOW()");
  out = out.replace(
    new RegExp(`\\b(${textTs})\\s*(>|<|>=|<=)\\s*NOW\\(\\)`, "gi"),
    "($1)::timestamptz $2 NOW()",
  );
  out = out.replace(/\bdatetime\(([^)]+)\)/gi, "(($1)::timestamptz)");
  out = out.replace(/\browid\b/gi, "ctid");

  // Only columns that are true PostgreSQL booleans after migrate-to-postgres.
  // INTEGER 0/1 flags (mfa_enabled, is_platform_admin, enabled, …) must stay
  // compared as integers — casting them to TRUE/FALSE yields
  // "operator does not exist: integer = boolean".
  out = out.replace(/\bactive\s*=\s*1\b/gi, "active = TRUE");
  out = out.replace(/\bactive\s*=\s*0\b/gi, "active = FALSE");

  // Postgres has no round(double precision, int) — cast the value to numeric.
  out = out.replace(
    /\bROUND\s*\(\s*([a-zA-Z_][\w.]*)\s*,\s*(\d+)\s*\)/gi,
    "ROUND(($1)::numeric, $2)",
  );

  if (hadIgnore && !/ON\s+CONFLICT/i.test(out)) {
    out = out.replace(/;?\s*$/, " ON CONFLICT DO NOTHING");
  }
  return translate(out);
}

/**
 * Next.js RSC/route `await` boundaries drop `enterWith` ALS state. Rehydrate from the
 * session cookie when ALS is empty. Middleware already verified the JWT signature on
 * guarded paths; scripts/tests without cookies keep using explicit bindRlsFromSession.
 */
function ensureRlsFromCookie() {
  const ctx = getDbContext();
  if (ctx.userId || ctx.firmId || ctx.platformAdmin) return;
  try {
    const { cookies } = require("next/headers") as typeof import("next/headers");
    const token = cookies().get("ledger_session")?.value;
    if (!token) return;
    const { decodeJwt } = require("jose") as typeof import("jose");
    const payload = decodeJwt(token) as {
      userId?: string; firmId?: string | null;
    };
    const { bindRlsFromSession } = require("./db-context") as typeof import("./db-context");
    // Restore firm/user only — platform_admin stays opt-in via requirePlatformAdmin().
    bindRlsFromSession({
      userId: String(payload.userId || ""),
      firmId: payload.firmId ?? null,
    });
  } catch { /* outside a Next.js request (scripts, worker) */ }
}

function applyRlsViaRpc() {
  ensureRlsFromCookie();
  const ctx = getDbContext();
  rpc("query", {
    sql: "SELECT set_config('app.current_firm_id', $1, true)",
    params: [ctx.firmId ?? ""],
  });
  rpc("query", {
    sql: "SELECT set_config('app.current_user_id', $1, true)",
    params: [ctx.userId ?? ""],
  });
  rpc("query", {
    sql: "SELECT set_config('app.platform_admin', $1, true)",
    params: [ctx.platformAdmin ? "1" : "0"],
  });
}

function withAutoTx<T>(fn: () => T): T {
  if (_txDepth > 0) return fn();
  enterGate();
  rpc("begin");
  _txDepth = 1;
  try {
    applyRlsViaRpc();
    const result = fn();
    rpc("commit");
    _txDepth = 0;
    leaveGate();
    return result;
  } catch (e) {
    try { rpc("rollback"); } catch { /* ignore */ }
    _txDepth = 0;
    leaveGate();
    throw e;
  }
}

export function openPostgresDatabase(): PgDatabase {
  rpc("begin");
  try {
    applyRlsViaRpc();
    rpc("query", { sql: "SELECT 1", params: [] });
    rpc("commit");
  } catch (e) {
    try { rpc("rollback"); } catch { /* ignore */ }
    throw e;
  }

  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level: "info",
    event: "postgres.runtime_open",
    poolMax: Number(process.env.PG_POOL_MAX || 10),
    bridge: "worker-atomics",
  }));

  return {
    prepare(sql: string): PgStatement {
      const pgSql = translateSqliteSql(sql);
      return {
        get(...params: any[]) {
          const res = withAutoTx(() => rpc("query", { sql: pgSql, params }));
          return res.rows?.[0];
        },
        all(...params: any[]) {
          const res = withAutoTx(() => rpc("query", { sql: pgSql, params }));
          return res.rows || [];
        },
        run(...params: any[]) {
          const res = withAutoTx(() => rpc("query", { sql: pgSql, params }));
          return { changes: res.rowCount ?? 0, lastInsertRowid: 0 };
        },
      };
    },

    exec(sql: string) {
      const statements = sql.split(";").map((s) => s.trim()).filter(Boolean);
      withAutoTx(() => {
        for (const stmt of statements) {
          rpc("query", { sql: translateSqliteSql(stmt), params: [] });
        }
      });
    },

    transaction<T>(fn: () => T): () => T {
      return () => {
        if (_txDepth > 0) {
          const sp = `sp_${_txDepth + 1}`;
          _txDepth += 1;
          rpc("savepoint", { name: sp });
          try {
            const result = fn();
            rpc("release_savepoint", { name: sp });
            _txDepth -= 1;
            return result;
          } catch (e) {
            rpc("rollback_savepoint", { name: sp });
            _txDepth -= 1;
            throw e;
          }
        }
        rpc("begin");
        _txDepth = 1;
        try {
          applyRlsViaRpc();
          const result = fn();
          rpc("commit");
          _txDepth = 0;
          return result;
        } catch (e) {
          try { rpc("rollback"); } catch { /* ignore */ }
          _txDepth = 0;
          throw e;
        }
      };
    },

    pragma() {
      return [{ integrity_check: "ok" }];
    },

    async backup() {
      throw new Error(
        "SQLite backup API is unavailable under Postgres runtime — use pg_dump via lib/backup.ts",
      );
    },

    close() {
      try { rpc("end"); } catch { /* ignore */ }
      if (_worker) {
        try { void _worker.terminate(); } catch { /* ignore */ }
        _worker = null;
      }
      _txDepth = 0;
    },
  };
}

export function closePostgresPool() {
  if (_worker) {
    try { rpc("end"); } catch { /* ignore */ }
    try { void _worker.terminate(); } catch { /* ignore */ }
    _worker = null;
  }
}

export function isPostgresRuntimeEnabled(): boolean {
  const flag = String(process.env.POSTGRES_RUNTIME_ENABLED || "").toLowerCase();
  return (flag === "1" || flag === "true" || flag === "yes") && Boolean(process.env.DATABASE_URL);
}
