CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  name TEXT NOT NULL, role TEXT NOT NULL, client_id TEXT
);
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
  template TEXT DEFAULT 'modern', brand_primary TEXT DEFAULT '#2C504D',
  brand_accent TEXT DEFAULT '#DB5928', logo_text TEXT NOT NULL, logo_sub TEXT DEFAULT '',
  logo_data TEXT DEFAULT NULL,
  target_labor_lo REAL DEFAULT 65, target_labor_hi REAL DEFAULT 72,
  notify_email TEXT DEFAULT NULL
);
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT DEFAULT 'ACTIVE'
);
CREATE TABLE IF NOT EXISTS periods (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, year INTEGER NOT NULL, month INTEGER NOT NULL,
  status TEXT DEFAULT 'AWAITING', published_at TEXT,
  UNIQUE(client_id, year, month)
);
CREATE TABLE IF NOT EXISTS pl_lines (
  id TEXT PRIMARY KEY, period_id TEXT NOT NULL, entity_id TEXT NOT NULL,
  category TEXT NOT NULL, label TEXT NOT NULL, amount REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS payroll_lines (
  id TEXT PRIMARY KEY, period_id TEXT NOT NULL, entity_id TEXT NOT NULL,
  wages REAL DEFAULT 0, ot_premium REAL DEFAULT 0, taxes REAL DEFAULT 0,
  workers_comp REAL DEFAULT 0, processing REAL DEFAULT 0, hours_paid REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ar_buckets (
  id TEXT PRIMARY KEY, period_id TEXT NOT NULL, payer TEXT NOT NULL,
  b0_30 REAL DEFAULT 0, b31_60 REAL DEFAULT 0, b61_90 REAL DEFAULT 0, b90p REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cash_balances (
  id TEXT PRIMARY KEY, period_id TEXT UNIQUE NOT NULL, operating REAL DEFAULT 0, reserve REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, title TEXT NOT NULL, target TEXT NOT NULL,
  current TEXT DEFAULT '', progress REAL DEFAULT 0, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS story_notes (
  id TEXT PRIMARY KEY, period_id TEXT NOT NULL, slot TEXT NOT NULL, tone TEXT DEFAULT 'info',
  heading TEXT NOT NULL, body TEXT NOT NULL, sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY, period_id TEXT NOT NULL,
  metric_slot TEXT NOT NULL,
  user_id TEXT NOT NULL, user_name TEXT NOT NULL, user_role TEXT NOT NULL,
  body TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, action TEXT NOT NULL, detail TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS qbo_connections (
  id TEXT PRIMARY KEY, client_id TEXT UNIQUE NOT NULL, realm_id TEXT NOT NULL,
  access_token TEXT NOT NULL, refresh_token TEXT NOT NULL,
  access_expires_at TEXT NOT NULL, refresh_expires_at TEXT NOT NULL,
  connected_by TEXT NOT NULL, connected_at TEXT DEFAULT (datetime('now')),
  last_sync_at TEXT, last_sync_status TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS qbo_account_map (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, entity_id TEXT NOT NULL,
  qbo_class_ref TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY, client_id TEXT NOT NULL, user_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS login_attempts (
  email TEXT NOT NULL, at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(email, at);

-- Hot-path indexes. Every one of these covers a foreign-key lookup that runs on
-- every dashboard render; without them SQLite full-scans the table.
CREATE INDEX IF NOT EXISTS idx_pl_period       ON pl_lines(period_id, entity_id, category);
CREATE INDEX IF NOT EXISTS idx_payroll_period  ON payroll_lines(period_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_ar_period       ON ar_buckets(period_id);
CREATE INDEX IF NOT EXISTS idx_notes_period    ON story_notes(period_id, slot, sort);
CREATE INDEX IF NOT EXISTS idx_cash_period     ON cash_balances(period_id);
CREATE INDEX IF NOT EXISTS idx_periods_client  ON periods(client_id, status, year, month);
CREATE INDEX IF NOT EXISTS idx_entities_client ON entities(client_id);
CREATE INDEX IF NOT EXISTS idx_goals_client    ON goals(client_id, active);
CREATE INDEX IF NOT EXISTS idx_comments_period ON comments(period_id, created_at);
CREATE INDEX IF NOT EXISTS idx_users_client    ON users(client_id);
CREATE INDEX IF NOT EXISTS idx_audit_user      ON audit_logs(user_id, created_at);
