/**
 * Accounting Guidance persistence — issues, sources, chunks, analysis versions.
 * Never mutates GL / releases / QBO / tax / FP&A actuals.
 */

import { createHash } from "crypto";
import { db, uid } from "../db";
import { getResearchRetriever } from "./retrieval";
import { generateTechnicalAnalysis } from "./analysis";
import { ragflowStatus } from "./ragflow";
import type {
  AccountingResearchIssue, AccountingSource, ContentRights, EntityContext,
  FactProvenance, FactType, ResearchCategory, ResearchIssueStatus,
  TechnicalAccountingAnalysis,
} from "./types";
import { INDEXABLE_RIGHTS } from "./types";

function rowIssue(r: any): AccountingResearchIssue {
  return {
    id: r.id, clientId: r.client_id, title: r.title, description: r.description || "",
    category: r.category, reportingPeriod: r.reporting_period, entityContext: r.entity_context,
    status: r.status, createdBy: r.created_by, assignedTo: r.assigned_to,
    reviewedBy: r.reviewed_by, reviewedAt: r.reviewed_at,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function rowSource(r: any): AccountingSource {
  return {
    id: r.id, sourceType: r.source_type, title: r.title, citation: r.citation,
    publisher: r.publisher, sourceUrl: r.source_url, contentRights: r.content_rights,
    scope: r.scope, clientId: r.client_id, reportingPeriod: r.reporting_period,
    publishedDate: r.published_date, effectiveDate: r.effective_date,
    retrievedAt: r.retrieved_at, contentHash: r.content_hash, documentId: r.document_id,
    status: r.status, bodyText: r.body_text,
  };
}

export function accountingGuidanceEnabled(): boolean {
  return !["0", "false", "no", "off", ""].includes(
    String(process.env.ACCOUNTING_GUIDANCE_ENABLED ?? "1").toLowerCase(),
  );
}

/** Seed a tiny rights-cleared pilot corpus — no ASC Codification text. */
export async function ensurePilotCorpus() {
  const n = (db().prepare("SELECT COUNT(*) c FROM accounting_sources").get() as any).c;
  if (n > 0) return;

  const firmLease = {
    id: "src-firm-lease-checklist",
    sourceType: "FIRM_POLICY" as const,
    title: "Hathorn firm checklist — lease arrangement fact gathering (ASC 842 topics)",
    citation: "Hathorn Firm Guidance · Leases · v1",
    publisher: "Hathorn Advisory Group",
    contentRights: "INTERNAL" as ContentRights,
    scope: "FIRM" as const,
    body:
      "INTERNAL FIRM GUIDANCE — not FASB Codification text.\n\n" +
      "When evaluating a lease arrangement for a private-company client, gather:\n" +
      "1) Contract term in months and renewal options.\n" +
      "2) Payment structure (fixed, variable, or mixed).\n" +
      "3) Whether ownership transfers at end of term.\n" +
      "4) Whether a purchase option is reasonably certain to be exercised.\n" +
      "5) Economic life of the underlying asset.\n" +
      "6) Whether the asset has an alternative use to the lessor.\n\n" +
      "Classification and measurement conclusions require verification against authorized " +
      "ASC 842 materials the firm is licensed to use. This checklist does not quote the Codification.\n\n" +
      "Proposed accounting treatment remains a draft until CPA review. Do not post journal entries " +
      "from this checklist alone.\n\n" +
      "For ROU asset / lease liability, consider initial measurement of lease payments and " +
      "disclosure of lease cost. Verify effective dates for the reporting period.",
  };

  const asuMeta = {
    id: "src-asu-2016-02-meta",
    sourceType: "FASB_ASU" as const,
    title: "ASU 2016-02 Leases (Topic 842) — bibliographic reference only",
    citation: "ASU 2016-02",
    publisher: "FASB",
    contentRights: "PUBLIC" as ContentRights,
    scope: "FIRM" as const,
    sourceUrl: "https://www.fasb.org/",
    body:
      "PUBLIC bibliographic metadata for research routing. This record does NOT contain " +
      "Accounting Standards Codification text.\n\n" +
      "ASU 2016-02 established Topic 842 (Leases). Professionals must consult authorized " +
      "Codification access for paragraph-level requirements, transition, and amendments.\n\n" +
      "Hathorn does not provide an ASC mirror. If paragraph-level guidance is required, attach " +
      "USER_PROVIDED or LICENSED excerpts the firm is permitted to use.",
  };

  const synthetic = {
    id: "src-synthetic-lease-example",
    sourceType: "OTHER_INTERPRETIVE" as const,
    title: "Synthetic example — equipment lease fact pattern (training)",
    citation: "Hathorn Synthetic Example · Lease Pilot",
    publisher: "Hathorn Advisory Group",
    contentRights: "INTERNAL" as ContentRights,
    scope: "FIRM" as const,
    body:
      "SYNTHETIC EXAMPLE for product testing. Not a client. Not authoritative GAAP.\n\n" +
      "Example facts: 36-month equipment lease, fixed monthly payments, no ownership transfer, " +
      "renewal option present, economic life approximately 5 years, asset has alternative use.\n\n" +
      "Expected research behavior: identify missing facts if purchase option certainty or " +
      "discount rate is absent; retrieve firm lease checklist; refuse to invent ASC paragraph numbers.",
  };

  const now = new Date().toISOString();
  const retriever = getResearchRetriever();
  for (const s of [firmLease, asuMeta, synthetic]) {
    const hash = createHash("sha256").update(s.body).digest("hex");
    db().prepare(`
      INSERT INTO accounting_sources
        (id, source_type, title, citation, publisher, source_url, content_rights, scope, client_id,
         body_text, content_hash, status, retrieved_at)
      VALUES (?,?,?,?,?,?,?,?,NULL,?,?, 'ACTIVE', ?)
    `).run(
      s.id, s.sourceType, s.title, s.citation, s.publisher,
      (s as any).sourceUrl || null, s.contentRights, s.scope, s.body, hash, now,
    );
    await retriever.indexSource({
      id: s.id, title: s.title, citation: s.citation, publisher: s.publisher,
      sourceType: s.sourceType, contentRights: s.contentRights,
      sourceUrl: (s as any).sourceUrl || null, bodyText: s.body, effectiveDate: null,
    });
  }
}

export function listSources(opts?: { clientId?: string | null }): AccountingSource[] {
  const rows = db().prepare(`
    SELECT * FROM accounting_sources
    WHERE status='ACTIVE'
      AND (scope='FIRM' OR (scope='CLIENT' AND client_id=?))
    ORDER BY source_type, title
  `).all(opts?.clientId || null);
  return rows.map(rowSource);
}

export function getSource(id: string): AccountingSource | null {
  const r = db().prepare("SELECT * FROM accounting_sources WHERE id=?").get(id);
  return r ? rowSource(r) : null;
}

export function listIssues(clientId?: string | null): AccountingResearchIssue[] {
  if (clientId) {
    return db().prepare(
      `SELECT * FROM accounting_research_issues WHERE client_id=? ORDER BY updated_at DESC`,
    ).all(clientId).map(rowIssue);
  }
  return db().prepare(
    `SELECT * FROM accounting_research_issues ORDER BY updated_at DESC LIMIT 100`,
  ).all().map(rowIssue);
}

export function getIssue(id: string): AccountingResearchIssue | null {
  const r = db().prepare("SELECT * FROM accounting_research_issues WHERE id=?").get(id);
  return r ? rowIssue(r) : null;
}

export function createIssue(input: {
  clientId: string | null;
  title: string;
  description: string;
  category: ResearchCategory;
  reportingPeriod?: string | null;
  entityContext: EntityContext;
  createdBy: string;
}): AccountingResearchIssue {
  if (input.clientId) {
    const c = db().prepare("SELECT id FROM clients WHERE id=?").get(input.clientId);
    if (!c) throw new Error("Client not found.");
  }
  const id = uid();
  const now = new Date().toISOString();
  db().prepare(`
    INSERT INTO accounting_research_issues
      (id, client_id, title, description, category, reporting_period, entity_context,
       status, created_by, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?, 'OPEN', ?, ?, ?)
  `).run(
    id, input.clientId, input.title.trim(), input.description || "",
    input.category, input.reportingPeriod || null, input.entityContext,
    input.createdBy, now, now,
  );
  return getIssue(id)!;
}

export function listFacts(issueId: string) {
  return db().prepare(
    `SELECT * FROM accounting_issue_facts WHERE issue_id=? ORDER BY created_at`,
  ).all(issueId).map((r: any) => ({
    id: r.id, issueId: r.issue_id, factKey: r.fact_key, factValue: r.fact_value,
    factType: r.fact_type as FactType, provenance: r.provenance as FactProvenance,
    sourceDocumentId: r.source_document_id, verified: !!r.verified,
    createdBy: r.created_by, createdAt: r.created_at,
  }));
}

export function factsMap(issueId: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of listFacts(issueId)) out[f.factKey] = f.factValue;
  return out;
}

export function upsertFact(input: {
  issueId: string; factKey: string; factValue: string; factType: FactType;
  provenance: FactProvenance; sourceDocumentId?: string | null;
  verified?: boolean; createdBy: string;
}) {
  const key = input.factKey.trim().toLowerCase().replace(/\s+/g, "_");
  if (!/^[a-z0-9_]{1,64}$/.test(key)) throw new Error("Invalid fact_key.");
  const existing: any = db().prepare(
    `SELECT id FROM accounting_issue_facts WHERE issue_id=? AND fact_key=?`,
  ).get(input.issueId, key);
  if (existing) {
    db().prepare(`
      UPDATE accounting_issue_facts SET fact_value=?, fact_type=?, provenance=?,
        source_document_id=?, verified=? WHERE id=?
    `).run(
      String(input.factValue), input.factType, input.provenance,
      input.sourceDocumentId || null, input.verified ? 1 : 0, existing.id,
    );
  } else {
    db().prepare(`
      INSERT INTO accounting_issue_facts
        (id, issue_id, fact_key, fact_value, fact_type, provenance, source_document_id, verified, created_by)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      uid(), input.issueId, key, String(input.factValue), input.factType, input.provenance,
      input.sourceDocumentId || null, input.verified ? 1 : 0, input.createdBy,
    );
  }
  db().prepare(`UPDATE accounting_research_issues SET status='FACT_GATHERING', updated_at=? WHERE id=?`)
    .run(new Date().toISOString(), input.issueId);
  return listFacts(input.issueId);
}

export async function addSource(input: {
  sourceType: string;
  title: string;
  citation: string;
  publisher: string;
  contentRights: ContentRights;
  scope: "FIRM" | "CLIENT";
  clientId?: string | null;
  bodyText: string;
  sourceUrl?: string | null;
  documentId?: string | null;
  effectiveDate?: string | null;
}): Promise<AccountingSource> {
  if (input.contentRights === "UNKNOWN") {
    throw new Error("UNKNOWN content rights cannot be stored in the research corpus.");
  }
  // Contracts / client docs are fact sources — allow USER_PROVIDED but label type
  if (input.scope === "CLIENT" && !input.clientId) {
    throw new Error("Client-scoped sources require clientId.");
  }
  if (input.sourceType === "FASB_ASC" && input.contentRights === "PUBLIC") {
    // Prevent pretending full ASC is public corpus
    throw new Error(
      "FASB ASC text cannot be stored as PUBLIC corpus. Use REFERENCE_ONLY metadata or LICENSED/USER_PROVIDED excerpts.",
    );
  }
  if (input.contentRights === "REFERENCE_ONLY") {
    // Metadata only — no body indexing
    const id = uid();
    const now = new Date().toISOString();
    db().prepare(`
      INSERT INTO accounting_sources
        (id, source_type, title, citation, publisher, source_url, content_rights, scope, client_id,
         body_text, content_hash, document_id, effective_date, status, retrieved_at)
      VALUES (?,?,?,?,?,?,?,?,?,NULL,NULL,?,?, 'ACTIVE', ?)
    `).run(
      id, input.sourceType, input.title, input.citation, input.publisher,
      input.sourceUrl || null, input.contentRights, input.scope, input.clientId || null,
      input.documentId || null, input.effectiveDate || null, now,
    );
    return getSource(id)!;
  }

  if (!INDEXABLE_RIGHTS.includes(input.contentRights)) {
    throw new Error(`Content rights ${input.contentRights} are not indexable.`);
  }

  const id = uid();
  const now = new Date().toISOString();
  const hash = createHash("sha256").update(input.bodyText || "").digest("hex");
  db().prepare(`
    INSERT INTO accounting_sources
      (id, source_type, title, citation, publisher, source_url, content_rights, scope, client_id,
       body_text, content_hash, document_id, effective_date, status, retrieved_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'ACTIVE', ?)
  `).run(
    id, input.sourceType, input.title, input.citation, input.publisher,
    input.sourceUrl || null, input.contentRights, input.scope, input.clientId || null,
    input.bodyText, hash, input.documentId || null, input.effectiveDate || null, now,
  );
  await getResearchRetriever().indexSource({
    id, title: input.title, citation: input.citation, publisher: input.publisher,
    sourceType: input.sourceType, contentRights: input.contentRights,
    sourceUrl: input.sourceUrl || null, bodyText: input.bodyText, effectiveDate: input.effectiveDate || null,
  });
  return getSource(id)!;
}

export function attachSource(issueId: string, sourceId: string) {
  const s = getSource(sourceId);
  if (!s) throw new Error("Source not found.");
  const issue = getIssue(issueId);
  if (!issue) throw new Error("Issue not found.");
  if (s.scope === "CLIENT" && s.clientId && issue.clientId && s.clientId !== issue.clientId) {
    throw new Error("Source belongs to another client.");
  }
  db().prepare(`
    INSERT OR IGNORE INTO accounting_issue_sources (id, issue_id, source_id) VALUES (?,?,?)
  `).run(uid(), issueId, sourceId);
}

export function issueSources(issueId: string): AccountingSource[] {
  return db().prepare(`
    SELECT s.* FROM accounting_sources s
    JOIN accounting_issue_sources i ON i.source_id = s.id
    WHERE i.issue_id=?
  `).all(issueId).map(rowSource);
}

export async function runResearch(issueId: string, createdBy: string, query?: string) {
  const issue = getIssue(issueId);
  if (!issue) throw new Error("Issue not found.");
  const facts = factsMap(issueId);
  const factRows = listFacts(issueId);
  const factLines = factRows.map(
    (f) => `${f.factKey} = ${f.factValue}${f.verified ? " (verified)" : ""} [${f.provenance}]`,
  );

  const q = query || [
    issue.title, issue.category, issue.description,
    ...Object.entries(facts).map(([k, v]) => `${k} ${v}`),
  ].join(" ");

  const hits = await getResearchRetriever().search(q, {
    clientId: issue.clientId,
    includeFirm: true,
    limit: 10,
  });

  // Also prefer sources explicitly attached
  const attached = issueSources(issueId);
  for (const s of attached) {
    if (!hits.some((h) => h.sourceId === s.id) && s.bodyText) {
      hits.unshift({
        chunkId: `attached-${s.id}`,
        sourceId: s.id,
        score: 99,
        section: "attached",
        page: null,
        excerpt: s.bodyText.slice(0, 500),
        citation: {
          sourceId: s.id, title: s.title, publisher: s.publisher, citation: s.citation,
          sourceType: s.sourceType, excerpt: s.bodyText.slice(0, 400),
          sourceUrl: s.sourceUrl || undefined, contentRights: s.contentRights,
          effectiveDate: s.effectiveDate,
        },
      });
    }
  }

  const analysis = await generateTechnicalAnalysis({ issue, facts, hits, factLines });
  const version = ((db().prepare(
    `SELECT COALESCE(MAX(version),0) v FROM accounting_analysis_versions WHERE issue_id=?`,
  ).get(issueId) as any).v || 0) + 1;

  const id = uid();
  db().prepare(`
    INSERT INTO accounting_analysis_versions
      (id, issue_id, version, facts_snapshot, source_refs, analysis_json, model, model_version, created_by)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(
    id, issueId, version,
    JSON.stringify(facts),
    JSON.stringify(analysis.citations),
    JSON.stringify(analysis),
    analysis.model,
    analysis.source,
    createdBy,
  );

  db().prepare(`
    UPDATE accounting_research_issues SET status=?, updated_at=? WHERE id=?
  `).run(
    analysis.missingFacts.length ? "NEEDS_REVIEW" : "DRAFT",
    new Date().toISOString(),
    issueId,
  );

  return { analysis, version, analysisId: id, hitCount: hits.length };
}

export function latestAnalysis(issueId: string): {
  version: number; analysis: TechnicalAccountingAnalysis; createdAt: string; createdBy: string;
} | null {
  const r: any = db().prepare(
    `SELECT * FROM accounting_analysis_versions WHERE issue_id=? ORDER BY version DESC LIMIT 1`,
  ).get(issueId);
  if (!r) return null;
  return {
    version: r.version,
    analysis: JSON.parse(r.analysis_json),
    createdAt: r.created_at,
    createdBy: r.created_by,
  };
}

export function reviewIssue(issueId: string, reviewerId: string) {
  db().prepare(`
    UPDATE accounting_research_issues
    SET status='FINAL', reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=?
  `).run(reviewerId, new Date().toISOString(), new Date().toISOString(), issueId);
}

export function closeIssue(issueId: string) {
  db().prepare(
    `UPDATE accounting_research_issues SET status='CLOSED', updated_at=? WHERE id=?`,
  ).run(new Date().toISOString(), issueId);
}

export function issueBundle(issueId: string) {
  const issue = getIssue(issueId);
  if (!issue) return null;
  return {
    issue,
    facts: listFacts(issueId),
    sources: issueSources(issueId),
    library: listSources({ clientId: issue.clientId }),
    analysis: latestAnalysis(issueId),
    ragflow: ragflowStatus(),
    documents: listClientDocs(issue.clientId),
  };
}

function listClientDocs(clientId: string | null) {
  if (!clientId) return [];
  try {
    return db().prepare(
      `SELECT id, document_type, original_filename, status FROM source_documents
       WHERE client_id=? ORDER BY uploaded_at DESC LIMIT 20`,
    ).all(clientId);
  } catch {
    return [];
  }
}

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
  const tax = (d.prepare("SELECT COUNT(*) n FROM tax_issues WHERE client_id=?").get(clientId) as any).n;
  return { periods, pl, releaseCount: releases.n, releaseBytes: releases.bytes, fpaRuns: fpa, taxIssues: tax };
}
