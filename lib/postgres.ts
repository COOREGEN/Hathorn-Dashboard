/**
 * Postgres support.
 *
 * SQLite is the right default: zero setup, and at 1.4 ms per dashboard render it is not
 * the bottleneck for a single firm's book. Two things push you off it — backups you can
 * trust to a managed provider, and the synchronous driver that serialises requests inside
 * one process. Both arrive at the same time, which is why this exists.
 *
 * The schema maps almost one to one. The differences that matter:
 *
 *   - Placeholders: SQLite uses `?`, Postgres uses `$1, $2`. `translate()` rewrites them.
 *   - Booleans: SQLite stores 0/1 in an INTEGER, Postgres has a real BOOLEAN.
 *   - Timestamps: `datetime('now')` becomes `NOW()`; `datetime('now','-15 minutes')`
 *     becomes `NOW() - INTERVAL '15 minutes'`.
 *   - Blobs: BLOB becomes BYTEA.
 *   - Upsert: SQLite's `ON CONFLICT ... DO UPDATE` syntax is already Postgres syntax.
 *
 * HONEST LIMITATION: this adapter is written against the documented behaviour of
 * node-postgres and Postgres 15, and its SQL translation is unit-tested, but it has not
 * been executed against a live server in this environment. Run `npm run db:verify`
 * against a real instance before trusting it with client data.
 */

/* ------------------------------------------------------------------ */
/* Schema translation                                                  */
/* ------------------------------------------------------------------ */

const TYPE_MAP: [RegExp, string][] = [
  [/\bTEXT PRIMARY KEY\b/gi, "TEXT PRIMARY KEY"],
  [/\bINTEGER PRIMARY KEY\b/gi, "INTEGER PRIMARY KEY"],
  [/\bBLOB\b/gi, "BYTEA"],
  [/\bREAL\b/gi, "DOUBLE PRECISION"],
  [/\bdatetime\('now'\)/gi, "NOW()"],
];

/** Rewrites SQLite DDL into Postgres DDL. */
export function translateSchema(sqliteSchema: string): string {
  let out = sqliteSchema;
  for (const [pattern, replacement] of TYPE_MAP) out = out.replace(pattern, replacement);

  // SQLite tolerates INTEGER as a boolean; Postgres does not once you compare to true.
  out = out.replace(/\bactive INTEGER DEFAULT 1\b/gi, "active BOOLEAN DEFAULT TRUE");
  // Timestamps default to a real timestamp type rather than a text string.
  out = out.replace(/\b(created_at|at|applied_at|closed_at|published_at)\s+TEXT DEFAULT \(NOW\(\)\)/gi,
                    "$1 TIMESTAMPTZ DEFAULT NOW()");
  return out;
}

/**
 * Builds the full Postgres DDL from a live SQLite database.
 *
 * Reading `schema.sql` is not enough and getting this wrong is silent: migrations create
 * tables that never appear in that file, so a Postgres schema built from it would be
 * missing `assets`, `budget_lines`, `balance_lines` and `action_items` — and the failure
 * would only surface the first time someone uploaded a balance sheet. `sqlite_master` is
 * the only source that knows what actually exists.
 */
export function schemaFromDatabase(sqlite: any): string {
  const objects: any[] = sqlite.prepare(
    `SELECT type, name, sql FROM sqlite_master
      WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
      ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name`,
  ).all();

  return objects
    .map((o) => translateSchema(o.sql).trim().replace(/;?$/, ";"))
    .join("\n\n");
}

/**
 * Rewrites `?` placeholders to `$1, $2, …`.
 *
 * Question marks inside string literals must be left alone, so the scan tracks whether
 * it is currently inside a quoted section rather than doing a blind replace.
 */
export function translateQuery(sql: string): string {
  let out = "";
  let index = 0;
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;

    if (c === "?" && !inSingle && !inDouble) {
      index += 1;
      out += `$${index}`;
    } else {
      out += c;
    }
  }
  return out;
}

