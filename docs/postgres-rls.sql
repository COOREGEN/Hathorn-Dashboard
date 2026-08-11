-- PostgreSQL Row-Level Security (apply after Postgres cutover).
-- Defense in depth — application authorization remains mandatory.
--
-- Session setup (per transaction, never leave on a pooled connection):
--   BEGIN;
--   SELECT set_config('app.current_firm_id', '<uuid>', true);  -- true = SET LOCAL semantics
--   ... queries ...
--   COMMIT;
--
-- Roles:
--   • Migrator / backup role — separate DB user, may BYPASSRLS (superuser or explicit grant).
--   • Application role (HATHORN_APP_ROLE / DATABASE_APP_URL) — must NOT be superuser;
--     must NOT have BYPASSRLS. Run scripts/apply-rls.ts to enforce grants.
--
-- Patterns:
--   firm_id::text = current_setting('app.current_firm_id', true)
--   client_id IN (SELECT id FROM clients
--                   WHERE firm_id::text = current_setting('app.current_firm_id', true))
--   period_id IN (SELECT p.id FROM periods p
--                   JOIN clients c ON c.id = p.client_id
--                  WHERE c.firm_id::text = current_setting('app.current_firm_id', true))
--
-- Idempotent: DROP POLICY IF EXISTS before CREATE POLICY.
-- users / login_attempts / oauth_states / rate_events / password_reset_tokens
-- are intentionally NOT under FORCE RLS so authentication can resolve identities.
-- Tenant financial and document tables remain fail-closed without firm context.
-- Platform admin sets app.platform_admin=1 only after JWT proves is_platform_admin.

/* ------------------------------------------------------------------ */
/* Enable + force RLS                                                  */
/* ------------------------------------------------------------------ */

ALTER TABLE firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE firms FORCE ROW LEVEL SECURITY;
ALTER TABLE firm_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE firm_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE ROW LEVEL SECURITY;
ALTER TABLE periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE periods FORCE ROW LEVEL SECURITY;
ALTER TABLE release_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_records FORCE ROW LEVEL SECURITY;
ALTER TABLE source_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE qbo_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE qbo_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE fpa_model_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fpa_model_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE tax_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_issues FORCE ROW LEVEL SECURITY;
ALTER TABLE reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliations FORCE ROW LEVEL SECURITY;
ALTER TABLE close_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE close_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE accounting_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_exceptions FORCE ROW LEVEL SECURITY;

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments FORCE ROW LEVEL SECURITY;
ALTER TABLE story_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_notes FORCE ROW LEVEL SECURITY;
ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_items FORCE ROW LEVEL SECURITY;
ALTER TABLE copilot_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE copilot_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE client_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_reports FORCE ROW LEVEL SECURITY;
ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE document_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_extractions FORCE ROW LEVEL SECURITY;
ALTER TABLE document_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE client_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_insights FORCE ROW LEVEL SECURITY;
ALTER TABLE client_portal_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_portal_config FORCE ROW LEVEL SECURITY;
ALTER TABLE client_portal_metric_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_portal_metric_config FORCE ROW LEVEL SECURITY;
ALTER TABLE client_management_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_management_questions FORCE ROW LEVEL SECURITY;
ALTER TABLE client_portal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_portal_events FORCE ROW LEVEL SECURITY;
ALTER TABLE financial_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_signals FORCE ROW LEVEL SECURITY;
ALTER TABLE financial_intelligence_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_intelligence_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE financial_signal_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_signal_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE tax_issue_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_issue_facts FORCE ROW LEVEL SECURITY;
ALTER TABLE tax_issue_authorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_issue_authorities FORCE ROW LEVEL SECURITY;
ALTER TABLE tax_rule_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_rule_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE tax_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_scenarios FORCE ROW LEVEL SECURITY;
ALTER TABLE tax_scenario_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_scenario_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE accounting_research_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_research_issues FORCE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE integration_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_credentials FORCE ROW LEVEL SECURITY;
ALTER TABLE integration_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_sync_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE integration_raw_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_raw_records FORCE ROW LEVEL SECURITY;
ALTER TABLE integration_canonical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_canonical_records FORCE ROW LEVEL SECURITY;
ALTER TABLE close_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE close_checklist_items FORCE ROW LEVEL SECURITY;
ALTER TABLE close_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE close_events FORCE ROW LEVEL SECURITY;
ALTER TABLE close_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE close_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE pl_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pl_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE payroll_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE ar_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_buckets FORCE ROW LEVEL SECURITY;
ALTER TABLE cash_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_balances FORCE ROW LEVEL SECURITY;
ALTER TABLE balance_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE balance_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE volume_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE volume_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities FORCE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_events FORCE ROW LEVEL SECURITY;
ALTER TABLE background_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE background_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE firm_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE firm_capabilities FORCE ROW LEVEL SECURITY;

