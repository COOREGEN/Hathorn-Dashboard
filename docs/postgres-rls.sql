-- PostgreSQL Row-Level Security (apply after Postgres cutover).
-- Defense in depth — application authorization remains mandatory.
-- Use SET LOCAL app.current_firm_id = '<uuid>' inside each transaction.
-- Never leave firm context on a pooled connection across requests.

-- Example session setup (application code):
--   BEGIN;
--   SELECT set_config('app.current_firm_id', $1, true);
--   ... queries ...
--   COMMIT;

ALTER TABLE firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE firm_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE qbo_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE fpa_model_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE close_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_exceptions ENABLE ROW LEVEL SECURITY;

-- Service role (migrations/backups) should be a separate DB user that bypasses RLS.
-- Application role must NOT be a superuser / BYPASSRLS.

CREATE POLICY firms_isolation ON firms
  USING (id::text = current_setting('app.current_firm_id', true));

CREATE POLICY firm_memberships_isolation ON firm_memberships
  USING (firm_id::text = current_setting('app.current_firm_id', true));

CREATE POLICY clients_isolation ON clients
  USING (firm_id::text = current_setting('app.current_firm_id', true));

CREATE POLICY periods_isolation ON periods
  USING (client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  ));

CREATE POLICY release_records_isolation ON release_records
  USING (client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  ));

CREATE POLICY source_documents_isolation ON source_documents
  USING (client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  ));

CREATE POLICY qbo_connections_isolation ON qbo_connections
  USING (client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  ));

CREATE POLICY integration_connections_isolation ON integration_connections
  USING (client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  ));

CREATE POLICY fpa_model_runs_isolation ON fpa_model_runs
  USING (client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  ));

CREATE POLICY tax_issues_isolation ON tax_issues
  USING (client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  ));

CREATE POLICY reconciliations_isolation ON reconciliations
  USING (client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  ));

CREATE POLICY close_runs_isolation ON close_runs
  USING (client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  ));

CREATE POLICY accounting_exceptions_isolation ON accounting_exceptions
  USING (client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  ));