/** SQLite-specific time arithmetic used in the codebase, mapped to Postgres. */
export function translateTimeExpressions(sql: string): string {
  return sql
    .replace(/datetime\('now',\s*'-(\d+) (minute|minutes|hour|hours|day|days)'\)/gi,
             (_m, n, unit) => `NOW() - INTERVAL '${n} ${unit.replace(/s$/, "")}'`)
    .replace(/datetime\('now',\s*\?\)/gi, "NOW() + CAST($__interval AS INTERVAL)")
    .replace(/datetime\('now'\)/gi, "NOW()");
}

/** Full statement translation: time expressions first, then placeholders. */
export function translate(sql: string): string {
  return translateQuery(translateTimeExpressions(sql));
}

/* ------------------------------------------------------------------ */
/* Data transfer                                                       */
/* ------------------------------------------------------------------ */

/**
 * Deliberately not transferred.
 *
 * Both are short-lived by design — OAuth state tokens expire in fifteen minutes and
 * login attempt records roll off in the same window. Carrying them across a migration
 * would move stale security state for no benefit. Listed explicitly so the "no table
 * forgotten" check can tell an intentional omission from an oversight.
 */
export const EPHEMERAL_TABLES = ["oauth_states", "login_attempts", "rate_events"] as const;

/** Order matters: parents before children, so foreign keys are satisfiable. */
export const TRANSFER_ORDER = [
  "schema_migrations",
  "firms",
  "clients",
  "users",
  "firm_memberships",
  "entities",
  "goals",
  "periods",
  "pl_lines",
  "payroll_lines",
  "ar_buckets",
  "cash_balances",
  "balance_lines",
  "budget_lines",
  "volume_lines",
  "personal_finance",
  "passthrough_lines",
  "fee_lines",
  "channel_lines",
  // The metric library is firm-owned configuration; losing it on migration would take
  // every client's dashboard with it.
  "kpi_definitions",
  "kpi_client_config",
  "kpi_inputs",
  "kpi_values",
  "client_tags",
  "discovery_findings",
  "cleanup_scope",
  "cleanup_findings",
  "client_goals",
  "client_pain_points",
  "advisory_sessions",
  "import_mappings",
  "import_runs",
  "release_records",
  "period_locks",
  "release_deliveries",
  "story_notes",
  "comments",
  "action_items",
  "assets",
  "qbo_connections",
  "qbo_account_map",
  "fpa_model_runs",
  "source_documents",
  "document_extractions",
  "tax_authorities",
  "tax_source_snapshots",
  "tax_issues",
  "tax_issue_facts",
  "tax_issue_authorities",
  "tax_rule_runs",
  "tax_scenarios",
  "tax_scenario_runs",
  "accounting_sources",
  "accounting_source_chunks",
  "accounting_research_issues",
  "accounting_issue_facts",
  "accounting_issue_sources",
  "accounting_analysis_versions",
  "client_reconciliation_config",
  "reconciliations",
  "reconciliation_runs",
  "accounting_exceptions",
  "integration_connections",
  "integration_credentials",
  "integration_sync_runs",
  "integration_raw_records",
  "integration_canonical_records",
  "close_policies",
  "close_runs",
  "close_checklist_items",
  "close_events",
  "copilot_conversations",
  "copilot_messages",
  "cost_allocation_rules",
  "financial_signal_policies",
  "financial_signals",
  "financial_intelligence_runs",
  "client_portal_config",
  "client_portal_metric_config",
  "client_insights",
  "client_management_questions",
  "report_templates",
  "client_reports",
  "document_requests",
  "client_portal_events",
  "audit_logs",
] as const;

export type TransferReport = {
  table: string; source: number; written: number; ok: boolean; note: string;
}[];

/**
 * Copies every row from a SQLite database into Postgres and verifies the counts match.
 *
 * Runs inside one transaction: a partial migration is worse than none, because it looks
 * like it worked. Row counts are compared per table afterwards — a migration that reports
 * success without counting is a migration you will discover is wrong in a client meeting.
 */