/* ------------------------------------------------------------------ */
/* Policies — firm root                                                */
/* ------------------------------------------------------------------ */

DROP POLICY IF EXISTS firms_isolation ON firms;
CREATE POLICY firms_isolation ON firms
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  id::text = current_setting('app.current_firm_id', true)
  )
);

DROP POLICY IF EXISTS firm_memberships_isolation ON firm_memberships;
CREATE POLICY firm_memberships_isolation ON firm_memberships
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
    firm_id::text = current_setting('app.current_firm_id', true)
    OR (
      current_setting('app.current_user_id', true) <> ''
      AND user_id::text = current_setting('app.current_user_id', true)
    )
  )
);

DROP POLICY IF EXISTS firm_capabilities_isolation ON firm_capabilities;
CREATE POLICY firm_capabilities_isolation ON firm_capabilities
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  firm_id::text = current_setting('app.current_firm_id', true)
  )
);

/* ------------------------------------------------------------------ */
/* Policies — client_id direct                                         */
/* ------------------------------------------------------------------ */

DROP POLICY IF EXISTS clients_isolation ON clients;
CREATE POLICY clients_isolation ON clients
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
    firm_id::text = current_setting('app.current_firm_id', true)
    OR (
      current_setting('app.current_user_id', true) <> ''
      AND id IN (
        SELECT u.client_id FROM users u
         WHERE u.id::text = current_setting('app.current_user_id', true)
           AND u.client_id IS NOT NULL
      )
    )
  )
);

DROP POLICY IF EXISTS release_records_isolation ON release_records;
CREATE POLICY release_records_isolation ON release_records
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  )
  )
);

DROP POLICY IF EXISTS source_documents_isolation ON source_documents;
CREATE POLICY source_documents_isolation ON source_documents
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  )
  )
);

DROP POLICY IF EXISTS qbo_connections_isolation ON qbo_connections;
CREATE POLICY qbo_connections_isolation ON qbo_connections
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  )
  )
);

DROP POLICY IF EXISTS integration_connections_isolation ON integration_connections;
CREATE POLICY integration_connections_isolation ON integration_connections
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  )
  )
);

DROP POLICY IF EXISTS fpa_model_runs_isolation ON fpa_model_runs;
CREATE POLICY fpa_model_runs_isolation ON fpa_model_runs
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  )
  )
);

DROP POLICY IF EXISTS tax_issues_isolation ON tax_issues;
CREATE POLICY tax_issues_isolation ON tax_issues
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  )
  )
);

DROP POLICY IF EXISTS reconciliations_isolation ON reconciliations;
CREATE POLICY reconciliations_isolation ON reconciliations
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  )
  )
);

DROP POLICY IF EXISTS close_runs_isolation ON close_runs;
CREATE POLICY close_runs_isolation ON close_runs
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  )
  )
);

DROP POLICY IF EXISTS accounting_exceptions_isolation ON accounting_exceptions;
CREATE POLICY accounting_exceptions_isolation ON accounting_exceptions
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  )
  )
);

DROP POLICY IF EXISTS action_items_isolation ON action_items;
CREATE POLICY action_items_isolation ON action_items
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  )
  )
);

DROP POLICY IF EXISTS integration_sync_runs_isolation ON integration_sync_runs;
CREATE POLICY integration_sync_runs_isolation ON integration_sync_runs
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  )
  )
);

DROP POLICY IF EXISTS integration_canonical_records_isolation ON integration_canonical_records;
CREATE POLICY integration_canonical_records_isolation ON integration_canonical_records
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  )
  )
);

DROP POLICY IF EXISTS close_policies_isolation ON close_policies;
CREATE POLICY close_policies_isolation ON close_policies
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  )
  )
);

