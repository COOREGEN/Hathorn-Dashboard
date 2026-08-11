"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type {
  AccountingCitation, AccountingResearchIssue, AccountingSource,
  TechnicalAccountingAnalysis,
} from "@/lib/research/types";
import { guidanceHierarchyLabel } from "@/lib/research/source-registry";

type Fact = {
  id: string; factKey: string; factValue: string; factType: string;
  provenance: string; sourceDocumentId: string | null; verified: boolean;
};

type Bundle = {
  issue: AccountingResearchIssue;
  facts: Fact[];
  sources: AccountingSource[];
  library: AccountingSource[];
  analysis: {
    version: number;
    analysis: TechnicalAccountingAnalysis;
    createdAt: string;
    createdBy: string;
  } | null;
  ragflow: { reason: string };
  documents: { id: string; document_type: string; original_filename: string; status: string }[];
};

export default function GuidanceIssueDetail({ initial }: { initial: Bundle }) {
  const [bundle, setBundle] = useState(initial);
  const [factKey, setFactKey] = useState("contract_term_months");
  const [factValue, setFactValue] = useState("36");
  const [factType, setFactType] = useState("number");
  const [sourceId, setSourceId] = useState(initial.library[0]?.id || "");
  const [showSourceId, setShowSourceId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setError("");
    startTransition(async () => {
      const res = await fetch(`/api/research/${bundle.issue.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Action failed."); return; }
      if (data.bundle) setBundle(data.bundle);
      else {
        const g = await fetch(`/api/research/${bundle.issue.id}`);
        const full = await g.json().catch(() => ({}));
        if (full.ok) setBundle(full);
      }
    });
  }

  const a = bundle.analysis?.analysis || null;
  const evidence = showSourceId
    ? (a?.citations.find((c) => c.sourceId === showSourceId)
      || bundle.sources.find((s) => s.id === showSourceId)
      || bundle.library.find((s) => s.id === showSourceId))
    : null;

  return (
    <div>
      <p className="caption" style={{ marginBottom: 12 }}>
        <Link href={`/guidance?client=${bundle.issue.clientId || ""}`} style={{ color: "var(--ink-soft)" }}>
          ← Accounting Guidance
        </Link>
      </p>
      <h1 className="display-l" style={{ margin: 0 }}>{bundle.issue.title}</h1>
      <p className="section-q" style={{ marginTop: 8 }}>
        {bundle.issue.category.replace(/_/g, " ")} · {bundle.issue.entityContext.replace(/_/g, " ")}
        {" "}· {bundle.issue.status.replace(/_/g, " ")}
        {bundle.issue.reportingPeriod ? ` · ${bundle.issue.reportingPeriod}` : ""}
      </p>
      <p className="caption" style={{ marginTop: 8, maxWidth: 640 }}>{bundle.issue.description}</p>

      <div className="flex gap-2 flex-wrap" style={{ margin: "20px 0 28px" }}>
        <button type="button" className="btn" disabled={pending} onClick={() => act("run_research")}>
          Run research
        </button>
        <button type="button" className="chip" disabled={pending} onClick={() => act("review")}>
          CPA review / finalize
        </button>
        <button type="button" className="chip" disabled={pending} onClick={() => act("close")}>
          Close
        </button>
      </div>
      {error && <p className="caption" role="alert" style={{ color: "var(--accent-deep)" }}>{error}</p>}
      <p className="caption" style={{ marginBottom: 24 }}>{bundle.ragflow.reason}</p>

      <section style={{ marginBottom: 32 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Facts</div>
        <ul className="caption" style={{ marginBottom: 14 }}>
          {bundle.facts.map((f) => (
            <li key={f.id}>
              <span className="tnum">{f.factKey}</span> = {f.factValue}
              {" "}· {f.provenance}{f.verified ? " · verified" : " · unverified"}
            </li>
          ))}
          {!bundle.facts.length && <li>No structured facts yet.</li>}
        </ul>
        <div className="grid sm:grid-cols-4 gap-3" style={{ maxWidth: 800 }}>
          <input className="input" value={factKey} onChange={(e) => setFactKey(e.target.value)} placeholder="fact_key" />
          <input className="input tnum" value={factValue} onChange={(e) => setFactValue(e.target.value)} />
          <select className="input" value={factType} onChange={(e) => setFactType(e.target.value)}>
            <option value="number">number</option>
            <option value="string">string</option>
            <option value="boolean">boolean</option>
            <option value="currency">currency</option>
          </select>
          <button type="button" className="chip" disabled={pending}
            onClick={() => act("add_fact", { factKey, factValue, factType, provenance: "USER_ENTERED" })}>
            Add fact
          </button>
        </div>
      </section>

      <section style={{ marginBottom: 32, paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Documents</div>
        {bundle.documents.length ? (
          <ul className="caption">
            {bundle.documents.map((d) => (
              <li key={d.id}>
                <Link href={`/documents/${d.id}`} style={{ color: "var(--ink)" }}>
                  {d.original_filename}
                </Link>
                {" "}· {d.document_type} · fact source (not GAAP authority)
              </li>
            ))}
          </ul>
        ) : (
          <p className="caption">No Document Intelligence uploads linked for this client.</p>
        )}
      </section>

      <section style={{ marginBottom: 32, paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Sources</div>
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 14px" }}>
          {bundle.sources.map((s) => (
            <li key={s.id} className="caption" style={{ padding: "8px 0", borderTop: "1px solid var(--hairline)" }}>
              <strong style={{ fontWeight: 600 }}>{guidanceHierarchyLabel(s.sourceType)}</strong>
              {" "}· {s.sourceType} · {s.citation} — {s.title}
              {" "}· {s.contentRights}
              {s.effectiveDate ? ` · effective ${s.effectiveDate}` : ""}
            </li>
          ))}
          {!bundle.sources.length && <li className="caption">Attach firm or authorized sources before concluding.</li>}
        </ul>
        <div className="flex gap-2 flex-wrap">
          <select className="input" style={{ width: "auto", minWidth: 280 }} value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}>
            {bundle.library.map((s) => (
              <option key={s.id} value={s.id}>{s.citation} — {s.title}</option>
            ))}
          </select>
          <button type="button" className="chip" disabled={pending || !sourceId}
            onClick={() => act("attach_source", { sourceId })}>
            Attach source
          </button>
        </div>
      </section>

      <section style={{ marginBottom: 32, paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Analysis</div>
        {!a ? (
          <p className="caption">Run research to draft a source-grounded analysis.</p>
        ) : (
          <div>
            <p className="caption" style={{ marginBottom: 10 }}>
              Version {bundle.analysis!.version} · {a.model} · {a.source}
              {" "}· requires professional review
            </p>
            {a.warnings.length > 0 && (
              <ul className="caption" style={{ marginBottom: 14, color: "var(--accent-deep)" }}>
                {a.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            )}
            <p style={{ fontFamily: "var(--editorial)", fontSize: 17, maxWidth: 720, marginBottom: 16 }}>
              {a.preliminaryConclusion}
            </p>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Relevant facts</div>
            <ul className="caption" style={{ marginBottom: 16 }}>
              {a.relevantFacts.map((f) => <li key={f}>{f}</li>)}
              {!a.relevantFacts.length && <li>None recorded.</li>}
            </ul>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Missing facts</div>
            <ul className="caption" style={{ marginBottom: 16 }}>
              {a.missingFacts.map((f) => <li key={f}>{f}</li>)}
              {!a.missingFacts.length && <li>No missing facts flagged for this category checklist.</li>}
            </ul>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Guidance</div>
            <p className="caption" style={{ marginBottom: 16, maxWidth: 720 }}>{a.guidanceSummary}</p>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Discussion</div>
            <p style={{ fontFamily: "var(--editorial)", fontSize: 16, maxWidth: 720, marginBottom: 16 }}>
              {a.analysis}
            </p>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Proposed accounting treatment</div>
            <p className="caption" style={{ marginBottom: 16, maxWidth: 720 }}>{a.accountingImpact}</p>
            {a.proposedJournalEntry && (
              <div style={{ marginBottom: 16 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Proposed journal entry (draft)</div>
                <p className="caption">{a.proposedJournalEntry.description}</p>
                <ul className="caption tnum">
                  {a.proposedJournalEntry.lines.map((l, i) => (
                    <li key={i}>{l.side} {l.account} {l.amount}</li>
                  ))}
                </ul>
                <p className="caption">
                  Balanced: {a.proposedJournalEntry.balanced ? "yes" : "no"} — never auto-posted.
                </p>
              </div>
            )}
            <div className="eyebrow" style={{ marginBottom: 8 }}>Disclosure considerations</div>
            <ul className="caption" style={{ marginBottom: 16 }}>
              {a.disclosureConsiderations.map((d) => <li key={d}>{d}</li>)}
            </ul>
          </div>
        )}
      </section>

      <section style={{ marginBottom: 32, paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Source evidence</div>
        {!a?.citations.length ? (
          <p className="caption">No citations until research runs against authorized sources.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {a.citations.map((c: AccountingCitation) => (
              <li key={`${c.sourceId}-${c.section || ""}`} className="caption"
                style={{ padding: "10px 0", borderTop: "1px solid var(--hairline)" }}>
                <div>
                  <strong style={{ fontWeight: 600 }}>{c.title}</strong>
                  {" "}· {c.citation} · {c.sourceType} · {c.contentRights}
                  {c.section ? ` · ${c.section}` : ""}
                  {c.effectiveDate ? ` · effective ${c.effectiveDate}` : ""}
                </div>
                {c.excerpt && (
                  <p style={{ fontFamily: "var(--editorial)", marginTop: 6, maxWidth: 720 }}>
                    “{c.excerpt.slice(0, 280)}{c.excerpt.length > 280 ? "…" : ""}”
                  </p>
                )}
                <button type="button" className="chip" style={{ marginTop: 8 }}
                  onClick={() => setShowSourceId(c.sourceId)}>
                  Show source
                </button>
              </li>
            ))}
          </ul>
        )}
        {evidence && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--hairline)" }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Inspected source</div>
            <p className="caption">
              {"title" in evidence ? evidence.title : ""}
              {"citation" in evidence && evidence.citation ? ` · ${evidence.citation}` : ""}
              {"publisher" in evidence && evidence.publisher ? ` · ${evidence.publisher}` : ""}
            </p>
            {"excerpt" in evidence && evidence.excerpt && (
              <p style={{ fontFamily: "var(--editorial)", fontSize: 16, maxWidth: 720, marginTop: 8 }}>
                {evidence.excerpt}
              </p>
            )}
            {"bodyText" in evidence && evidence.bodyText && (
              <pre className="caption" style={{
                whiteSpace: "pre-wrap", maxWidth: 720, marginTop: 8,
                fontFamily: "var(--editorial)", fontSize: 14,
              }}>
                {String(evidence.bodyText).slice(0, 2000)}
              </pre>
            )}
          </div>
        )}
      </section>

      <section style={{ marginBottom: 32, paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Technical memo draft</div>
        {a?.technicalMemo ? (
          <pre style={{
            whiteSpace: "pre-wrap", fontFamily: "var(--editorial)", fontSize: 15,
            maxWidth: 720, lineHeight: 1.55, margin: 0,
          }}>
            {a.technicalMemo}
          </pre>
        ) : (
          <p className="caption">Memo appears after research.</p>
        )}
      </section>

      <section style={{ paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Review history</div>
        <p className="caption">
          Status: {bundle.issue.status.replace(/_/g, " ")}.
          {bundle.issue.reviewedBy
            ? ` Reviewed by ${bundle.issue.reviewedBy.slice(0, 8)}… at ${bundle.issue.reviewedAt}.`
            : " Not yet finalized."}
          {bundle.analysis
            ? ` Analysis v${bundle.analysis.version} by ${bundle.analysis.createdBy.slice(0, 8)}… (${bundle.analysis.createdAt}).`
            : ""}
        </p>
      </section>
    </div>
  );
}