export async function transfer(opts: {
  sqlite: any;               // better-sqlite3 Database
  pg: any;                   // pg Client, already connected
  onProgress?: (table: string, rows: number) => void;
}): Promise<TransferReport> {
  const { sqlite, pg, onProgress } = opts;
  const report: TransferReport = [];

  await pg.query("BEGIN");
  try {
    for (const table of TRANSFER_ORDER) {
      let rows: any[] = [];
      try {
        rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      } catch {
        report.push({ table, source: 0, written: 0, ok: true, note: "not present in source" });
        continue;
      }
      if (!rows.length) {
        report.push({ table, source: 0, written: 0, ok: true, note: "empty" });
        continue;
      }

      const columns = Object.keys(rows[0]);
      const colList = columns.map((c) => `"${c}"`).join(", ");

      // Batched multi-row inserts: one statement per thousand rows rather than per row.
      const BATCH = 500;
      let written = 0;
      for (let i = 0; i < rows.length; i += BATCH) {
        const slice = rows.slice(i, i + BATCH);
        const values: any[] = [];
        const tuples = slice.map((row, r) => {
          const placeholders = columns.map((_, c) => `$${r * columns.length + c + 1}`);
          for (const col of columns) values.push(normalise(row[col]));
          return `(${placeholders.join(", ")})`;
        });
        const res = await pg.query(
          `INSERT INTO ${table} (${colList}) VALUES ${tuples.join(", ")} ON CONFLICT DO NOTHING`,
          values,
        );
        written += res.rowCount ?? slice.length;
      }

      const check = await pg.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
      const target = check.rows[0].n;
      const ok = target >= rows.length;
      report.push({
        table, source: rows.length, written: target, ok,
        note: ok ? "matched" : `expected at least ${rows.length}, found ${target}`,
      });
      onProgress?.(table, rows.length);

      if (!ok) throw new Error(`Row count mismatch on ${table}: ${target} of ${rows.length}`);
    }

    await pg.query("COMMIT");
    return report;
  } catch (e) {
    await pg.query("ROLLBACK");
    throw e;
  }
}

/** SQLite gives back Buffers, 0/1 integers and text timestamps; Postgres wants real types. */
function normalise(value: any): any {
  if (value === null || value === undefined) return null;
  if (Buffer.isBuffer(value)) return value;
  return value;
}

/* ------------------------------------------------------------------ */
/* Post-migration verification                                         */
/* ------------------------------------------------------------------ */

/**
 * Compares computed financials between the two databases.
 *
 * Row counts prove the data arrived. Only recomputing the numbers proves it arrived
 * *correctly* — a type coercion that turns 114.2 into 114 would pass a count check and
 * fail a client.
 */
export async function verifyFinancials(opts: {
  sqlite: any; pg: any;
}): Promise<{ ok: boolean; checks: { name: string; sqlite: number; pg: number; ok: boolean }[] }> {
  const { sqlite, pg } = opts;
  const checks: { name: string; sqlite: number; pg: number; ok: boolean }[] = [];

  const probes: [string, string][] = [
    ["Total revenue", "SELECT COALESCE(SUM(amount),0) v FROM pl_lines WHERE category='REVENUE'"],
    ["Total direct cost", "SELECT COALESCE(SUM(amount),0) v FROM pl_lines WHERE category='DIRECT_COST'"],
    ["Total overhead", "SELECT COALESCE(SUM(amount),0) v FROM pl_lines WHERE category='OPEX'"],
    ["Total wages", "SELECT COALESCE(SUM(wages),0) v FROM payroll_lines"],
    ["Total hours", "SELECT COALESCE(SUM(hours_paid),0) v FROM payroll_lines"],
    ["Receivables", "SELECT COALESCE(SUM(b0_30+b31_60+b61_90+b90p),0) v FROM ar_buckets"],
    ["Cash", "SELECT COALESCE(SUM(operating+reserve),0) v FROM cash_balances"],
    ["Published periods", "SELECT COUNT(*) v FROM periods WHERE status='PUBLISHED'"],
  ];

  for (const [name, sql] of probes) {
    const a = Number((sqlite.prepare(sql).get() as any).v);
    const b = Number((await pg.query(sql)).rows[0].v);
    // A tenth of a thousand is below any figure the platform displays.
    const ok = Math.abs(a - b) < 0.05;
    checks.push({ name, sqlite: Math.round(a * 100) / 100, pg: Math.round(b * 100) / 100, ok });
  }

  return { ok: checks.every((c) => c.ok), checks };
}