DROP POLICY IF EXISTS budget_lines_isolation ON budget_lines;
CREATE POLICY budget_lines_isolation ON budget_lines
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  )
  )
);

DROP POLICY IF EXISTS entities_isolation ON entities;
CREATE POLICY entities_isolation ON entities
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  )
  )
);

DROP POLICY IF EXISTS goals_isolation ON goals;
CREATE POLICY goals_isolation ON goals
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  )
  )
);

DROP POLICY IF EXISTS client_portal_metric_config_isolation ON client_portal_metric_config;
CREATE POLICY client_portal_metric_config_isolation ON client_portal_metric_config
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  )
  )
);

/* ------------------------------------------------------------------ */
/* Policies — period_id → periods → clients                            */
/* ------------------------------------------------------------------ */

DROP POLICY IF EXISTS periods_isolation ON periods;
CREATE POLICY periods_isolation ON periods
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  client_id IN (
    SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
  )
  )
);

DROP POLICY IF EXISTS comments_isolation ON comments;
CREATE POLICY comments_isolation ON comments
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  period_id IN (
    SELECT p.id FROM periods p
    JOIN clients c ON c.id = p.client_id
    WHERE c.firm_id::text = current_setting('app.current_firm_id', true)
  )
  )
);

DROP POLICY IF EXISTS story_notes_isolation ON story_notes;
CREATE POLICY story_notes_isolation ON story_notes
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  period_id IN (
    SELECT p.id FROM periods p
    JOIN clients c ON c.id = p.client_id
    WHERE c.firm_id::text = current_setting('app.current_firm_id', true)
  )
  )
);

DROP POLICY IF EXISTS pl_lines_isolation ON pl_lines;
CREATE POLICY pl_lines_isolation ON pl_lines
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  period_id IN (
    SELECT p.id FROM periods p
    JOIN clients c ON c.id = p.client_id
    WHERE c.firm_id::text = current_setting('app.current_firm_id', true)
  )
  )
);

DROP POLICY IF EXISTS payroll_lines_isolation ON payroll_lines;
CREATE POLICY payroll_lines_isolation ON payroll_lines
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  period_id IN (
    SELECT p.id FROM periods p
    JOIN clients c ON c.id = p.client_id
    WHERE c.firm_id::text = current_setting('app.current_firm_id', true)
  )
  )
);

DROP POLICY IF EXISTS ar_buckets_isolation ON ar_buckets;
CREATE POLICY ar_buckets_isolation ON ar_buckets
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  period_id IN (
    SELECT p.id FROM periods p
    JOIN clients c ON c.id = p.client_id
    WHERE c.firm_id::text = current_setting('app.current_firm_id', true)
  )
  )
);

DROP POLICY IF EXISTS cash_balances_isolation ON cash_balances;
CREATE POLICY cash_balances_isolation ON cash_balances
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  period_id IN (
    SELECT p.id FROM periods p
    JOIN clients c ON c.id = p.client_id
    WHERE c.firm_id::text = current_setting('app.current_firm_id', true)
  )
  )
);

DROP POLICY IF EXISTS balance_lines_isolation ON balance_lines;
CREATE POLICY balance_lines_isolation ON balance_lines
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  period_id IN (
    SELECT p.id FROM periods p
    JOIN clients c ON c.id = p.client_id
    WHERE c.firm_id::text = current_setting('app.current_firm_id', true)
  )
  )
);

DROP POLICY IF EXISTS volume_lines_isolation ON volume_lines;
CREATE POLICY volume_lines_isolation ON volume_lines
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  period_id IN (
    SELECT p.id FROM periods p
    JOIN clients c ON c.id = p.client_id
    WHERE c.firm_id::text = current_setting('app.current_firm_id', true)
  )
  )
);

/* ------------------------------------------------------------------ */
/* Policies — firm_id and/or client_id on row                          */
/* ------------------------------------------------------------------ */

DROP POLICY IF EXISTS copilot_conversations_isolation ON copilot_conversations;
CREATE POLICY copilot_conversations_isolation ON copilot_conversations
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  firm_id::text = current_setting('app.current_firm_id', true)
    OR client_id IN (
      SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
    )
  )
);

