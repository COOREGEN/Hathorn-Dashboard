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
  {
    id: 21,
    name: "tax_intelligence",
    up: (db) => {
      /**
       * Tax Intelligence — research issues, facts, authorities, rule/scenario runs.
       * Strictly advisory. Never files returns or mutates accounting actuals.
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS tax_authorities (
          id TEXT PRIMARY KEY,
          source_type TEXT NOT NULL,
          title TEXT NOT NULL,
          citation TEXT NOT NULL,
          url TEXT DEFAULT NULL,
          tax_year INTEGER DEFAULT NULL,
          effective_date TEXT DEFAULT NULL,
          published_date TEXT DEFAULT NULL,
          retrieved_at TEXT DEFAULT NULL,
          content_hash TEXT DEFAULT NULL,
          status TEXT NOT NULL DEFAULT 'ACTIVE'
        );
        CREATE INDEX IF NOT EXISTS idx_tax_auth_type ON tax_authorities(source_type, citation);

        CREATE TABLE IF NOT EXISTS tax_source_snapshots (
          id TEXT PRIMARY KEY,
          authority_id TEXT NOT NULL,
          retrieved_at TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          content_text TEXT NOT NULL,
          metadata_json TEXT DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_tax_snap_auth ON tax_source_snapshots(authority_id, retrieved_at DESC);

        CREATE TABLE IF NOT EXISTS tax_issues (
          id TEXT PRIMARY KEY,
          client_id TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT DEFAULT '',
          tax_year INTEGER NOT NULL,
          entity_type TEXT NOT NULL DEFAULT 'OTHER',
          status TEXT NOT NULL DEFAULT 'OPEN',
          created_by TEXT NOT NULL,
          assigned_to TEXT DEFAULT NULL,
          analysis_json TEXT DEFAULT NULL,
          reviewed_by TEXT DEFAULT NULL,
          reviewed_at TEXT DEFAULT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_tax_issues_client ON tax_issues(client_id, updated_at DESC);

        CREATE TABLE IF NOT EXISTS tax_issue_facts (
          id TEXT PRIMARY KEY,
          tax_issue_id TEXT NOT NULL,
          fact_key TEXT NOT NULL,
          fact_value TEXT NOT NULL,
          fact_type TEXT NOT NULL,
          provenance TEXT NOT NULL,
          source_document_id TEXT DEFAULT NULL,
          verified INTEGER DEFAULT 0,
          created_by TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(tax_issue_id, fact_key)
        );
        CREATE INDEX IF NOT EXISTS idx_tax_facts_issue ON tax_issue_facts(tax_issue_id);

        CREATE TABLE IF NOT EXISTS tax_issue_authorities (
          id TEXT PRIMARY KEY,
          tax_issue_id TEXT NOT NULL,
          authority_id TEXT NOT NULL,
          UNIQUE(tax_issue_id, authority_id)
        );

        CREATE TABLE IF NOT EXISTS tax_rule_runs (
          id TEXT PRIMARY KEY,
          tax_issue_id TEXT NOT NULL,
          rule_key TEXT NOT NULL,
          rule_version TEXT NOT NULL,
          tax_year INTEGER NOT NULL,
          inputs_json TEXT NOT NULL,
          result_json TEXT NOT NULL,
          authority_refs_json TEXT NOT NULL,
          engine TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_tax_rule_runs ON tax_rule_runs(tax_issue_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS tax_scenarios (
          id TEXT PRIMARY KEY,
          tax_issue_id TEXT NOT NULL,
          name TEXT NOT NULL,
          tax_year INTEGER NOT NULL,
          facts_json TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS tax_scenario_runs (
          id TEXT PRIMARY KEY,
          scenario_id TEXT NOT NULL,
          engine TEXT NOT NULL,
          rule_versions TEXT NOT NULL,
          result_json TEXT NOT NULL,
          authority_refs_json TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);
    },
  },
  {
    id: 22,
    name: "accounting_guidance",
    up: (db) => {
      /**
       * Accounting Guidance — technical research issues, rights-aware sources,
       * native retrieval chunks, versioned analyses. No unauthorized ASC corpus.
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS accounting_sources (
          id TEXT PRIMARY KEY,
          source_type TEXT NOT NULL,
          title TEXT NOT NULL,
          citation TEXT NOT NULL,
          publisher TEXT NOT NULL,
          source_url TEXT DEFAULT NULL,
          content_rights TEXT NOT NULL,
          scope TEXT NOT NULL DEFAULT 'FIRM',
          client_id TEXT DEFAULT NULL,
          reporting_period TEXT DEFAULT NULL,
          published_date TEXT DEFAULT NULL,
          effective_date TEXT DEFAULT NULL,
          retrieved_at TEXT DEFAULT NULL,
          content_hash TEXT DEFAULT NULL,
          document_id TEXT DEFAULT NULL,
          body_text TEXT DEFAULT NULL,
          status TEXT NOT NULL DEFAULT 'ACTIVE'
        );
        CREATE INDEX IF NOT EXISTS idx_acct_src_scope ON accounting_sources(scope, client_id);

        CREATE TABLE IF NOT EXISTS accounting_source_chunks (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL,
          section TEXT DEFAULT NULL,
          page INTEGER DEFAULT NULL,
          content TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          metadata_json TEXT DEFAULT '{}',
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_acct_chunks_src ON accounting_source_chunks(source_id);

        CREATE TABLE IF NOT EXISTS accounting_research_issues (
          id TEXT PRIMARY KEY,
          client_id TEXT DEFAULT NULL,
          title TEXT NOT NULL,
          description TEXT DEFAULT '',
          category TEXT NOT NULL,
          reporting_period TEXT DEFAULT NULL,
          entity_context TEXT NOT NULL DEFAULT 'PRIVATE_COMPANY',
          status TEXT NOT NULL DEFAULT 'OPEN',
          created_by TEXT NOT NULL,
          assigned_to TEXT DEFAULT NULL,
          reviewed_by TEXT DEFAULT NULL,
          reviewed_at TEXT DEFAULT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_acct_issues_client ON accounting_research_issues(client_id, updated_at DESC);

        CREATE TABLE IF NOT EXISTS accounting_issue_facts (
          id TEXT PRIMARY KEY,
          issue_id TEXT NOT NULL,
          fact_key TEXT NOT NULL,
          fact_value TEXT NOT NULL,
          fact_type TEXT NOT NULL,
          provenance TEXT NOT NULL,
          source_document_id TEXT DEFAULT NULL,
          verified INTEGER DEFAULT 0,
          created_by TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(issue_id, fact_key)
        );

        CREATE TABLE IF NOT EXISTS accounting_issue_sources (
          id TEXT PRIMARY KEY,
          issue_id TEXT NOT NULL,
          source_id TEXT NOT NULL,
          UNIQUE(issue_id, source_id)
        );

        CREATE TABLE IF NOT EXISTS accounting_analysis_versions (
          id TEXT PRIMARY KEY,
          issue_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          facts_snapshot TEXT NOT NULL,
          source_refs TEXT NOT NULL,
          analysis_json TEXT NOT NULL,
          model TEXT NOT NULL,
          model_version TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_acct_analysis_issue ON accounting_analysis_versions(issue_id, version DESC);
      `);
    },
  },
  {
    id: 23,
    name: "reconciliation_intelligence",
    up: (db) => {
      /**
       * Reconciliation + sub-ledger intelligence.
       * Deterministic tie-outs only — never posts GL / QBO / releases.
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS client_reconciliation_config (
          id TEXT PRIMARY KEY,
          client_id TEXT NOT NULL,
          reconciliation_type TEXT NOT NULL,
          requirement TEXT NOT NULL DEFAULT 'REQUIRED',
          absolute_tolerance_cents INTEGER NOT NULL DEFAULT 100,
          percentage_tolerance REAL DEFAULT NULL,
          tolerance_source TEXT NOT NULL DEFAULT 'FIRM_DEFAULT',
          enabled INTEGER NOT NULL DEFAULT 1,
          UNIQUE(client_id, reconciliation_type)
        );
        CREATE INDEX IF NOT EXISTS idx_recon_cfg_client ON client_reconciliation_config(client_id);

        CREATE TABLE IF NOT EXISTS reconciliations (
          id TEXT PRIMARY KEY,
          client_id TEXT NOT NULL,
          period_id TEXT NOT NULL,
          reconciliation_type TEXT NOT NULL,
          control_source TEXT NOT NULL,
          supporting_source TEXT NOT NULL,
          control_amount_cents INTEGER DEFAULT NULL,
          supporting_amount_cents INTEGER DEFAULT NULL,
          difference_cents INTEGER DEFAULT NULL,
          absolute_difference_cents INTEGER DEFAULT NULL,
          percentage_difference REAL DEFAULT NULL,
          tolerance_cents INTEGER NOT NULL DEFAULT 0,
          tolerance_source TEXT NOT NULL DEFAULT 'FIRM_DEFAULT',
          status TEXT NOT NULL,
          readiness TEXT NOT NULL DEFAULT 'NEEDS_DATA',
          issues_json TEXT NOT NULL DEFAULT '[]',
          source_refs_json TEXT NOT NULL DEFAULT '{}',
          latest_run_id TEXT DEFAULT NULL,
          analysis_json TEXT DEFAULT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          reviewed_by TEXT DEFAULT NULL,
          reviewed_at TEXT DEFAULT NULL,
          UNIQUE(client_id, period_id, reconciliation_type)
        );
        CREATE INDEX IF NOT EXISTS idx_recon_client_period ON reconciliations(client_id, period_id);

        CREATE TABLE IF NOT EXISTS reconciliation_runs (
          id TEXT PRIMARY KEY,
          reconciliation_id TEXT NOT NULL,
          control_snapshot TEXT NOT NULL,
          supporting_snapshot TEXT NOT NULL,
          difference_cents INTEGER DEFAULT NULL,
          status TEXT NOT NULL,
          readiness TEXT NOT NULL,
          issues_json TEXT NOT NULL DEFAULT '[]',
          source_refs_json TEXT NOT NULL DEFAULT '{}',
          engine_version TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_recon_runs ON reconciliation_runs(reconciliation_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS accounting_exceptions (
          id TEXT PRIMARY KEY,
          client_id TEXT NOT NULL,
          period_id TEXT NOT NULL,
          reconciliation_id TEXT DEFAULT NULL,
          reconciliation_run_id TEXT DEFAULT NULL,
          type TEXT NOT NULL,
          severity TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          source_refs_json TEXT NOT NULL DEFAULT '{}',
          status TEXT NOT NULL DEFAULT 'OPEN',
          assigned_to TEXT DEFAULT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          resolved_at TEXT DEFAULT NULL,
          resolved_by TEXT DEFAULT NULL,
          resolution_note TEXT DEFAULT NULL,
          resolution_category TEXT DEFAULT NULL,
          accepted_difference_cents INTEGER DEFAULT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_acct_exc_client ON accounting_exceptions(client_id, period_id, status);
      `);
    },
  },
  {
    id: 24,
    name: "integration_hub",
    up: (db) => {
      /**
       * Integration Hub — provider-agnostic connections, sync history, staging.
       * QuickBooks tokens remain in qbo_connections (not duplicated here).
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS integration_connections (
          id TEXT PRIMARY KEY,
          client_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          external_account_id TEXT DEFAULT NULL,
          external_account_name TEXT DEFAULT NULL,
          status TEXT NOT NULL DEFAULT 'DISCONNECTED',
          connected_by TEXT DEFAULT NULL,
          connected_at TEXT DEFAULT NULL,
          last_successful_sync_at TEXT DEFAULT NULL,
          last_attempted_sync_at TEXT DEFAULT NULL,
          last_error_code TEXT DEFAULT NULL,
          last_error_message TEXT DEFAULT NULL,
          metadata_json TEXT NOT NULL DEFAULT '{}',
          UNIQUE(client_id, provider)
        );
        CREATE INDEX IF NOT EXISTS idx_integ_conn_client ON integration_connections(client_id, provider);

        CREATE TABLE IF NOT EXISTS integration_credentials (
          connection_id TEXT PRIMARY KEY,
          encrypted_payload TEXT NOT NULL,
          key_version TEXT NOT NULL DEFAULT 'enc:v1',
          updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS integration_sync_runs (
          id TEXT PRIMARY KEY,
          connection_id TEXT NOT NULL,
          client_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          sync_type TEXT NOT NULL,
          status TEXT NOT NULL,
          started_at TEXT NOT NULL,
          completed_at TEXT DEFAULT NULL,
          records_received INTEGER NOT NULL DEFAULT 0,
          records_created INTEGER NOT NULL DEFAULT 0,
          records_updated INTEGER NOT NULL DEFAULT 0,
          records_skipped INTEGER NOT NULL DEFAULT 0,
          error_code TEXT DEFAULT NULL,
          error_message TEXT DEFAULT NULL,
          cursor_or_checkpoint TEXT DEFAULT NULL,
          triggered_by TEXT NOT NULL,
          metadata_json TEXT NOT NULL DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_integ_runs_conn ON integration_sync_runs(connection_id, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_integ_runs_client ON integration_sync_runs(client_id, started_at DESC);

        CREATE TABLE IF NOT EXISTS integration_raw_records (
          id TEXT PRIMARY KEY,
          connection_id TEXT NOT NULL,
          sync_run_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          record_type TEXT NOT NULL,
          external_record_id TEXT NOT NULL,
          external_updated_at TEXT DEFAULT NULL,
          payload_json TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(connection_id, record_type, external_record_id)
        );
        CREATE INDEX IF NOT EXISTS idx_integ_raw ON integration_raw_records(connection_id, record_type);

        CREATE TABLE IF NOT EXISTS integration_canonical_records (
          id TEXT PRIMARY KEY,
          client_id TEXT NOT NULL,
          connection_id TEXT NOT NULL,
          sync_run_id TEXT NOT NULL,
          record_type TEXT NOT NULL,
          external_record_id TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          currency TEXT DEFAULT 'USD',
          period_key TEXT DEFAULT NULL,
          source_updated_at TEXT DEFAULT NULL,
          synced_at TEXT NOT NULL,
          UNIQUE(client_id, connection_id, record_type, external_record_id)
        );
        CREATE INDEX IF NOT EXISTS idx_integ_canon ON integration_canonical_records(client_id, record_type, period_key);
      `);
    },
  },
  {
    id: 25,
    name: "close_automation",
    up: (db) => {
      /**
       * Automated close + exception command center.
       * Feeds existing release engine — does not replace publish/approve.
       * Reuses accounting_exceptions; checklist items carry fingerprints for stale review.
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS close_policies (
          id TEXT PRIMARY KEY,
          client_id TEXT UNIQUE,
          name TEXT NOT NULL DEFAULT 'Firm default',
          required_documents_json TEXT NOT NULL DEFAULT '[]',
          required_reconciliations_json TEXT NOT NULL DEFAULT '[]',
          check_keys_json TEXT NOT NULL DEFAULT '[]',
          variance_rules_json TEXT NOT NULL DEFAULT '[]',
          blocking_rules_json TEXT NOT NULL DEFAULT '{}',
          review_requirements_json TEXT NOT NULL DEFAULT '{}',
          updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS close_runs (
          id TEXT PRIMARY KEY,
          client_id TEXT NOT NULL,
          period_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'NOT_STARTED',
          started_by TEXT DEFAULT NULL,
          started_at TEXT DEFAULT NULL,
          target_close_date TEXT DEFAULT NULL,
          completed_at TEXT DEFAULT NULL,
          approved_by TEXT DEFAULT NULL,
          approved_at TEXT DEFAULT NULL,
          release_id TEXT DEFAULT NULL,
          last_evaluated_at TEXT DEFAULT NULL,
          summary_json TEXT NOT NULL DEFAULT '{}',
          reopen_reason TEXT DEFAULT NULL,
          reopened_by TEXT DEFAULT NULL,
          reopened_at TEXT DEFAULT NULL,
          UNIQUE(client_id, period_id)
        );
        CREATE INDEX IF NOT EXISTS idx_close_runs_period ON close_runs(period_id, status);
        CREATE INDEX IF NOT EXISTS idx_close_runs_client ON close_runs(client_id, status);

        CREATE TABLE IF NOT EXISTS close_checklist_items (
          id TEXT PRIMARY KEY,
          close_run_id TEXT NOT NULL,
          check_key TEXT NOT NULL,
          category TEXT NOT NULL,
          title TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT 'AUTOMATED',
          required INTEGER NOT NULL DEFAULT 1,
          blocking INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'PENDING',
          assigned_to TEXT DEFAULT NULL,
          due_at TEXT DEFAULT NULL,
          completed_by TEXT DEFAULT NULL,
          completed_at TEXT DEFAULT NULL,
          waived_by TEXT DEFAULT NULL,
          waived_at TEXT DEFAULT NULL,
          waive_reason TEXT DEFAULT NULL,
          note TEXT DEFAULT NULL,
          evidence_json TEXT NOT NULL DEFAULT '{}',
          input_hash TEXT DEFAULT NULL,
          reviewed_hash TEXT DEFAULT NULL,
          reviewed_by TEXT DEFAULT NULL,
          reviewed_at TEXT DEFAULT NULL,
          last_evaluated_at TEXT DEFAULT NULL,
          exception_id TEXT DEFAULT NULL,
          UNIQUE(close_run_id, check_key)
        );
        CREATE INDEX IF NOT EXISTS idx_close_items_run ON close_checklist_items(close_run_id, status);

        CREATE TABLE IF NOT EXISTS close_events (
          id TEXT PRIMARY KEY,
          close_run_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          detail TEXT NOT NULL DEFAULT '',
          actor_id TEXT DEFAULT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_close_events_run ON close_events(close_run_id, created_at DESC);
      `);

      // Extend existing exceptions for close aggregation (TEXT columns — additive).
      try {
        db.exec(`ALTER TABLE accounting_exceptions ADD COLUMN close_run_id TEXT`);
      } catch { /* already present */ }
      try {
        db.exec(`ALTER TABLE accounting_exceptions ADD COLUMN blocking INTEGER NOT NULL DEFAULT 0`);
      } catch { /* already present */ }
      try {
        db.exec(`ALTER TABLE accounting_exceptions ADD COLUMN subsystem TEXT DEFAULT NULL`);
      } catch { /* already present */ }
    },
  },
  {
    id: 26,
    name: "multi_tenant_firms",
    up: (db) => {
      /**
       * Platform → Firm → Client ownership.
       *
       * Hathorn Advisory Group becomes the first firm tenant. Existing clients and
       * staff are assigned to it. Platform admin is a separate flag from firm ADMIN —
       * firm admins never receive cross-firm visibility by role alone.
       *
       * Client slug uniqueness stays platform-wide for URL stability on SQLite; see
       * docs/TENANCY.md. Postgres cutover can tighten to UNIQUE(firm_id, slug).
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS firms (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT UNIQUE NOT NULL,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          support_email TEXT DEFAULT NULL,
          primary_contact TEXT DEFAULT NULL,
          brand_primary TEXT DEFAULT '#2C504D',
          brand_accent TEXT DEFAULT '#DB5928',
          logo_text TEXT DEFAULT NULL,
          logo_data TEXT DEFAULT NULL,
          report_footer TEXT DEFAULT NULL,
          client_portal_name TEXT DEFAULT NULL,
          show_platform_mark INTEGER NOT NULL DEFAULT 1,
          feature_flags TEXT NOT NULL DEFAULT '{}',
          custom_domain TEXT DEFAULT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_firms_status ON firms(status);

        CREATE TABLE IF NOT EXISTS firm_memberships (
          id TEXT PRIMARY KEY,
          firm_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          role TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(firm_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_firm_memberships_user ON firm_memberships(user_id, status);
        CREATE INDEX IF NOT EXISTS idx_firm_memberships_firm ON firm_memberships(firm_id, status);
      `);

      addColumn(db, "clients", "firm_id", "TEXT DEFAULT NULL");
      addColumn(db, "users", "is_platform_admin", "INTEGER NOT NULL DEFAULT 0");
      addColumn(db, "audit_logs", "firm_id", "TEXT DEFAULT NULL");
      addColumn(db, "audit_logs", "client_id", "TEXT DEFAULT NULL");

      db.exec(`CREATE INDEX IF NOT EXISTS idx_clients_firm ON clients(firm_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_firm ON audit_logs(firm_id, created_at)`);

      // Controlled backfill: one Hathorn firm owns every existing client and staff user.
      let hathorn: any = db.prepare("SELECT id FROM firms WHERE slug=?").get("hathorn-advisory");
      if (!hathorn) {
        const id = "firm_hathorn_advisory";
        db.prepare(`
          INSERT INTO firms
            (id, name, slug, status, support_email, primary_contact,
             brand_primary, brand_accent, logo_text, report_footer, client_portal_name)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)
        `).run(
          id,
          "Hathorn Advisory Group",
          "hathorn-advisory",
          "ACTIVE",
          "noreply@hathornadvisorygroup.com",
          "Jeremiah Hathorn",
          "#2C504D",
          "#DB5928",
          "HATHORN",
          "Prepared by Hathorn Advisory Group",
          "Client Portal",
        );
        hathorn = { id };
      }

      db.prepare("UPDATE clients SET firm_id=? WHERE firm_id IS NULL").run(hathorn.id);

      const staff: any[] = db.prepare(
        "SELECT id, role FROM users WHERE role IN ('ADMIN','ADVISOR','BOOKKEEPER')",
      ).all();
      const insMem = db.prepare(`
        INSERT OR IGNORE INTO firm_memberships (id, firm_id, user_id, role, status)
        VALUES (?, ?, ?, ?, 'ACTIVE')
      `);
      for (const u of staff) {
        const memId = `fm_${u.id}_${hathorn.id}`.slice(0, 48);
        insMem.run(memId, hathorn.id, u.id, u.role);
      }

      // Client users inherit firm scope through clients.firm_id; membership optional.
      const clientsUsers: any[] = db.prepare(
        "SELECT id, client_id, role FROM users WHERE role='CLIENT' AND client_id IS NOT NULL",
      ).all();
      for (const u of clientsUsers) {
        const cl: any = db.prepare("SELECT firm_id FROM clients WHERE id=?").get(u.client_id);
        if (!cl?.firm_id) continue;
        const memId = `fm_${u.id}_${cl.firm_id}`.slice(0, 48);
        insMem.run(memId, cl.firm_id, u.id, "CLIENT");
      }

      // Platform operator: first ADMIN user (Regen in seed), only if none flagged yet.
      const anyPlatform: any = db.prepare(
        "SELECT id FROM users WHERE is_platform_admin=1 LIMIT 1",
      ).get();
      if (!anyPlatform) {
        const firstAdmin: any = db.prepare(
          "SELECT id FROM users WHERE role='ADMIN' ORDER BY email LIMIT 1",
        ).get();
        if (firstAdmin) {
          db.prepare("UPDATE users SET is_platform_admin=1 WHERE id=?").run(firstAdmin.id);
        }
      }
    },
  },
  {
    id: 27,
    name: "ai_copilot",
    up: (db) => {
      /**
       * Conversations for Ask Hathorn. Messages store references/citations, not raw
       * financial dumps or provider payloads. Tool traces are operational metadata —
       * never chain-of-thought.
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS copilot_conversations (
          id TEXT PRIMARY KEY,
          firm_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          client_id TEXT DEFAULT NULL,
          title TEXT DEFAULT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_copilot_conv_user
          ON copilot_conversations(firm_id, user_id, updated_at DESC);

        CREATE TABLE IF NOT EXISTS copilot_messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          source_status TEXT DEFAULT NULL,
          citations_json TEXT NOT NULL DEFAULT '[]',
          tools_json TEXT NOT NULL DEFAULT '[]',
          warnings_json TEXT NOT NULL DEFAULT '[]',
          model_provider TEXT DEFAULT NULL,
          model_name TEXT DEFAULT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_copilot_msg_conv
          ON copilot_messages(conversation_id, created_at);
      `);
    },
  },
  {
    id: 28,
    name: "financial_intelligence",
    up: (db) => {
      /**
       * Advanced Financial Intelligence — deterministic signals, allocation policy,
       * and reproducible analysis runs. Never invents dimensions the ledger lacks.
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS cost_allocation_rules (
          id TEXT PRIMARY KEY,
          firm_id TEXT NOT NULL,
          client_id TEXT NOT NULL,
          cost_pool TEXT NOT NULL,
          target_dimension TEXT NOT NULL DEFAULT 'ENTITY',
          allocation_method TEXT NOT NULL,
          driver_key TEXT DEFAULT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          effective_from TEXT NOT NULL,
          effective_to TEXT DEFAULT NULL,
          reason TEXT DEFAULT '',
          created_by TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          superseded_by TEXT DEFAULT NULL,
          status TEXT NOT NULL DEFAULT 'ACTIVE'
        );
        CREATE INDEX IF NOT EXISTS idx_alloc_rules_client
          ON cost_allocation_rules(client_id, status, effective_from);

        CREATE TABLE IF NOT EXISTS financial_signal_policies (
          id TEXT PRIMARY KEY,
          firm_id TEXT NOT NULL,
          client_id TEXT DEFAULT NULL,
          metric_key TEXT NOT NULL,
          method TEXT NOT NULL,
          threshold REAL NOT NULL,
          severity TEXT NOT NULL DEFAULT 'WARNING',
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          UNIQUE(firm_id, client_id, metric_key, method)
        );
        CREATE INDEX IF NOT EXISTS idx_signal_policies_firm
          ON financial_signal_policies(firm_id, enabled);

        CREATE TABLE IF NOT EXISTS financial_signals (
          id TEXT PRIMARY KEY,
          firm_id TEXT NOT NULL,
          client_id TEXT NOT NULL,
          period_id TEXT NOT NULL,
          signal_key TEXT NOT NULL,
          signal_type TEXT NOT NULL,
          metric_key TEXT NOT NULL,
          severity TEXT NOT NULL,
          title TEXT NOT NULL,
          detected_value REAL,
          reference_value REAL,
          difference REAL,
          difference_pct REAL,
          method TEXT NOT NULL,
          threshold REAL,
          status TEXT NOT NULL DEFAULT 'NEW',
          source_refs_json TEXT NOT NULL DEFAULT '[]',
          detail_json TEXT NOT NULL DEFAULT '{}',
          policy_version TEXT DEFAULT NULL,
          engine_version TEXT NOT NULL,
          detected_at TEXT DEFAULT (datetime('now')),
          reviewed_by TEXT DEFAULT NULL,
          reviewed_at TEXT DEFAULT NULL,
          UNIQUE(client_id, period_id, signal_key)
        );
        CREATE INDEX IF NOT EXISTS idx_fin_signals_client
          ON financial_signals(client_id, period_id, status);
        CREATE INDEX IF NOT EXISTS idx_fin_signals_firm
          ON financial_signals(firm_id, status, detected_at DESC);

        CREATE TABLE IF NOT EXISTS financial_intelligence_runs (
          id TEXT PRIMARY KEY,
          firm_id TEXT NOT NULL,
          client_id TEXT NOT NULL,
          period_id TEXT NOT NULL,
          source_kind TEXT NOT NULL,
          source_release_id TEXT DEFAULT NULL,
          source_data_version TEXT NOT NULL,
          engine_version TEXT NOT NULL,
          policy_version TEXT NOT NULL,
          results_json TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_fi_runs_client
          ON financial_intelligence_runs(client_id, period_id, created_at DESC);
      `);
    },
  },
  {
    id: 29,
    name: "client_experience",
    up: (db) => {
      /**
       * Client Experience + white-label presentation.
       * Visibility is EXPLICIT — clients never infer access from ownership alone.
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS client_portal_config (
          client_id TEXT PRIMARY KEY,
          firm_id TEXT NOT NULL,
          show_planning INTEGER NOT NULL DEFAULT 1,
          show_documents INTEGER NOT NULL DEFAULT 1,
          show_insights INTEGER NOT NULL DEFAULT 1,
          show_copilot INTEGER NOT NULL DEFAULT 1,
          show_financial_statements INTEGER NOT NULL DEFAULT 1,
          show_reports INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT DEFAULT (datetime('now')),
          updated_by TEXT DEFAULT NULL
        );

        CREATE TABLE IF NOT EXISTS client_portal_metric_config (
          id TEXT PRIMARY KEY,
          client_id TEXT NOT NULL,
          metric_key TEXT NOT NULL,
          display_order INTEGER NOT NULL DEFAULT 0,
          visible INTEGER NOT NULL DEFAULT 1,
          comparison_mode TEXT NOT NULL DEFAULT 'YoY',
          UNIQUE(client_id, metric_key)
        );
        CREATE INDEX IF NOT EXISTS idx_portal_metrics_client
          ON client_portal_metric_config(client_id, display_order);

        CREATE TABLE IF NOT EXISTS client_insights (
          id TEXT PRIMARY KEY,
          firm_id TEXT NOT NULL,
          client_id TEXT NOT NULL,
          period_id TEXT DEFAULT NULL,
          release_id TEXT DEFAULT NULL,
          title TEXT NOT NULL,
          section TEXT NOT NULL DEFAULT 'PERFORMANCE',
          body TEXT NOT NULL,
          source_refs_json TEXT NOT NULL DEFAULT '[]',
          status TEXT NOT NULL DEFAULT 'DRAFT',
          version INTEGER NOT NULL DEFAULT 1,
          supersedes_id TEXT DEFAULT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          published_by TEXT DEFAULT NULL,
          published_at TEXT DEFAULT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_client_insights_client
          ON client_insights(client_id, status, published_at DESC);

        CREATE TABLE IF NOT EXISTS client_management_questions (
          id TEXT PRIMARY KEY,
          firm_id TEXT NOT NULL,
          client_id TEXT NOT NULL,
          period_id TEXT DEFAULT NULL,
          release_id TEXT DEFAULT NULL,
          insight_id TEXT DEFAULT NULL,
          question TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'DRAFT',
          created_by TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          published_at TEXT DEFAULT NULL,
          response_body TEXT DEFAULT NULL,
          response_by TEXT DEFAULT NULL,
          response_at TEXT DEFAULT NULL,
          response_reviewed_by TEXT DEFAULT NULL,
          response_reviewed_at TEXT DEFAULT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_mgmt_q_client
          ON client_management_questions(client_id, status, created_at DESC);

        CREATE TABLE IF NOT EXISTS client_reports (
          id TEXT PRIMARY KEY,
          firm_id TEXT NOT NULL,
          client_id TEXT NOT NULL,
          period_id TEXT DEFAULT NULL,
          report_type TEXT NOT NULL DEFAULT 'MONTHLY_ADVISORY_REVIEW',
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'DRAFT',
          version INTEGER NOT NULL DEFAULT 1,
          source_release_id TEXT DEFAULT NULL,
          template_id TEXT DEFAULT NULL,
          content_snapshot TEXT NOT NULL,
          branding_snapshot TEXT NOT NULL,
          supersedes_id TEXT DEFAULT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          published_by TEXT DEFAULT NULL,
          published_at TEXT DEFAULT NULL,
          retracted_at TEXT DEFAULT NULL,
          retracted_by TEXT DEFAULT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_client_reports_client
          ON client_reports(client_id, status, published_at DESC);

        CREATE TABLE IF NOT EXISTS report_templates (
          id TEXT PRIMARY KEY,
          firm_id TEXT DEFAULT NULL,
          name TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          sections_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS document_requests (
          id TEXT PRIMARY KEY,
          firm_id TEXT NOT NULL,
          client_id TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT DEFAULT '',
          due_date TEXT DEFAULT NULL,
          status TEXT NOT NULL DEFAULT 'OPEN',
          requested_by TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          fulfilled_document_id TEXT DEFAULT NULL,
          client_note TEXT DEFAULT NULL,
          closed_at TEXT DEFAULT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_doc_requests_client
          ON document_requests(client_id, status, created_at DESC);

        CREATE TABLE IF NOT EXISTS client_portal_events (
          id TEXT PRIMARY KEY,
          firm_id TEXT NOT NULL,
          client_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          resource_type TEXT DEFAULT NULL,
          resource_id TEXT DEFAULT NULL,
          detail_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_portal_events_client
          ON client_portal_events(client_id, created_at DESC);
      `);

      // Explicit visibility columns — default INTERNAL / staff-only.
      const fpaCols = db.prepare("PRAGMA table_info(fpa_model_runs)").all() as any[];
      if (!fpaCols.some((c) => c.name === "visibility")) {
        db.exec(`
          ALTER TABLE fpa_model_runs ADD COLUMN visibility TEXT NOT NULL DEFAULT 'INTERNAL';
          ALTER TABLE fpa_model_runs ADD COLUMN shared_snapshot_json TEXT DEFAULT NULL;
          ALTER TABLE fpa_model_runs ADD COLUMN shared_at TEXT DEFAULT NULL;
          ALTER TABLE fpa_model_runs ADD COLUMN shared_by TEXT DEFAULT NULL;
        `);
      }
      const docCols = db.prepare("PRAGMA table_info(source_documents)").all() as any[];
      if (!docCols.some((c) => c.name === "visibility")) {
        db.exec(`
          ALTER TABLE source_documents ADD COLUMN visibility TEXT NOT NULL DEFAULT 'INTERNAL';
        `);
      }
      const commentCols = db.prepare("PRAGMA table_info(comments)").all() as any[];
      if (!commentCols.some((c) => c.name === "context_type")) {
        db.exec(`
          ALTER TABLE comments ADD COLUMN context_type TEXT DEFAULT NULL;
          ALTER TABLE comments ADD COLUMN context_id TEXT DEFAULT NULL;
        `);
      }

      // Default monthly advisory review template (platform-wide).
      db.prepare(`
        INSERT OR IGNORE INTO report_templates (id, firm_id, name, version, sections_json, status)
        VALUES (?, NULL, ?, 1, ?, 'ACTIVE')
      `).run(
        "tmpl_monthly_advisory_v1",
        "Monthly Advisory Review",
        JSON.stringify([
          "COVER", "EXECUTIVE_SUMMARY", "KEY_METRICS", "WHAT_CHANGED",
          "FINANCIAL_PERFORMANCE", "CASH_WORKING_CAPITAL", "FORECAST_OUTLOOK",
          "MANAGEMENT_QUESTIONS", "ADVISOR_COMMENTARY",
        ]),
      );
    },
  },
  {
    id: 30,
    name: "platform_operations",
    up: (db) => {
      /**
       * Platform operations + scale: durable jobs, firm capabilities, AI usage
       * aggregates, lightweight incidents. No Temporal / Kafka / warehouse.
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS background_jobs (
          id TEXT PRIMARY KEY,
          firm_id TEXT DEFAULT NULL,
          client_id TEXT DEFAULT NULL,
          job_type TEXT NOT NULL,
          resource_id TEXT DEFAULT NULL,
          concurrency_key TEXT DEFAULT NULL,
          idempotency_key TEXT DEFAULT NULL,
          status TEXT NOT NULL DEFAULT 'QUEUED',
          attempt INTEGER NOT NULL DEFAULT 0,
          max_attempts INTEGER NOT NULL DEFAULT 3,
          scheduled_at TEXT NOT NULL DEFAULT (datetime('now')),
          started_at TEXT DEFAULT NULL,
          completed_at TEXT DEFAULT NULL,
          heartbeat_at TEXT DEFAULT NULL,
          error_code TEXT DEFAULT NULL,
          error_message TEXT DEFAULT NULL,
          params_json TEXT NOT NULL DEFAULT '{}',
          result_json TEXT DEFAULT NULL,
          app_version TEXT DEFAULT NULL,
          created_by TEXT DEFAULT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(idempotency_key)
        );
        CREATE INDEX IF NOT EXISTS idx_jobs_status_sched
          ON background_jobs(status, scheduled_at);
        CREATE INDEX IF NOT EXISTS idx_jobs_type_status
          ON background_jobs(job_type, status);
        CREATE INDEX IF NOT EXISTS idx_jobs_client
          ON background_jobs(client_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_jobs_concurrency
          ON background_jobs(concurrency_key, status);

        CREATE TABLE IF NOT EXISTS firm_capabilities (
          firm_id TEXT NOT NULL,
          capability TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT DEFAULT (datetime('now')),
          updated_by TEXT DEFAULT NULL,
          PRIMARY KEY (firm_id, capability)
        );

        CREATE TABLE IF NOT EXISTS ai_usage_events (
          id TEXT PRIMARY KEY,
          firm_id TEXT DEFAULT NULL,
          client_id TEXT DEFAULT NULL,
          feature TEXT NOT NULL,
          model TEXT DEFAULT NULL,
          request_count INTEGER NOT NULL DEFAULT 1,
          input_tokens INTEGER DEFAULT NULL,
          output_tokens INTEGER DEFAULT NULL,
          status TEXT NOT NULL DEFAULT 'ok',
          error_class TEXT DEFAULT NULL,
          correlation_id TEXT DEFAULT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_ai_usage_created
          ON ai_usage_events(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_ai_usage_firm_feature
          ON ai_usage_events(firm_id, feature, created_at DESC);

        CREATE TABLE IF NOT EXISTS ops_incidents (
          id TEXT PRIMARY KEY,
          severity TEXT NOT NULL,
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'OPEN',
          detail TEXT DEFAULT NULL,
          opened_by TEXT DEFAULT NULL,
          closed_by TEXT DEFAULT NULL,
          opened_at TEXT DEFAULT (datetime('now')),
          closed_at TEXT DEFAULT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ops_incidents_status
          ON ops_incidents(status, severity);

        CREATE INDEX IF NOT EXISTS idx_audit_action_created
          ON audit_logs(action, created_at DESC);
      `);

      // Safe defaults for existing firms — all modules on except nothing published.
      const firms: any[] = db.prepare("SELECT id FROM firms").all();
      const caps = [
        "FPA", "TAX_INTELLIGENCE", "ACCOUNTING_GUIDANCE", "COPILOT",
        "CLIENT_PORTAL", "DOCUMENT_INTELLIGENCE", "INTEGRATION_HUB",
        "CLOSE_AUTOMATION", "FINANCIAL_INTELLIGENCE",
      ];
      const ins = db.prepare(`
        INSERT OR IGNORE INTO firm_capabilities (firm_id, capability, enabled)
        VALUES (?, ?, 1)
      `);
      for (const f of firms) {
        for (const c of caps) ins.run(f.id, c);
      }
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

export function schemaVersion(db: { prepare: (sql: string) => { get: (...args: any[]) => any } }): number {
  const row: any = db.prepare("SELECT MAX(id) v FROM schema_migrations").get();
  return row?.v ?? 0;
}
