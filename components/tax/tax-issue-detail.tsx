"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { TaxAnalysis, TaxAuthority, TaxIssue, TaxIssueFact, TaxRuleResult, TaxScenario } from "@/lib/tax/types";

type Bundle = {
  issue: TaxIssue;
  facts: TaxIssueFact[];
  authorities: { authorityId: string; citation: string; title: string; sourceType: string; url: string | null }[];
  ruleRuns: { id: string; ruleKey: string; ruleVersion: string; taxYear: number; result: TaxRuleResult; createdAt: string }[];
  scenarios: TaxScenario[];
  missingFacts: string[];
  rules: readonly { key: string; label: string }[];
  documents: { id: string; document_type: string; original_filename: string; status: string }[];
};

const money = (n: unknown) =>
  typeof n === "number" ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—";

export default function TaxIssueDetail({
  initial, registry,
}: { initial: Bundle; registry: TaxAuthority[] }) {
  const [bundle, setBundle] = useState(initial);
  const [factKey, setFactKey] = useState("equipment_cost");
  const [factValue, setFactValue] = useState("150000");
  const [factType, setFactType] = useState("currency");
  const [scenarioName, setScenarioName] = useState("STRATEGY A");
  const [scenarioOverlay, setScenarioOverlay] = useState('{"placed_in_service":"true","business_use_pct":"100"}');
  const [authId, setAuthId] = useState(registry[0]?.id || "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setError("");
    startTransition(async () => {
      const res = await fetch(`/api/tax/${bundle.issue.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Action failed."); return; }
      if (data.bundle) setBundle(data.bundle);
      else {
        const g = await fetch(`/api/tax/${bundle.issue.id}`);
        const full = await g.json().catch(() => ({}));
        if (full.ok) setBundle(full);
      }
    });
  }

  const analysis: TaxAnalysis | null = bundle.issue.analysisJson;
  const latest = bundle.ruleRuns[0]?.result;

  return (
    <div>
      <p className="caption" style={{ marginBottom: 12 }}>
        <Link href={`/tax?client=${bundle.issue.clientId}`} style={{ color: "var(--ink-soft)" }}>
          ← Tax Intelligence
        </Link>
      </p>
      <h1 className="display-l" style={{ margin: 0 }}>{bundle.issue.title}</h1>
      <p className="section-q" style={{ marginTop: 8 }}>
        Tax year {bundle.issue.taxYear} · {bundle.issue.entityType} · {bundle.issue.status.replace(/_/g, " ")}
      </p>
      <p className="caption" style={{ marginTop: 8, maxWidth: 640 }}>{bundle.issue.description}</p>

      <div className="flex gap-2 flex-wrap" style={{ margin: "20px 0 28px" }}>
        <button type="button" className="btn" disabled={pending}
          onClick={() => act("run_rule", { ruleKey: "sec179_expense_limit" })}>
          Run §179 rule
        </button>
        <button type="button" className="chip" disabled={pending} onClick={() => act("analyze")}>
          Generate analysis
        </button>
        <button type="button" className="chip" disabled={pending} onClick={() => act("review")}>
          Mark reviewed
        </button>
        <button type="button" className="chip" disabled={pending} onClick={() => act("close")}>
          Close
        </button>
      </div>
      {error && <p className="caption" role="alert" style={{ color: "var(--accent-deep)" }}>{error}</p>}

      {/* Facts */}
      <section style={{ marginBottom: 32 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Facts</div>
        <ul className="caption" style={{ marginBottom: 14 }}>
          {bundle.facts.map((f) => (
            <li key={f.id}>
              <span className="tnum">{f.factKey}</span> = {f.factValue}
              {" "}· {f.provenance}{f.verified ? " · verified" : " · unverified"}
              {f.sourceDocumentId ? ` · doc ${f.sourceDocumentId.slice(0, 8)}…` : ""}
            </li>
          ))}
          {!bundle.facts.length && <li>No structured facts yet.</li>}
        </ul>
        <div className="grid sm:grid-cols-4 gap-3" style={{ maxWidth: 800 }}>
          <input className="input" value={factKey} onChange={(e) => setFactKey(e.target.value)} placeholder="fact_key" />
          <input className="input tnum" value={factValue} onChange={(e) => setFactValue(e.target.value)} placeholder="value" />
          <select className="input" value={factType} onChange={(e) => setFactType(e.target.value)}>
            <option value="currency">currency</option>
            <option value="percent">percent</option>
            <option value="boolean">boolean</option>
            <option value="date">date</option>
            <option value="string">string</option>
          </select>
          <button type="button" className="chip" disabled={pending}
            onClick={() => act("add_fact", { factKey, factValue, factType, provenance: "USER_ENTERED" })}>
            Add fact
          </button>
        </div>
      </section>

      {/* Missing */}
      <section style={{ marginBottom: 32, paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Missing information</div>
        {bundle.missingFacts.length ? (
          <ul className="caption">{bundle.missingFacts.map((m) => <li key={m}>{m}</li>)}</ul>
        ) : (
          <p className="caption">No missing facts flagged for the latest rule context.</p>
        )}
      </section>

      {/* Authorities */}
      <section style={{ marginBottom: 32, paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Authorities</div>
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 14px" }}>
          {bundle.authorities.map((a) => (
            <li key={a.authorityId} className="caption" style={{ padding: "8px 0", borderTop: "1px solid var(--hairline)" }}>
              <strong style={{ fontWeight: 600 }}>{a.sourceType}</strong> · {a.citation} — {a.title}
              {a.url && (
                <> · <a href={a.url} target="_blank" rel="noreferrer" style={{ color: "var(--ink)" }}>source</a></>
              )}
            </li>
          ))}
          {!bundle.authorities.length && <li className="caption">Attach an authority before relying on conclusions.</li>}
        </ul>
        <div className="flex gap-2 flex-wrap">
          <select className="input" style={{ width: "auto", minWidth: 280 }} value={authId}
            onChange={(e) => setAuthId(e.target.value)}>
            {registry.map((a) => (
              <option key={a.id} value={a.id}>{a.citation} — {a.title}</option>
            ))}
          </select>
          <button type="button" className="chip" disabled={pending || !authId}
            onClick={() => act("attach_authority", { authorityId: authId })}>
            Attach
          </button>
        </div>
      </section>

      {/* Rule results */}
      <section style={{ marginBottom: 32, paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Deterministic rule result</div>
        {!latest ? (
          <p className="caption">No rule runs yet. Add facts, then run §179.</p>
        ) : (
          <div>
            <p className="caption" style={{ marginBottom: 10 }}>
              {latest.ruleKey}@{latest.ruleVersion} · {latest.status} · TY {latest.taxYear}
            </p>
            <p style={{ fontFamily: "var(--editorial)", fontSize: 16, maxWidth: 720 }}>{latest.detail}</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" style={{ marginTop: 16 }}>
              {Object.entries(latest.outputs).filter(([k]) => k !== "estimate_only").map(([k, v]) => (
                <div key={k}>
                  <div className="eyebrow">{k.replace(/_/g, " ")}</div>
                  <div className="tnum" style={{ fontFamily: "var(--display)", fontSize: 20, marginTop: 4 }}>
                    {typeof v === "number" && /cost|limit|allowable|reduction|threshold/i.test(k) ? money(v) : String(v)}
                  </div>
                </div>
              ))}
            </div>
            <p className="caption" style={{ marginTop: 12 }}>
              Estimates only. Taxable income limitation and election mechanics are not fully modeled.
            </p>
          </div>
        )}
      </section>

      {/* Scenarios */}
      <section style={{ marginBottom: 32, paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Scenarios</div>
        <div className="grid sm:grid-cols-2 gap-3" style={{ maxWidth: 720, marginBottom: 12 }}>
          <input className="input" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} />
          <input className="input" value={scenarioOverlay} onChange={(e) => setScenarioOverlay(e.target.value)}
            placeholder='{"business_use_pct":"40"}' />
        </div>
        <button type="button" className="chip" disabled={pending} onClick={() => {
          try {
            const facts = JSON.parse(scenarioOverlay);
            act("create_scenario", { name: scenarioName, facts });
          } catch {
            setError("Scenario facts must be valid JSON.");
          }
        }}>
          Create scenario
        </button>
        <ul style={{ listStyle: "none", padding: 0, marginTop: 16 }}>
          {bundle.scenarios.map((sc) => (
            <li key={sc.id} style={{
              borderTop: "1px solid var(--hairline)", padding: "10px 0",
              display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
            }}>
              <div className="caption">
                <strong style={{ fontWeight: 600 }}>{sc.name}</strong> · {JSON.stringify(sc.factsJson)}
              </div>
              <button type="button" className="chip" disabled={pending}
                onClick={() => act("run_scenario", { scenarioId: sc.id, ruleKey: "sec179_expense_limit" })}>
                Run rule
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Documents */}
      {!!bundle.documents?.length && (
        <section style={{ marginBottom: 32, paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Client documents (reference)</div>
          <ul className="caption">
            {bundle.documents.map((d) => (
              <li key={d.id}>
                <Link href={`/documents/${d.id}`} style={{ color: "var(--ink)" }}>
                  {d.document_type} — {d.original_filename}
                </Link>
                {" "}· {d.status}
              </li>
            ))}
          </ul>
          <p className="caption" style={{ marginTop: 8 }}>
            Link a document id on a fact via sourceDocumentId after review — facts are not auto-imported.
          </p>
        </section>
      )}

      {/* Analysis */}
      <section style={{ paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Analysis (draft)</div>
        {!analysis ? (
          <p className="caption">Generate analysis after facts and authorities are in place.</p>
        ) : (
          <div style={{ maxWidth: 720 }}>
            <p className="caption">TY {analysis.taxYear} · researched {analysis.researchDate} · {analysis.source}</p>
            <pre style={{
              whiteSpace: "pre-wrap", fontFamily: "var(--editorial)", fontSize: 15, lineHeight: 1.55,
            }}>{[
              "ISSUE", analysis.issue, "",
              "FACTS", ...analysis.knownFacts.map((x) => `• ${x}`), "",
              "MISSING", ...(analysis.missingFacts.length ? analysis.missingFacts.map((x) => `• ${x}`) : ["• none flagged"]), "",
              "AUTHORITIES", ...analysis.authorities.map((a) => `• ${a.citation} — ${a.title}`), "",
              "ANALYSIS", analysis.analysis, "",
              "SCENARIO OBSERVATIONS", ...(analysis.scenarioObservations.length ? analysis.scenarioObservations.map((x) => `• ${x}`) : ["• none"]), "",
              "RISKS", ...analysis.risks.map((x) => `• ${x}`), "",
              "PRELIMINARY CONCLUSION", analysis.preliminaryConclusion, "",
              "Professional review required: yes",
              "Tax law may change. Verify current authority before relying on this analysis.",
            ].join("\n")}</pre>
          </div>
        )}
      </section>
    </div>
  );
}