DROP POLICY IF EXISTS client_reports_isolation ON client_reports;
CREATE POLICY client_reports_isolation ON client_reports
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  firm_id::text = current_setting('app.current_firm_id', true)
    OR client_id IN (
      SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
    )
  )
);

DROP POLICY IF EXISTS document_requests_isolation ON document_requests;
CREATE POLICY document_requests_isolation ON document_requests
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  firm_id::text = current_setting('app.current_firm_id', true)
    OR client_id IN (
      SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
    )
  )
);

DROP POLICY IF EXISTS client_insights_isolation ON client_insights;
CREATE POLICY client_insights_isolation ON client_insights
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  firm_id::text = current_setting('app.current_firm_id', true)
    OR client_id IN (
      SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
    )
  )
);

DROP POLICY IF EXISTS client_portal_config_isolation ON client_portal_config;
CREATE POLICY client_portal_config_isolation ON client_portal_config
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  firm_id::text = current_setting('app.current_firm_id', true)
    OR client_id IN (
      SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
    )
  )
);

DROP POLICY IF EXISTS client_management_questions_isolation ON client_management_questions;
CREATE POLICY client_management_questions_isolation ON client_management_questions
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  firm_id::text = current_setting('app.current_firm_id', true)
    OR client_id IN (
      SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
    )
  )
);

DROP POLICY IF EXISTS client_portal_events_isolation ON client_portal_events;
CREATE POLICY client_portal_events_isolation ON client_portal_events
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  firm_id::text = current_setting('app.current_firm_id', true)
    OR client_id IN (
      SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
    )
  )
);

DROP POLICY IF EXISTS financial_signals_isolation ON financial_signals;
CREATE POLICY financial_signals_isolation ON financial_signals
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  firm_id::text = current_setting('app.current_firm_id', true)
    OR client_id IN (
      SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
    )
  )
);

DROP POLICY IF EXISTS financial_intelligence_runs_isolation ON financial_intelligence_runs;
CREATE POLICY financial_intelligence_runs_isolation ON financial_intelligence_runs
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  firm_id::text = current_setting('app.current_firm_id', true)
    OR client_id IN (
      SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
    )
  )
);

DROP POLICY IF EXISTS financial_signal_policies_isolation ON financial_signal_policies;
CREATE POLICY financial_signal_policies_isolation ON financial_signal_policies
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  firm_id::text = current_setting('app.current_firm_id', true)
    OR client_id IN (
      SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
    )
  )
);

DROP POLICY IF EXISTS report_templates_isolation ON report_templates;
CREATE POLICY report_templates_isolation ON report_templates
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  firm_id IS NULL
    OR firm_id::text = current_setting('app.current_firm_id', true)
  )
);

DROP POLICY IF EXISTS accounting_research_issues_isolation ON accounting_research_issues;
CREATE POLICY accounting_research_issues_isolation ON accounting_research_issues
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  client_id IS NULL
    OR client_id IN (
      SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
    )
  )
);

DROP POLICY IF EXISTS audit_logs_isolation ON audit_logs;
CREATE POLICY audit_logs_isolation ON audit_logs
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
    firm_id::text = current_setting('app.current_firm_id', true)
    OR client_id IN (
      SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
    )
    OR (
      current_setting('app.current_user_id', true) <> ''
      AND user_id::text = current_setting('app.current_user_id', true)
    )
    OR (
      firm_id IS NULL
      AND client_id IS NULL
      AND user_id IN (
        SELECT fm.user_id FROM firm_memberships fm
        WHERE fm.firm_id::text = current_setting('app.current_firm_id', true)
      )
    )
  )
);

DROP POLICY IF EXISTS ai_usage_events_isolation ON ai_usage_events;
CREATE POLICY ai_usage_events_isolation ON ai_usage_events
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  firm_id::text = current_setting('app.current_firm_id', true)
    OR client_id IN (
      SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
    )
  )
);

DROP POLICY IF EXISTS background_jobs_isolation ON background_jobs;
CREATE POLICY background_jobs_isolation ON background_jobs
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  firm_id::text = current_setting('app.current_firm_id', true)
    OR client_id IN (
      SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
    )
  )
);

