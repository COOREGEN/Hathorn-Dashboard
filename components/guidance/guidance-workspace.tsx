"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { AccountingResearchIssue, AccountingSource, ResearchCategory } from "@/lib/research/types";

export default function GuidanceWorkspace({
  clients, initialClientId, issues: initial, sources, categories, enabled, ragflow,
}: {
  clients: { id: string; name: string }[];
  initialClientId: string;
  issues: AccountingResearchIssue[];
  sources: AccountingSource[];
  categories: { value: ResearchCategory; label: string }[];
  enabled: boolean;
  ragflow: { enabled: boolean; available: boolean; reason: string };
}) {
  const [clientId, setClientId] = useState(initialClientId);
  const [issues, setIssues] = useState(initial);
  const [title, setTitle] = useState("Equipment lease classification");
  const [category, setCategory] = useState<ResearchCategory>("LEASES");
  const [entityContext, setEntityContext] = useState("PRIVATE_COMPANY");
  const [reportingPeriod, setReportingPeriod] = useState("2026-06");
  const [description, setDescription] = useState(
    "Client signed a 36-month equipment lease. Evaluate classification and missing facts.",
  );
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function createIssue() {
    setError("");
    startTransition(async () => {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId, title, description, category, entityContext, reportingPeriod,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Could not create issue."); return; }
      setIssues((list) => [data.issue, ...list]);
      window.location.href = `/guidance/${data.issue.id}`;
    });
  }

  const open = issues.filter((i) => !["FINAL", "CLOSED"].includes(i.status));
  const recent = issues.slice(0, 12);
  const firmGuidance = sources.filter((s) => s.scope === "FIRM");

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-4"
        style={{ borderBottom: "1px solid var(--hairline)", paddingBottom: 18, marginBottom: 28 }}>
        <div>
          <h1 className="display-l" style={{ margin: 0 }}>Accounting Guidance</h1>
          <p className="section-q" style={{ marginTop: 8, marginBottom: 0 }}>
            Technical research grounded in authorized sources. Drafts require CPA review — nothing posts to the books.
          </p>
        </div>
        <div>
          <label className="field-label" htmlFor="g-client">Client</label>
          <select id="g-client" className="input" style={{ marginTop: 4, minWidth: 240 }}
            value={clientId}
            onChange={(e) => { window.location.href = `/guidance?client=${e.target.value}`; }}>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <p className="caption" style={{ marginBottom: 22, maxWidth: 720 }}>
        {enabled ? "Accounting Guidance is enabled." : "Accounting Guidance is disabled via configuration."}
        {" "}{ragflow.reason}
        {" "}No unauthorized ASC Codification corpus is stored.
      </p>

      <section style={{ marginBottom: 36, paddingBottom: 28, borderBottom: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>New research issue</div>
        <div className="grid sm:grid-cols-2 gap-4" style={{ maxWidth: 720, marginBottom: 14 }}>
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="g-title">Title</label>
            <input id="g-title" className="input" style={{ marginTop: 5 }} value={title}
              onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="g-cat">Category</label>
            <select id="g-cat" className="input" style={{ marginTop: 5 }} value={category}
              onChange={(e) => setCategory(e.target.value as ResearchCategory)}>
              {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="g-ent">Entity context</label>
            <select id="g-ent" className="input" style={{ marginTop: 5 }} value={entityContext}
              onChange={(e) => setEntityContext(e.target.value)}>
              <option value="PRIVATE_COMPANY">Private company</option>
              <option value="PUBLIC_BUSINESS_ENTITY">Public business entity</option>
              <option value="NONPROFIT">Nonprofit</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="g-period">Reporting period</label>
            <input id="g-period" className="input tnum" style={{ marginTop: 5 }}
              value={reportingPeriod} onChange={(e) => setReportingPeriod(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="g-desc">Description</label>
            <textarea id="g-desc" className="input" rows={3} style={{ marginTop: 5 }}
              value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <button type="button" className="btn" disabled={pending || !enabled} onClick={createIssue}>
          {pending ? "Creating…" : "Create research issue"}
        </button>
        {error && <p className="caption" role="alert" style={{ color: "var(--accent-deep)", marginTop: 10 }}>{error}</p>}
      </section>

      <section style={{ marginBottom: 36 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Open issues</div>
        {!open.length ? (
          <p className="caption">No open research issues for this client.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {open.map((i) => (
              <li key={i.id} style={{ padding: "12px 0", borderTop: "1px solid var(--hairline)",
                display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <div>
                  <Link href={`/guidance/${i.id}`} style={{ color: "var(--ink)", textDecoration: "none",
                    fontFamily: "var(--editorial)", fontSize: 17 }}>
                    {i.title}
                  </Link>
                  <div className="caption" style={{ marginTop: 4 }}>
                    {i.category.replace(/_/g, " ")} · {i.status.replace(/_/g, " ")}
                    {i.reportingPeriod ? ` · ${i.reportingPeriod}` : ""}
                  </div>
                </div>
                <Link href={`/guidance/${i.id}`} className="chip">Open</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginBottom: 36, paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Recent research</div>
        <ul className="caption" style={{ margin: 0, paddingLeft: 18 }}>
          {recent.map((i) => (
            <li key={i.id} style={{ marginBottom: 6 }}>
              <Link href={`/guidance/${i.id}`} style={{ color: "var(--ink)" }}>{i.title}</Link>
              {" "}· {i.status.replace(/_/g, " ")}
            </li>
          ))}
          {!recent.length && <li>None yet.</li>}
        </ul>
      </section>

      <section style={{ marginBottom: 36, paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Firm guidance / saved sources</div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {firmGuidance.map((s) => (
            <li key={s.id} className="caption" style={{ padding: "10px 0", borderTop: "1px solid var(--hairline)" }}>
              <strong style={{ fontWeight: 600 }}>{s.sourceType}</strong>
              {" "}· {s.citation} — {s.title}
              {" "}· rights {s.contentRights}
              {s.sourceType === "FIRM_POLICY" ? " · INTERNAL FIRM GUIDANCE" : ""}
            </li>
          ))}
          {!firmGuidance.length && <li className="caption">Pilot corpus loads on first visit.</li>}
        </ul>
      </section>
    </div>
  );
}
