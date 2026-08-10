/**
 * Tax Intelligence persistence — issues, facts, authorities, rules, scenarios.
 * Read-only toward accounting actuals / releases / QBO.
 */

import { createHash } from "crypto";
import { db, uid } from "../db";
import { runTaxRule, TAX_RULES } from "./rules";
import { generateTaxAnalysis, identifyMissingFacts } from "./analysis";
import { fetchAuthorityPage } from "./fetch-authority";
import { factGraphStatus } from "./fact-graph";
import type {
  AuthoritySourceType, FactProvenance, FactType, TaxAnalysis, TaxAuthority,
  TaxAuthorityReference, TaxIssue, TaxIssueFact, TaxIssueStatus, TaxRuleResult, TaxScenario,
} from "./types";

function rowIssue(r: any): TaxIssue {
  return {
    id: r.id, clientId: r.client_id, title: r.title, description: r.description || "",
    taxYear: r.tax_year, entityType: r.entity_type, status: r.status,
    createdBy: r.created_by, assignedTo: r.assigned_to,
    analysisJson: r.analysis_json ? JSON.parse(r.analysis_json) : null,
    reviewedBy: r.reviewed_by, reviewedAt: r.reviewed_at,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function rowFact(r: any): TaxIssueFact {
  return {
    id: r.id, taxIssueId: r.tax_issue_id, factKey: r.fact_key, factValue: r.fact_value,
    factType: r.fact_type, provenance: r.provenance, sourceDocumentId: r.source_document_id,
    verified: !!r.verified, createdBy: r.created_by, createdAt: r.created_at,
  };
}

function rowAuth(r: any): TaxAuthority {
  return {
    id: r.id, sourceType: r.source_type, title: r.title, citation: r.citation,
    url: r.url, taxYear: r.tax_year, effectiveDate: r.effective_date,
    publishedDate: r.published_date, retrievedAt: r.retrieved_at,
    contentHash: r.content_hash, status: r.status,
  };
}

export function taxIntelligenceEnabled(): boolean {
  return !["0", "false", "no", "off", ""].includes(
    String(process.env.TAX_INTELLIGENCE_ENABLED ?? "1").toLowerCase(),
  );
}

export function ensureSeedAuthorities() {
  const d = db();
  const n = (d.prepare("SELECT COUNT(*) c FROM tax_authorities").get() as any).c;
  if (n > 0) return;
  const now = new Date().toISOString();
  const rows: [string, AuthoritySourceType, string, string, string, number | null][] = [
    ["auth-irc-179", "IRC", "Election to expense certain depreciable business assets", "IRC §179",
      "https://www.law.cornell.edu/uscode/text/26/179", null],
    ["auth-rp-2024-40", "REV_PROCEDURE", "2025 inflation adjustments including §179 limits", "Rev. Proc. 2024-40",
      "https://www.irs.gov/irb/2024-45_IRB", 2025],
    ["auth-pub-946", "PUBLICATION", "How To Depreciate Property", "IRS Publication 946",
      "https://www.irs.gov/publications/p946", null],
  ];
  const ins = d.prepare(`
    INSERT INTO tax_authorities
      (id, source_type, title, citation, url, tax_year, status, retrieved_at)
    VALUES (?,?,?,?,?,?, 'ACTIVE', ?)
  `);
  for (const r of rows) ins.run(...r, now);
}

export function listAuthorities(): TaxAuthority[] {
  ensureSeedAuthorities();
  return db().prepare("SELECT * FROM tax_authorities ORDER BY source_type, citation").all().map(rowAuth);
}

export function listIssues(clientId?: string): TaxIssue[] {
  if (clientId) {
    return db().prepare(
      `SELECT * FROM tax_issues WHERE client_id=? ORDER BY updated_at DESC`,
    ).all(clientId).map(rowIssue);
  }
  return db().prepare(`SELECT * FROM tax_issues ORDER BY updated_at DESC LIMIT 100`).all().map(rowIssue);
}

export function getIssue(id: string): TaxIssue | null {
  const r = db().prepare("SELECT * FROM tax_issues WHERE id=?").get(id);
  return r ? rowIssue(r) : null;
}

export function assertIssueClient(issueId: string, clientId: string): TaxIssue {
  const issue = getIssue(issueId);
  if (!issue || issue.clientId !== clientId) throw new Error("Tax issue not found for client.");
  return issue;
}

export function createIssue(input: {
  clientId: string; title: string; description: string; taxYear: number;
  entityType: string; createdBy: string;
}): TaxIssue {
  const client = db().prepare("SELECT id FROM clients WHERE id=?").get(input.clientId);
  if (!client) throw new Error("Client not found.");
  if (!Number.isInteger(input.taxYear) || input.taxYear < 2000 || input.taxYear > 2100) {
    throw new Error("Valid tax_year is required.");
  }
  const id = uid();
  const now = new Date().toISOString();
  db().prepare(`
    INSERT INTO tax_issues
      (id, client_id, title, description, tax_year, entity_type, status, created_by, created_at, updated_at)
    VALUES (?,?,?,?,?,?, 'OPEN', ?, ?, ?)
  `).run(
    id, input.clientId, input.title.trim(), input.description || "",
    input.taxYear, input.entityType || "OTHER", input.createdBy, now, now,
  );
  return getIssue(id)!;
}

export function updateIssueStatus(id: string, status: TaxIssueStatus) {
  db().prepare(
    `UPDATE tax_issues SET status=?, updated_at=? WHERE id=?`,
  ).run(status, new Date().toISOString(), id);
}

export function listFacts(issueId: string): TaxIssueFact[] {
  return db().prepare(
    `SELECT * FROM tax_issue_facts WHERE tax_issue_id=? ORDER BY created_at`,
  ).all(issueId).map(rowFact);
}

export function factsMap(issueId: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of listFacts(issueId)) out[f.factKey] = f.factValue;
  return out;
}

export function upsertFact(input: {
  taxIssueId: string; factKey: string; factValue: string; factType: FactType;
  provenance: FactProvenance; sourceDocumentId?: string | null;
  verified?: boolean; createdBy: string;
}): TaxIssueFact {
  const key = input.factKey.trim().toLowerCase().replace(/\s+/g, "_");
  if (!/^[a-z0-9_]{1,64}$/.test(key)) throw new Error("Invalid fact_key.");
  // Never accept SSN-like keys
  if (/ssn|social_security|itin|full_tin/.test(key)) {
    throw new Error("SSN / TIN fields are not collected in this phase.");
  }
  const existing: any = db().prepare(
    `SELECT id FROM tax_issue_facts WHERE tax_issue_id=? AND fact_key=?`,
  ).get(input.taxIssueId, key);

  if (existing) {
    db().prepare(`
      UPDATE tax_issue_facts SET fact_value=?, fact_type=?, provenance=?,
        source_document_id=?, verified=?, created_by=? WHERE id=?
    `).run(
      String(input.factValue), input.factType, input.provenance,
      input.sourceDocumentId || null, input.verified ? 1 : 0, input.createdBy, existing.id,
    );
    db().prepare(`UPDATE tax_issues SET updated_at=? WHERE id=?`)
      .run(new Date().toISOString(), input.taxIssueId);
    return listFacts(input.taxIssueId).find((f) => f.id === existing.id)!;
  }

  const id = uid();
  db().prepare(`
    INSERT INTO tax_issue_facts
      (id, tax_issue_id, fact_key, fact_value, fact_type, provenance, source_document_id, verified, created_by)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(
    id, input.taxIssueId, key, String(input.factValue), input.factType, input.provenance,
    input.sourceDocumentId || null, input.verified ? 1 : 0, input.createdBy,
  );
  db().prepare(`UPDATE tax_issues SET updated_at=? WHERE id=?`)
    .run(new Date().toISOString(), input.taxIssueId);
  return listFacts(input.taxIssueId).find((f) => f.id === id)!;
}

export function attachAuthorityToIssue(issueId: string, authorityId: string) {
  const auth = db().prepare("SELECT id FROM tax_authorities WHERE id=?").get(authorityId);
  if (!auth) throw new Error("Authority not found.");
  db().prepare(`
    INSERT OR IGNORE INTO tax_issue_authorities (id, tax_issue_id, authority_id) VALUES (?,?,?)
  `).run(uid(), issueId, authorityId);
}

export function issueAuthorities(issueId: string): TaxAuthorityReference[] {
  ensureSeedAuthorities();
  const rows: any[] = db().prepare(`
    SELECT a.* FROM tax_authorities a
    JOIN tax_issue_authorities ia ON ia.authority_id = a.id
    WHERE ia.tax_issue_id=?
  `).all(issueId);
  return rows.map((r) => ({
    authorityId: r.id, citation: r.citation, title: r.title,
    sourceType: r.source_type, url: r.url,
  }));
}

export function createAuthorityManual(input: {
  sourceType: AuthoritySourceType; title: string; citation: string;
  url?: string | null; taxYear?: number | null; excerpt?: string;
}): TaxAuthority {
  const id = uid();
  const now = new Date().toISOString();
  db().prepare(`
    INSERT INTO tax_authorities
      (id, source_type, title, citation, url, tax_year, status, retrieved_at, content_hash)
    VALUES (?,?,?,?,?,?, 'ACTIVE', ?, ?)
  `).run(
    id, input.sourceType, input.title, input.citation, input.url || null,
    input.taxYear ?? null, now, null,
  );
  if (input.excerpt) {
    const hash = createHash("sha256").update(input.excerpt).digest("hex");
    db().prepare(`
      INSERT INTO tax_source_snapshots (id, authority_id, retrieved_at, content_hash, content_text, metadata_json)
      VALUES (?,?,?,?,?,?)
    `).run(uid(), id, now, hash, input.excerpt.slice(0, 80_000), JSON.stringify({ manual: true }));
    db().prepare(`UPDATE tax_authorities SET content_hash=? WHERE id=?`).run(hash, id);
  }
  return rowAuth(db().prepare("SELECT * FROM tax_authorities WHERE id=?").get(id));
}

export async function ingestAuthorityUrl(url: string, meta?: {
  sourceType?: AuthoritySourceType; title?: string; citation?: string; taxYear?: number | null;
}): Promise<TaxAuthority> {
  const page = await fetchAuthorityPage(url);
  const id = uid();
  db().prepare(`
    INSERT INTO tax_authorities
      (id, source_type, title, citation, url, tax_year, status, retrieved_at, content_hash)
    VALUES (?,?,?,?,?,?, 'ACTIVE', ?, ?)
  `).run(
    id,
    meta?.sourceType || "OTHER",
    meta?.title || page.url,
    meta?.citation || page.url,
    page.url,
    meta?.taxYear ?? null,
    page.retrievedAt,
    page.contentHash,
  );
  db().prepare(`
    INSERT INTO tax_source_snapshots (id, authority_id, retrieved_at, content_hash, content_text, metadata_json)
    VALUES (?,?,?,?,?,?)
  `).run(
    uid(), id, page.retrievedAt, page.contentHash, page.text,
    JSON.stringify({ url: page.url }),
  );
  return rowAuth(db().prepare("SELECT * FROM tax_authorities WHERE id=?").get(id));
}

export function runIssueRule(opts: {
  issueId: string; ruleKey: string; createdBy: string; factsOverride?: Record<string, string>;
}): { result: TaxRuleResult; runId: string } {
  const issue = getIssue(opts.issueId);
  if (!issue) throw new Error("Issue not found.");
  if (!issue.taxYear) throw new Error("Tax year is required to run a rule.");

  const facts = { ...factsMap(opts.issueId), ...(opts.factsOverride || {}) };
  const result = runTaxRule({ ruleKey: opts.ruleKey, taxYear: issue.taxYear, facts });
  const runId = uid();
  db().prepare(`
    INSERT INTO tax_rule_runs
      (id, tax_issue_id, rule_key, rule_version, tax_year, inputs_json, result_json,
       authority_refs_json, engine, engine_version, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    runId, opts.issueId, result.ruleKey, result.ruleVersion, result.taxYear,
    JSON.stringify(facts), JSON.stringify(result), JSON.stringify(result.authorityRefs),
    "hathorn-native", result.ruleVersion, opts.createdBy,
  );

  // Auto-attach authorities referenced by the rule
  for (const a of result.authorityRefs) {
    const exists = db().prepare("SELECT id FROM tax_authorities WHERE id=?").get(a.authorityId);
    if (exists) attachAuthorityToIssue(opts.issueId, a.authorityId);
  }

  if (result.status === "NEEDS_INFORMATION") updateIssueStatus(opts.issueId, "NEEDS_INFORMATION");
  else if (result.status === "ELIGIBLE" || result.status === "NOT_ELIGIBLE") {
    updateIssueStatus(opts.issueId, "RESEARCHING");
  }

  return { result, runId };
}

export function listRuleRuns(issueId: string) {
  return db().prepare(
    `SELECT * FROM tax_rule_runs WHERE tax_issue_id=? ORDER BY created_at DESC`,
  ).all(issueId).map((r: any) => ({
    id: r.id,
    ruleKey: r.rule_key,
    ruleVersion: r.rule_version,
    taxYear: r.tax_year,
    result: JSON.parse(r.result_json) as TaxRuleResult,
    engine: r.engine,
    createdAt: r.created_at,
  }));
}

export function createScenario(input: {
  taxIssueId: string; name: string; facts: Record<string, string>; createdBy: string;
}): TaxScenario {
  const issue = getIssue(input.taxIssueId);
  if (!issue) throw new Error("Issue not found.");
  const id = uid();
  const now = new Date().toISOString();
  db().prepare(`
    INSERT INTO tax_scenarios (id, tax_issue_id, name, tax_year, facts_json, created_by, created_at)
    VALUES (?,?,?,?,?,?,?)
  `).run(id, input.taxIssueId, input.name.trim(), issue.taxYear, JSON.stringify(input.facts), input.createdBy, now);
  return {
    id, taxIssueId: input.taxIssueId, name: input.name.trim(), taxYear: issue.taxYear,
    factsJson: input.facts, createdBy: input.createdBy, createdAt: now,
  };
}

export function listScenarios(issueId: string): TaxScenario[] {
  return db().prepare(
    `SELECT * FROM tax_scenarios WHERE tax_issue_id=? ORDER BY created_at`,
  ).all(issueId).map((r: any) => ({
    id: r.id, taxIssueId: r.tax_issue_id, name: r.name, taxYear: r.tax_year,
    factsJson: JSON.parse(r.facts_json), createdBy: r.created_by, createdAt: r.created_at,
  }));
}

export function runScenario(opts: {
  scenarioId: string; ruleKey: string; createdBy: string;
}) {
  const sc: any = db().prepare("SELECT * FROM tax_scenarios WHERE id=?").get(opts.scenarioId);
  if (!sc) throw new Error("Scenario not found.");
  const base = factsMap(sc.tax_issue_id);
  const overlay = JSON.parse(sc.facts_json) as Record<string, string>;
  const facts = { ...base, ...overlay };
  const result = runTaxRule({ ruleKey: opts.ruleKey, taxYear: sc.tax_year, facts });
  const id = uid();
  db().prepare(`
    INSERT INTO tax_scenario_runs
      (id, scenario_id, engine, rule_versions, result_json, authority_refs_json, created_at)
    VALUES (?,?,?,?,?,?,?)
  `).run(
    id, opts.scenarioId, "hathorn-native", result.ruleVersion,
    JSON.stringify(result), JSON.stringify(result.authorityRefs), new Date().toISOString(),
  );
  return { runId: id, result };
}

export async function analyzeIssue(issueId: string, createdBy: string): Promise<TaxAnalysis> {
  const issue = getIssue(issueId);
  if (!issue) throw new Error("Issue not found.");
  const facts = listFacts(issueId);
  const authorities = issueAuthorities(issueId);
  const runs = listRuleRuns(issueId);
  const ruleResults = runs.slice(0, 5).map((r) => r.result);
  const scenarios = listScenarios(issueId);
  const scenarioNotes = scenarios.map((s) => `Scenario ${s.name}: ${JSON.stringify(s.factsJson)}`);

  const excerpts: string[] = db().prepare(`
    SELECT s.content_text FROM tax_source_snapshots s
    JOIN tax_issue_authorities ia ON ia.authority_id = s.authority_id
    WHERE ia.tax_issue_id=?
    ORDER BY s.retrieved_at DESC LIMIT 5
  `).all(issueId).map((r: any) => String(r.content_text || "").slice(0, 4000));

  const analysis = await generateTaxAnalysis({
    issue, facts, authorities, ruleResults, scenarioNotes, sourceExcerpts: excerpts,
  });

  db().prepare(`
    UPDATE tax_issues SET analysis_json=?, status=?, updated_at=? WHERE id=?
  `).run(
    JSON.stringify(analysis),
    analysis.missingFacts.length ? "NEEDS_INFORMATION" : "DRAFT_CONCLUSION",
    new Date().toISOString(),
    issueId,
  );
  void createdBy;
  return analysis;
}

export function reviewIssue(issueId: string, reviewerId: string) {
  db().prepare(`
    UPDATE tax_issues SET status='REVIEWED', reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=?
  `).run(reviewerId, new Date().toISOString(), new Date().toISOString(), issueId);
}

export function closeIssue(issueId: string) {
  updateIssueStatus(issueId, "CLOSED");
}

export function issueBundle(issueId: string) {
  const issue = getIssue(issueId);
  if (!issue) return null;
  const facts = listFacts(issueId);
  const runs = listRuleRuns(issueId);
  const missing = identifyMissingFacts(facts, runs.map((r) => r.result));
  return {
    issue,
    facts,
    authorities: issueAuthorities(issueId),
    ruleRuns: runs,
    scenarios: listScenarios(issueId),
    missingFacts: missing,
    rules: TAX_RULES,
    factGraph: factGraphStatus(),
    documents: listClientDocuments(issue.clientId),
  };
}

function listClientDocuments(clientId: string) {
  try {
    return db().prepare(
      `SELECT id, document_type, original_filename, status, uploaded_at
       FROM source_documents WHERE client_id=? AND status IN ('APPROVED','NEEDS_REVIEW','PARSED')
       ORDER BY uploaded_at DESC LIMIT 20`,
    ).all(clientId);
  } catch {
    return [];
  }
}

/** Separation probe — Tax Intelligence must not mutate accounting. */
export function accountingFingerprint(clientId: string) {
  const d = db();
  const periods = (d.prepare("SELECT COUNT(*) n FROM periods WHERE client_id=?").get(clientId) as any).n;
  const pl = (d.prepare(
    `SELECT COUNT(*) n FROM pl_lines WHERE period_id IN (SELECT id FROM periods WHERE client_id=?)`,
  ).get(clientId) as any).n;
  const releases = (d.prepare(
    `SELECT COUNT(*) n, COALESCE(SUM(length(snapshot)),0) bytes FROM release_records WHERE client_id=?`,
  ).get(clientId) as any);
  const fpa = (d.prepare("SELECT COUNT(*) n FROM fpa_model_runs WHERE client_id=?").get(clientId) as any).n;
  return { periods, pl, releaseCount: releases.n, releaseBytes: releases.bytes, fpaRuns: fpa };
}

export { TAX_RULES };