/* ------------------------------------------------------------------ */
/* Policies — users (staff via membership, clients via client.firm_id) */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Policies — child tables via parent join                               */
/* ------------------------------------------------------------------ */

DROP POLICY IF EXISTS copilot_messages_isolation ON copilot_messages;
CREATE POLICY copilot_messages_isolation ON copilot_messages
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  conversation_id IN (
    SELECT cc.id FROM copilot_conversations cc
    WHERE cc.firm_id::text = current_setting('app.current_firm_id', true)
       OR cc.client_id IN (
         SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
       )
  )
  )
);

DROP POLICY IF EXISTS document_extractions_isolation ON document_extractions;
CREATE POLICY document_extractions_isolation ON document_extractions
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  document_id IN (
    SELECT sd.id FROM source_documents sd
    WHERE sd.client_id IN (
      SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
    )
  )
  )
);

DROP POLICY IF EXISTS integration_credentials_isolation ON integration_credentials;
CREATE POLICY integration_credentials_isolation ON integration_credentials
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  connection_id IN (
    SELECT ic.id FROM integration_connections ic
    WHERE ic.client_id IN (
      SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
    )
  )
  )
);

DROP POLICY IF EXISTS integration_raw_records_isolation ON integration_raw_records;
CREATE POLICY integration_raw_records_isolation ON integration_raw_records
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  connection_id IN (
    SELECT ic.id FROM integration_connections ic
    WHERE ic.client_id IN (
      SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
    )
  )
  )
);

DROP POLICY IF EXISTS reconciliation_runs_isolation ON reconciliation_runs;
CREATE POLICY reconciliation_runs_isolation ON reconciliation_runs
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  reconciliation_id IN (
    SELECT r.id FROM reconciliations r
    WHERE r.client_id IN (
      SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
    )
  )
  )
);

DROP POLICY IF EXISTS close_checklist_items_isolation ON close_checklist_items;
CREATE POLICY close_checklist_items_isolation ON close_checklist_items
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  close_run_id IN (
    SELECT cr.id FROM close_runs cr
    WHERE cr.client_id IN (
      SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
    )
  )
  )
);

DROP POLICY IF EXISTS close_events_isolation ON close_events;
CREATE POLICY close_events_isolation ON close_events
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  close_run_id IN (
    SELECT cr.id FROM close_runs cr
    WHERE cr.client_id IN (
      SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
    )
  )
  )
);

DROP POLICY IF EXISTS tax_issue_facts_isolation ON tax_issue_facts;
CREATE POLICY tax_issue_facts_isolation ON tax_issue_facts
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  tax_issue_id IN (
    SELECT ti.id FROM tax_issues ti
    WHERE ti.client_id IN (
      SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
    )
  )
  )
);

DROP POLICY IF EXISTS tax_issue_authorities_isolation ON tax_issue_authorities;
CREATE POLICY tax_issue_authorities_isolation ON tax_issue_authorities
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  tax_issue_id IN (
    SELECT ti.id FROM tax_issues ti
    WHERE ti.client_id IN (
      SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
    )
  )
  )
);

DROP POLICY IF EXISTS tax_rule_runs_isolation ON tax_rule_runs;
CREATE POLICY tax_rule_runs_isolation ON tax_rule_runs
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  tax_issue_id IN (
    SELECT ti.id FROM tax_issues ti
    WHERE ti.client_id IN (
      SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
    )
  )
  )
);

DROP POLICY IF EXISTS tax_scenarios_isolation ON tax_scenarios;
CREATE POLICY tax_scenarios_isolation ON tax_scenarios
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  tax_issue_id IN (
    SELECT ti.id FROM tax_issues ti
    WHERE ti.client_id IN (
      SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
    )
  )
  )
);

DROP POLICY IF EXISTS tax_scenario_runs_isolation ON tax_scenario_runs;
CREATE POLICY tax_scenario_runs_isolation ON tax_scenario_runs
  USING (
  current_setting('app.platform_admin', true) = '1'
  OR (
  scenario_id IN (
    SELECT ts.id FROM tax_scenarios ts
    JOIN tax_issues ti ON ti.id = ts.tax_issue_id
    WHERE ti.client_id IN (
      SELECT id FROM clients WHERE firm_id::text = current_setting('app.current_firm_id', true)
    )
  )
  )
);

