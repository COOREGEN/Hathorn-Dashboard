/**
 * Migrations.
 *
 * `CREATE TABLE IF NOT EXISTS` plus hand-run ALTER statements desync the moment you
 * deploy twice. Every schema change is a numbered step here; the runner applies only
 * what a database hasn't seen and records it. Safe to call on every boot.
 *
 * Rules: never edit a shipped migration, only append. Each one must be safe to run
 * against a database that already has the change (deployments overlap).
 */

import type BetterSqlite3 from "better-sqlite3";

type Migration = { id: number; name: string; up: (db: BetterSqlite3.Database) => void };

/** Adds a column only when it's absent, so re-running is harmless. */
function addColumn(db: BetterSqlite3.Database, table: string, column: string, decl: string) {
  const cols: any[] = db.prepare(`PRAGMA table_info(${table})`).all();
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
}

export const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: "baseline",
    up: () => {
      // The initial schema ships in lib/schema.sql and is applied before migrations run.
    },
  },
  {
    id: 2,
    name: "rate_events",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS rate_events (
          action TEXT NOT NULL, subject TEXT NOT NULL,
          at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_rate_events ON rate_events(action, subject, at);
      `);
    },
  },
  {
    id: 3,
    name: "session_versioning",
    up: (db) => {
      // Bumping this invalidates every JWT already issued to the user, so a password
      // reset actually ends the compromised session instead of leaving it live for 8h.
      addColumn(db, "users", "token_version", "INTEGER DEFAULT 1");
    },
  },
  {
    id: 4,
    name: "logo_files",
    up: (db) => {
      // Logos moved out of the client row: a base64 image inlined there shipped in the
      // payload of every dashboard render.
      db.exec(`
        CREATE TABLE IF NOT EXISTS assets (
          id TEXT PRIMARY KEY, client_id TEXT NOT NULL, kind TEXT NOT NULL,
          mime TEXT NOT NULL, bytes BLOB NOT NULL, size INTEGER NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_assets_client ON assets(client_id, kind);
      `);
      addColumn(db, "clients", "logo_asset_id", "TEXT DEFAULT NULL");
    },
  },
  {
    id: 5,
    name: "budgets",
    up: (db) => {
      // Actual-vs-budget is the spine of an advisory meeting and had no home.
      db.exec(`
        CREATE TABLE IF NOT EXISTS budget_lines (
          id TEXT PRIMARY KEY, client_id TEXT NOT NULL, entity_id TEXT NOT NULL,
          year INTEGER NOT NULL, month INTEGER NOT NULL,
          category TEXT NOT NULL, amount REAL NOT NULL,
          UNIQUE(client_id, entity_id, year, month, category)
        );
        CREATE INDEX IF NOT EXISTS idx_budget_lookup
          ON budget_lines(client_id, year, month);
      `);
    },
  },
  {
    id: 6,
    name: "balance_sheet",
    up: (db) => {
      // Half the financials were missing. Debt service and working capital come from here.
      db.exec(`
        CREATE TABLE IF NOT EXISTS balance_lines (
          id TEXT PRIMARY KEY, period_id TEXT NOT NULL,
          section TEXT NOT NULL,      -- CURRENT_ASSET | FIXED_ASSET | CURRENT_LIABILITY | LONG_TERM_LIABILITY | EQUITY
          label TEXT NOT NULL, amount REAL NOT NULL, sort INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_balance_period ON balance_lines(period_id, section, sort);
      `);
      addColumn(db, "periods", "debt_service_monthly", "REAL DEFAULT 0");
    },
  },
  {
    id: 7,
    name: "persistent_actions",
    up: (db) => {
      // Advisory value lives in follow-through. Actions used to vanish with the period.
      db.exec(`
        CREATE TABLE IF NOT EXISTS action_items (
          id TEXT PRIMARY KEY, client_id TEXT NOT NULL,
          opened_period_id TEXT NOT NULL, closed_period_id TEXT,
          title TEXT NOT NULL, detail TEXT DEFAULT '',
          owner TEXT DEFAULT '', due TEXT DEFAULT '',
          status TEXT DEFAULT 'OPEN',   -- OPEN | DONE | DROPPED
          impact REAL DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          closed_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_actions_client ON action_items(client_id, status);
      `);
    },
  },
  {
    id: 8,
    name: "client_vertical_and_disclosure",
    up: (db) => {
      // Sections 03 and 04 were hardcoded to home care. This lets the spine adapt
      // without forking the component.
      addColumn(db, "clients", "vertical", "TEXT DEFAULT 'home_care'");
      addColumn(db, "clients", "volume_unit", "TEXT DEFAULT 'Hours delivered'");
      addColumn(db, "clients", "receivable_label", "TEXT DEFAULT 'payer'");
      addColumn(db, "clients", "fiscal_year_start", "INTEGER DEFAULT 1");
    },
  },
  {
    id: 9,
    name: "comparability_context",
    up: (db) => {
      // Comparing a 28-day February to a 31-day March reports a 10% revenue decline
      // that is entirely calendar. Comparing accrual to cash is worse. Neither was
      // detectable before, because none of this was recorded.
      addColumn(db, "clients", "currency", "TEXT DEFAULT 'USD'");
      addColumn(db, "clients", "accounting_basis", "TEXT DEFAULT 'ACCRUAL'");
      addColumn(db, "periods", "accounting_basis", "TEXT DEFAULT NULL");
      addColumn(db, "periods", "currency", "TEXT DEFAULT NULL");
      // Actual days covered. Usually the calendar month, but a stub period at the start
      // of an engagement is not, and it must not be compared as if it were.
      addColumn(db, "periods", "days_covered", "INTEGER DEFAULT NULL");
      // Set once at close so a comparison can tell whether the books were reconciled.
      addColumn(db, "periods", "reconciled", "INTEGER DEFAULT 0");
    },
  },
  {
    id: 10,
    name: "persist_gate_result",
    up: (db) => {
      // The gate already runs on upload and on approve. Recording its verdict means
      // confidence can read it rather than re-deriving it on every render, and means
      // "did this month tie out" survives as a fact about the period.
      addColumn(db, "periods", "gate_pass", "INTEGER DEFAULT NULL");
      addColumn(db, "periods", "gate_detail", "TEXT DEFAULT NULL");
      addColumn(db, "periods", "gate_run_at", "TEXT DEFAULT NULL");
    },
  },
  {
    id: 11,
    name: "vertical_volume",
    up: (db) => {
      // Volume was hardcoded as payroll hours, which only describes a labour business.
      // A rental sells nights, a childcare centre enrols children, a contractor completes
      // jobs. Capacity matters too: occupancy and enrolment are ratios, not counts.
      db.exec(`
        CREATE TABLE IF NOT EXISTS volume_lines (
          id TEXT PRIMARY KEY, period_id TEXT NOT NULL, entity_id TEXT NOT NULL,
          units_sold REAL NOT NULL DEFAULT 0,
          units_available REAL DEFAULT NULL,
          revenue_units REAL DEFAULT NULL,
          note TEXT DEFAULT '',
          UNIQUE(period_id, entity_id)
        );
        CREATE INDEX IF NOT EXISTS idx_volume_period ON volume_lines(period_id);
      `);
      // An individual's snapshot: no P&L structure, but tax and savings matter.
      db.exec(`
        CREATE TABLE IF NOT EXISTS personal_finance (
          id TEXT PRIMARY KEY, period_id TEXT NOT NULL UNIQUE,
          gross_earnings REAL DEFAULT 0,
          representation_fees REAL DEFAULT 0,
          estimated_tax_rate REAL DEFAULT 0.30,
          tax_reserved REAL DEFAULT 0,
          personal_draws REAL DEFAULT 0,
          savings_balance REAL DEFAULT 0
        );
      `);
      addColumn(db, "clients", "fiscal_note", "TEXT DEFAULT ''");
    },
  },
  {
    id: 12,
    name: "management_basis",
    up: (db) => {
      /**
       * Property management has two bottom lines and both have to be right.
       *
       * The manager collects gross bookings on behalf of owners, remits occupancy and
       * sales tax to the state, disburses the balance to owners, and keeps a management
       * fee. QuickBooks sees the gross flow, so book revenue can be ten times management
       * revenue. Reporting either number without the other is misleading: the owner asks
       * "what did we make" and the CPA asks "does this tie to the books".
       *
       * This table is the bridge between them, and the gate checks it reconciles.
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS passthrough_lines (
          id TEXT PRIMARY KEY, period_id TEXT NOT NULL, entity_id TEXT,
          kind TEXT NOT NULL,     -- SALES_TAX | OCCUPANCY_TAX | OWNER_DISBURSEMENT | RESERVE | OTHER
          label TEXT NOT NULL, amount REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_passthrough_period ON passthrough_lines(period_id, kind);
      `);

      /**
       * Fees earned against fees actually collected, and services billed against services
       * paid for. A manager who charges a $150 cleaning fee and pays a cleaner $165 is
       * losing money on every turn and it is invisible in the P&L — both sides net into
       * different accounts.
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS fee_lines (
          id TEXT PRIMARY KEY, period_id TEXT NOT NULL, entity_id TEXT,
          fee_type TEXT NOT NULL, -- MANAGEMENT | CLEANING | MAINTENANCE | BOOKING | RESORT | OTHER
          billed REAL NOT NULL DEFAULT 0,
          collected REAL NOT NULL DEFAULT 0,
          cost REAL NOT NULL DEFAULT 0,
          note TEXT DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_fee_period ON fee_lines(period_id, fee_type);
      `);

      // Channel mix: which platform brought the revenue and what it cost to acquire.
      db.exec(`
        CREATE TABLE IF NOT EXISTS channel_lines (
          id TEXT PRIMARY KEY, period_id TEXT NOT NULL, entity_id TEXT,
          channel TEXT NOT NULL,
          gross_bookings REAL NOT NULL DEFAULT 0,
          channel_fees REAL NOT NULL DEFAULT 0,
          nights REAL DEFAULT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_channel_period ON channel_lines(period_id);
      `);

      // Gross flow recorded on the period so the bridge has a starting figure.
      addColumn(db, "periods", "gross_bookings", "REAL DEFAULT NULL");
      addColumn(db, "periods", "book_net_income", "REAL DEFAULT NULL");
    },
  },
  {
    id: 13,
    name: "kpi_registry",
    up: (db) => {
      /**
       * The metric registry.
       *
       * Hardcoded verticals were the wrong shape. They required me to invent a healthy
       * band for every industry, and an invented band is worse than none — it looks
       * authoritative and nobody knows where the number came from.
       *
       * The firm owns the definitions instead. A metric is a formula over named inputs;
       * a client activates the ones that apply and sets targets from its own history or
       * an agreed goal. Verticals survive as *presets* — a suggested starting selection —
       * rather than as hardcoded truth.
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS kpi_definitions (
          id TEXT PRIMARY KEY,
          key TEXT NOT NULL UNIQUE,
          label TEXT NOT NULL,
          description TEXT DEFAULT '',
          category TEXT DEFAULT 'General',
          -- FORMULA: computed from inputs. ACCOUNT_WATCH: a single ledger line.
          -- NON_FINANCIAL: imported operational data, no ledger involvement.
          kind TEXT NOT NULL DEFAULT 'FORMULA',
          formula TEXT NOT NULL DEFAULT '',
          unit TEXT NOT NULL DEFAULT 'money',        -- money | percent | ratio | count | days
          direction TEXT NOT NULL DEFAULT 'higher_is_better',
          -- Materiality below which a movement is reported as flat rather than coloured.
          materiality_abs REAL DEFAULT NULL,
          materiality_rel REAL DEFAULT NULL,
          decimals INTEGER DEFAULT 1,
          -- Firm-authored guidance shown with the metric. This is where expertise lives.
          guidance TEXT DEFAULT '',
          is_default INTEGER DEFAULT 0,
          created_by TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_kpi_key ON kpi_definitions(key);
      `);

      /**
       * Per-client activation. Targets live here, never in the definition, because a
       * band that is right for one client is wrong for the next in the same industry.
       * `source` records where the number came from, so nobody has to guess later.
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS kpi_client_config (
          id TEXT PRIMARY KEY,
          client_id TEXT NOT NULL,
          kpi_key TEXT NOT NULL,
          active INTEGER DEFAULT 1,
          importance INTEGER DEFAULT 2,             -- 1 low, 2 normal, 3 high
          target_lo REAL DEFAULT NULL,
          target_hi REAL DEFAULT NULL,
          target_point REAL DEFAULT NULL,
          -- AGREED: set with the client. DERIVED: from their own trailing history.
          -- BENCHMARK: external data with a documented source. NONE: reported, not judged.
          target_source TEXT DEFAULT 'NONE',
          target_note TEXT DEFAULT '',
          sort INTEGER DEFAULT 0,
          UNIQUE(client_id, kpi_key)
        );
        CREATE INDEX IF NOT EXISTS idx_kpi_client ON kpi_client_config(client_id, active);
      `);

      /**
       * Non-financial inputs: headcount, units, occupancy, customers — anything the
       * ledger does not carry but a metric needs. Fathom calls these non-financial KPIs;
       * without them most useful ratios cannot be built at all.
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS kpi_inputs (
          id TEXT PRIMARY KEY,
          period_id TEXT NOT NULL,
          entity_id TEXT,
          input_key TEXT NOT NULL,
          value REAL NOT NULL,
          note TEXT DEFAULT '',
          UNIQUE(period_id, entity_id, input_key)
        );
        CREATE INDEX IF NOT EXISTS idx_kpi_inputs ON kpi_inputs(period_id, input_key);
      `);

      // Computed results, so a published period's metrics are reproducible even if a
      // definition changes later.
      db.exec(`
        CREATE TABLE IF NOT EXISTS kpi_values (
          id TEXT PRIMARY KEY,
          period_id TEXT NOT NULL,
          entity_id TEXT,
          kpi_key TEXT NOT NULL,
          value REAL,
          computed_at TEXT DEFAULT (datetime('now')),
          UNIQUE(period_id, entity_id, kpi_key)
        );
        CREATE INDEX IF NOT EXISTS idx_kpi_values ON kpi_values(period_id, kpi_key);
      `);
    },
  },
  {
    id: 14,
    name: "portfolio_tags",
    up: (db) => {
      // Tags let a firm slice its book the way it actually thinks about it — by service
      // tier, by partner, by industry, by "watch this one". Fathom's insight is that the
      // cohort average has to follow the filter, so like is compared with like.
      db.exec(`
        CREATE TABLE IF NOT EXISTS client_tags (
          id TEXT PRIMARY KEY, client_id TEXT NOT NULL, tag TEXT NOT NULL,
          UNIQUE(client_id, tag)
        );
        CREATE INDEX IF NOT EXISTS idx_client_tags ON client_tags(tag);
      `);
      // Who owns the relationship, so a partner can filter to their own book.
      addColumn(db, "clients", "owner_user_id", "TEXT DEFAULT NULL");
      // The day of the following month a close is expected. Drives the overdue signal.
      addColumn(db, "clients", "close_due_day", "INTEGER DEFAULT 15");
    },
  },
  {
    id: 15,
    name: "engagement_lifecycle",
    up: (db) => {
      /**
       * The engagement, not just the dashboard.
       *
       * The platform was built around the monthly review and skipped everything that
       * makes the review meaningful: the discovery call that finds the gaps, the
       * historical audit and cleanup that makes the books trustworthy, and the goals
       * session where the client says what they actually care about.
       *
       * That last omission was the worst. Targets carry a provenance of AGREED, DERIVED,
       * BENCHMARK or NONE — and there was no way to record an agreement, because the
       * meeting where agreement happens did not exist in the system. Every client sat
       * permanently at "not yet agreed".
       */
      addColumn(db, "clients", "stage", "TEXT DEFAULT 'DISCOVERY'");
      // SQLite rejects a non-constant default on ADD COLUMN, so the timestamp is
      // backfilled rather than defaulted.
      addColumn(db, "clients", "stage_since", "TEXT DEFAULT NULL");
      db.prepare("UPDATE clients SET stage_since = datetime('now') WHERE stage_since IS NULL").run();
      addColumn(db, "clients", "engagement_started", "TEXT DEFAULT NULL");
      addColumn(db, "clients", "advisory_cadence", "TEXT DEFAULT 'MONTHLY'");

      // What the discovery call surfaced. The origin of everything downstream.
      db.exec(`
        CREATE TABLE IF NOT EXISTS discovery_findings (
          id TEXT PRIMARY KEY, client_id TEXT NOT NULL,
          kind TEXT NOT NULL,        -- INEFFICIENCY | GAP | RISK | OPPORTUNITY
          area TEXT DEFAULT '',      -- bookkeeping, payroll, receivables, pricing, tax…
          title TEXT NOT NULL, detail TEXT DEFAULT '',
          severity TEXT DEFAULT 'medium',
          status TEXT DEFAULT 'OPEN',   -- OPEN | ADDRESSED | ACCEPTED | SUPERSEDED
          -- The through-line: a finding becomes a goal becomes a tracked metric.
          became_goal_id TEXT DEFAULT NULL,
          found_at TEXT DEFAULT (datetime('now')),
          resolved_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_findings_client ON discovery_findings(client_id, status);
      `);

      /**
       * The historical audit and cleanup — the heart of the service.
       *
       * Nothing downstream is trustworthy until this is done, and the platform had no
       * representation of it at all. A client in cleanup should not be shown a polished
       * dashboard of numbers nobody has verified.
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS cleanup_scope (
          id TEXT PRIMARY KEY, client_id TEXT NOT NULL,
          period_from TEXT NOT NULL, period_to TEXT NOT NULL,
          source_system TEXT DEFAULT '',
          status TEXT DEFAULT 'NOT_STARTED', -- NOT_STARTED | IN_PROGRESS | COMPLETE
          started_at TEXT, completed_at TEXT, note TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS cleanup_findings (
          id TEXT PRIMARY KEY, client_id TEXT NOT NULL, scope_id TEXT,
          category TEXT NOT NULL,   -- UNRECONCILED | MISCLASSIFIED | MISSING | DUPLICATE | UNSUPPORTED
          title TEXT NOT NULL, detail TEXT DEFAULT '',
          amount REAL DEFAULT 0,
          periods_affected TEXT DEFAULT '',
          status TEXT DEFAULT 'OPEN',  -- OPEN | FIXED | ACCEPTED
          found_at TEXT DEFAULT (datetime('now')), fixed_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_cleanup_client ON cleanup_findings(client_id, status);
      `);

      /**
       * The goals session. Where a client says what they want and what they are afraid of,
       * and where a target stops being a guess and becomes an agreement.
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS client_goals (
          id TEXT PRIMARY KEY, client_id TEXT NOT NULL,
          title TEXT NOT NULL, detail TEXT DEFAULT '',
          horizon TEXT DEFAULT 'YEAR',   -- QUARTER | YEAR | THREE_YEAR
          target_date TEXT DEFAULT '',
          -- The metric that will tell you whether it happened.
          measured_by_kpi TEXT DEFAULT NULL,
          target_value REAL DEFAULT NULL,
          baseline_value REAL DEFAULT NULL,
          status TEXT DEFAULT 'ACTIVE',  -- ACTIVE | MET | MISSED | RETIRED
          agreed_at TEXT DEFAULT (datetime('now')),
          sort INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS client_pain_points (
          id TEXT PRIMARY KEY, client_id TEXT NOT NULL,
          title TEXT NOT NULL, detail TEXT DEFAULT '',
          -- Why it happens, in the client's words. The thing an advisor forgets by month four.
          root_cause TEXT DEFAULT '',
          measured_by_kpi TEXT DEFAULT NULL,
          status TEXT DEFAULT 'ACTIVE',
          raised_at TEXT DEFAULT (datetime('now'))
        );
      `);

      /**
       * The monthly advisory session itself: agenda, what was discussed, what was decided.
       * Commitments already existed as action items; this is the meeting they come from.
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS advisory_sessions (
          id TEXT PRIMARY KEY, client_id TEXT NOT NULL, period_id TEXT,
          kind TEXT DEFAULT 'MONTHLY',  -- DISCOVERY | GOALS | MONTHLY | QUARTERLY | AD_HOC
          scheduled_for TEXT, held_at TEXT,
          status TEXT DEFAULT 'PLANNED', -- PLANNED | HELD | SKIPPED
          agenda TEXT DEFAULT '', notes TEXT DEFAULT '',
          attendees TEXT DEFAULT '',
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_client ON advisory_sessions(client_id, scheduled_for DESC);
      `);
    },
  },
  {
    id: 16,
    name: "import_mapping",
    up: (db) => {
      /**
       * Document intake is the constraint on the whole business.
       *
       * The platform demanded CSVs with exact column names. Nobody has those — a firm has
       * a QuickBooks P&L export, a payroll register from Paycor, an AR ageing that opens
       * in Excel with the title in row 1 and totals in the last row. Reshaping those by
       * hand is roughly forty minutes a client a month, which at twenty clients is a
       * working week and makes the service model fail on arithmetic alone.
       *
       * So: accept the file as it arrives, work out what the columns mean, show that
       * interpretation once for approval, and remember it for that client forever. The
       * second month is one click.
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS import_mappings (
          id TEXT PRIMARY KEY, client_id TEXT NOT NULL,
          doc_type TEXT NOT NULL,        -- PNL | PAYROLL | AR | CASH | BALANCE | VOLUME
          source_label TEXT DEFAULT '',  -- "QuickBooks P&L by Class", so a human recognises it
          -- Which incoming header feeds which field, as JSON.
          column_map TEXT NOT NULL DEFAULT '{}',
          -- Rows to skip: report titles, blank rows, totals.
          header_row INTEGER DEFAULT 0,
          skip_patterns TEXT DEFAULT '[]',
          -- How incoming account or entity names resolve to ours.
          entity_map TEXT DEFAULT '{}',
          category_map TEXT DEFAULT '{}',
          times_used INTEGER DEFAULT 0,
          last_used TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(client_id, doc_type)
        );
        CREATE INDEX IF NOT EXISTS idx_mapping_client ON import_mappings(client_id, doc_type);
      `);

      // Every upload kept as received, so a disputed figure can be traced to its source.
      db.exec(`
        CREATE TABLE IF NOT EXISTS import_runs (
          id TEXT PRIMARY KEY, client_id TEXT NOT NULL, period_id TEXT,
          doc_type TEXT NOT NULL, filename TEXT DEFAULT '',
          row_count INTEGER DEFAULT 0, accepted INTEGER DEFAULT 0, rejected INTEGER DEFAULT 0,
          detected_as TEXT DEFAULT '', confidence REAL DEFAULT 0,
          issues TEXT DEFAULT '[]',
          raw_sample TEXT DEFAULT '',
          status TEXT DEFAULT 'PENDING',  -- PENDING | APPROVED | REJECTED
          uploaded_by TEXT, uploaded_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_runs_client ON import_runs(client_id, uploaded_at DESC);
      `);

      // Industry stops being a fixed enum and becomes a tag the firm's own book defines.
      addColumn(db, "clients", "industry_tag", "TEXT DEFAULT ''");
      db.prepare("UPDATE clients SET industry_tag = REPLACE(COALESCE(vertical,''), '_', ' ') WHERE industry_tag = ''").run();
    },
  },
  {
    id: 17,
    name: "release_authority",
    up: (db) => {
      /**
       * Publication becomes a record, not a status flag.
       *
       * "Published" was a column on the period, with the figures still living in editable
       * tables underneath. So a statement a client had already read could change — someone
       * corrects a payroll line in September and the June statement quietly becomes a
       * different document. For a CPA firm that is not a bug, it is a professional
       * problem: there is no answer to "what did you send me".
       *
       * A release is therefore an immutable snapshot with a version, and the client-facing
       * surfaces read the snapshot rather than the live tables. Correcting a published
       * month means issuing an amendment that supersedes the prior version and says why —
       * which is how accountants already work.
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS release_records (
          id TEXT PRIMARY KEY,
          client_id TEXT NOT NULL,
          period_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          -- The whole statement as published, frozen. This is what the client sees.
          snapshot TEXT NOT NULL,
          -- Hash of the snapshot, so tampering is detectable and a PDF can be tied to it.
          checksum TEXT NOT NULL,
          -- The gate verdict at the moment of release, not whenever it last ran.
          gate_detail TEXT DEFAULT '',
          published_by TEXT NOT NULL,
          published_at TEXT DEFAULT (datetime('now')),
          -- ACTIVE | SUPERSEDED | REVOKED. Superseded versions are kept, never deleted.
          status TEXT DEFAULT 'ACTIVE',
          superseded_by TEXT DEFAULT NULL,
          amendment_reason TEXT DEFAULT '',
          revoked_reason TEXT DEFAULT '',
          revoked_at TEXT DEFAULT NULL,
          UNIQUE(period_id, version)
        );
        CREATE INDEX IF NOT EXISTS idx_release_client ON release_records(client_id, status);
        CREATE INDEX IF NOT EXISTS idx_release_period ON release_records(period_id, version DESC);
      `);

      /**
       * The lock. While a period is locked its source data cannot be edited by any path —
       * not upload, not the adjustment screen, not a background job. Amending is the only
       * way through, and it is deliberate and recorded.
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS period_locks (
          period_id TEXT PRIMARY KEY,
          release_id TEXT NOT NULL,
          locked_at TEXT DEFAULT (datetime('now')),
          locked_by TEXT NOT NULL,
          -- Set while an amendment is open, so the period is editable again but only
          -- within a workflow that will produce a new version.
          amendment_open INTEGER DEFAULT 0,
          amendment_reason TEXT DEFAULT '',
          amendment_by TEXT DEFAULT NULL,
          amendment_opened_at TEXT DEFAULT NULL
        );
      `);

      // Who was told, when, and whether they opened it.
      db.exec(`
        CREATE TABLE IF NOT EXISTS release_deliveries (
          id TEXT PRIMARY KEY,
          release_id TEXT NOT NULL,
          recipient TEXT NOT NULL,
          channel TEXT DEFAULT 'PORTAL',   -- PORTAL | EMAIL | LINK
          sent_at TEXT DEFAULT (datetime('now')),
          opened_at TEXT DEFAULT NULL,
          acknowledged_at TEXT DEFAULT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_delivery_release ON release_deliveries(release_id);
      `);
    },
  },
  {
    id: 18,
    name: "auth_recovery_and_mfa",
    up: (db) => {
      /**
       * Password recovery and staff MFA.
       *
       * A login that only knows a shared seed password is fine for a demo book and not
       * for client financials. Recovery tokens are stored hashed so a DB leak is not a
       * password-reset forge. MFA secrets are encrypted at rest via lib/security.
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          used_at TEXT DEFAULT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_reset_user ON password_reset_tokens(user_id, expires_at);
      `);
      addColumn(db, "users", "mfa_secret_enc", "TEXT DEFAULT NULL");
      addColumn(db, "users", "mfa_enabled", "INTEGER DEFAULT 0");
      addColumn(db, "users", "mfa_backup_hashes", "TEXT DEFAULT '[]'");
      addColumn(db, "users", "mfa_enrolled_at", "TEXT DEFAULT NULL");
    },
  },
  {
    id: 19,
    name: "fpa_model_runs",
    up: (db) => {
      /**
       * FP&A model runs — forward-looking projections based on assumptions.
       *
       * Strictly separate from release_records / pl_lines. A run freezes its inputs
       * and outputs so recomputation cannot silently change a past answer.
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS fpa_model_runs (
          id TEXT PRIMARY KEY,
          client_id TEXT NOT NULL,
          source_period_id TEXT NOT NULL,
          source_release_id TEXT DEFAULT NULL,
          scenario TEXT NOT NULL,
          engine TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          assumptions_json TEXT NOT NULL,
          results_json TEXT NOT NULL,
          checks_json TEXT NOT NULL,
          status TEXT DEFAULT 'OK',
          analysis TEXT DEFAULT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_fpa_client ON fpa_model_runs(client_id, created_at DESC);
      `);
    },
  },
  {
    id: 20,
    name: "source_documents",
    up: (db) => {
      /**
       * Document Intelligence — source evidence + extraction history.
       *
       * Separate from pl_lines / release_records / import_runs. Approving a document
       * never posts to the GL. Reprocessing appends a new extraction row.
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS source_documents (
          id TEXT PRIMARY KEY,
          client_id TEXT NOT NULL,
          period_id TEXT DEFAULT NULL,
          document_type TEXT NOT NULL,
          original_filename TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          storage_reference TEXT NOT NULL,
          sha256 TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'UPLOADED',
          reviewed_json TEXT DEFAULT NULL,
          notes TEXT DEFAULT NULL,
          uploaded_by TEXT NOT NULL,
          uploaded_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_source_docs_client ON source_documents(client_id, uploaded_at DESC);
        CREATE INDEX IF NOT EXISTS idx_source_docs_hash ON source_documents(client_id, sha256);

        CREATE TABLE IF NOT EXISTS document_extractions (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL,
          engine TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING',
          raw_result_json TEXT DEFAULT NULL,
          structured_result_json TEXT DEFAULT NULL,
          confidence_summary TEXT DEFAULT NULL,
          error_message TEXT DEFAULT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          completed_at TEXT DEFAULT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_doc_extract_doc ON document_extractions(document_id, created_at DESC);
      `);
    },
  },
];

/**
 * Applies any migration this database hasn't recorded, in order, each in its own
 * transaction so a failure can't leave a half-applied step.
 */
export function runMigrations(db: BetterSqlite3.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT DEFAULT (datetime('now'))
  )`);

  const applied = new Set(
    (db.prepare("SELECT id FROM schema_migrations").all() as any[]).map((r) => r.id),
  );

  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    const run = db.transaction(() => {
      m.up(db);
      db.prepare("INSERT INTO schema_migrations (id, name) VALUES (?, ?)").run(m.id, m.name);
    });
    run();
    console.log(`[migrate] applied ${String(m.id).padStart(3, "0")} ${m.name}`);
  }
}

export function schemaVersion(db: BetterSqlite3.Database): number {
  const row: any = db.prepare("SELECT MAX(id) v FROM schema_migrations").get();
  return row?.v ?? 0;
}
