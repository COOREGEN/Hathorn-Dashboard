"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { TaxAuthority, TaxIssue } from "@/lib/tax/types";

export default function TaxWorkspace({
  clients, initialClientId, issues: initial, authorities, rules, entityTypes, enabled, factGraph,
}: {
  clients: { id: string; name: string }[];
  initialClientId: string;
  issues: TaxIssue[];
  authorities: TaxAuthority[];
  rules: { key: string; label: string; taxYears: readonly number[] }[];
  entityTypes: readonly string[];
  enabled: boolean;
  factGraph: { enabled: boolean; available: boolean; reason: string };
}) {
  const [clientId, setClientId] = useState(initialClientId);
  const [issues, setIssues] = useState(initial);
  const [title, setTitle] = useState("§179 equipment deduction");
  const [taxYear, setTaxYear] = useState(2025);
  const [entityType, setEntityType] = useState("S_CORP");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function createIssue() {
    setError("");
    startTransition(async () => {
      const res = await fetch("/api/tax", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, title, taxYear, entityType, description }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Could not create issue."); return; }
      setIssues((list) => [data.issue, ...list]);
      window.location.href = `/tax/${data.issue.id}`;
    });
  }

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-4"
        style={{ borderBottom: "1px solid var(--hairline)", paddingBottom: 18, marginBottom: 28 }}>
        <div>
          <h1 className="display-l" style={{ margin: 0 }}>Tax Intelligence</h1>
          <p className="section-q" style={{ marginTop: 8, marginBottom: 0 }}>
            Source-backed research and scenario support. Drafts require CPA/EA review — nothing is filed.
          </p>
        </div>
        <div>
          <label className="field-label" htmlFor="tax-client">Client</label>
          <select id="tax-client" className="input" style={{ marginTop: 4, minWidth: 240 }}
            value={clientId}
            onChange={(e) => { window.location.href = `/tax?client=${e.target.value}`; }}>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <p className="caption" style={{ marginBottom: 22, maxWidth: 720 }}>
        {enabled ? "Tax Intelligence is enabled." : "Tax Intelligence is disabled via configuration."}
        {" "}{factGraph.reason}
        {" "}No IRS endorsement is implied.
      </p>

      <section style={{ marginBottom: 36, paddingBottom: 28, borderBottom: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>New tax issue</div>
        <div className="grid sm:grid-cols-2 gap-4" style={{ maxWidth: 720, marginBottom: 14 }}>
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="t-title">Title</label>
            <input id="t-title" className="input" style={{ marginTop: 5 }} value={title}
              onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="t-year">Tax year</label>
            <input id="t-year" className="input tnum" style={{ marginTop: 5 }} type="number"
              value={taxYear} onChange={(e) => setTaxYear(Number(e.target.value))} />
          </div>
          <div>
            <label className="field-label" htmlFor="t-ent">Entity type</label>
            <select id="t-ent" className="input" style={{ marginTop: 5 }} value={entityType}
              onChange={(e) => setEntityType(e.target.value)}>
              {entityTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="t-desc">Description</label>
            <textarea id="t-desc" className="input" style={{ marginTop: 5, minHeight: 72 }}
              value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <button type="button" className="btn" disabled={pending || !enabled} onClick={createIssue}>
          {pending ? "Creating…" : "Create tax issue"}
        </button>
        {error && <p className="caption" role="alert" style={{ color: "var(--accent-deep)", marginTop: 10 }}>{error}</p>}
      </section>

      <section style={{ marginBottom: 36 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Active issues</div>
        {!issues.length ? (
          <p className="caption">No tax issues for this client yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {issues.map((i) => (
              <li key={i.id} style={{
                borderTop: "1px solid var(--hairline)", padding: "14px 0",
                display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
              }}>
                <div>
                  <Link href={`/tax/${i.id}`} style={{ color: "var(--ink)", textDecoration: "none",
                    fontFamily: "var(--editorial)", fontSize: 18 }}>
                    {i.title}
                  </Link>
                  <div className="caption" style={{ marginTop: 4 }}>
                    TY {i.taxYear} · {i.entityType} · {i.status.replace(/_/g, " ")}
                  </div>
                </div>
                <Link href={`/tax/${i.id}`} className="chip">Open</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginBottom: 36, paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Deterministic rules</div>
        <ul className="caption" style={{ margin: 0, paddingLeft: 18 }}>
          {rules.map((r) => (
            <li key={r.key}>{r.label} · years {r.taxYears.join(", ")}</li>
          ))}
        </ul>
      </section>

      <section style={{ paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Authoritative sources (registry)</div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {authorities.map((a) => (
            <li key={a.id} className="caption" style={{ padding: "8px 0", borderTop: "1px solid var(--hairline)" }}>
              <strong style={{ fontWeight: 600 }}>{a.sourceType}</strong> · {a.citation} — {a.title}
              {a.taxYear ? ` · TY ${a.taxYear}` : ""}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
