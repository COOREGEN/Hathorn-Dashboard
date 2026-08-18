"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";

type Client = { id: string; name: string; slug: string };

export default function StaffCurationWorkspace({ clients }: { clients: Client[] }) {
  const [clientId, setClientId] = useState(clients[0]?.id || "");
  const [periods, setPeriods] = useState<{ periodId: string; label: string }[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [insights, setInsights] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [engagement, setEngagement] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [pending, startTransition] = useTransition();

  function load(cid = clientId) {
    startTransition(async () => {
      const [p, i, r, e] = await Promise.all([
        fetch(`/api/client-portal?view=periods&clientId=${cid}`).then((x) => x.json()),
        fetch(`/api/client-portal?view=insights&clientId=${cid}`).then((x) => x.json()),
        fetch(`/api/client-portal?view=reports&clientId=${cid}`).then((x) => x.json()),
        fetch(`/api/client-portal?view=engagement&clientId=${cid}`).then((x) => x.json()),
      ]);
      setPeriods(p.periods || []);
      if (p.periods?.length && !periodId) setPeriodId(p.periods[p.periods.length - 1].periodId);
      setInsights(i.insights || []);
      setQuestions(i.questions || []);
      setReports(r.reports || []);
      setEngagement(e.summary || null);
    });
  }

  useEffect(() => {
    if (clientId) void load(clientId);
    // load closes over latest setters; re-run only when client changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function post(body: Record<string, unknown>) {
    setMsg("");
    const res = await fetch("/api/client-portal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, clientId }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      setMsg(json.error || "Action failed.");
      return null;
    }
    setMsg("Saved.");
    load(clientId);
    return json;
  }

  const client = clients.find((c) => c.id === clientId);

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span className="eyebrow">Client</span>
          <select className="ask-input" value={clientId} onChange={(e) => { setClientId(e.target.value); setPeriodId(""); }}>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span className="eyebrow">Published period</span>
          <select className="ask-input" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
            {periods.map((p) => <option key={p.periodId} value={p.periodId}>{p.label}</option>)}
          </select>
        </label>
        {client && (
          <Link className="chip" href={`/portal?client=${client.slug}&preview=1`} style={{ alignSelf: "end" }}>
            Preview as client
          </Link>
        )}
      </div>

      {msg && <p className="prepared-by">{msg}</p>}
      {engagement && (
        <p className="prepared-by" style={{ marginBottom: 16 }}>
          Engagement: {engagement.reportViews} report views · {engagement.questionsAnswered} answers · {engagement.documentsUploaded} uploads
        </p>
      )}

      <section style={{ marginBottom: 28, borderTop: "1px solid var(--hairline)", paddingTop: 16 }}>
        <h2 className="eyebrow">Portal interactivity (Tier-1)</h2>
        <p className="prepared-by" style={{ marginTop: 8, marginBottom: 10 }}>
          Defaults stay read-only. Turn these on only when the engagement needs client answers, uploads, or Ask.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" className="chip" disabled={pending}
            onClick={() => post({ action: "updateConfig", config: { allowClientAnswers: true } })}>
            Enable answers
          </button>
          <button type="button" className="chip" disabled={pending}
            onClick={() => post({ action: "updateConfig", config: { allowClientAnswers: false } })}>
            Disable answers
          </button>
          <button type="button" className="chip" disabled={pending}
            onClick={() => post({ action: "updateConfig", config: { allowClientUploads: true } })}>
            Enable uploads
          </button>
          <button type="button" className="chip" disabled={pending}
            onClick={() => post({ action: "updateConfig", config: { allowClientUploads: false } })}>
            Disable uploads
          </button>
          <button type="button" className="chip" disabled={pending}
            onClick={() => post({ action: "updateConfig", config: { showCopilot: true } })}>
            Enable Ask
          </button>
          <button type="button" className="chip" disabled={pending}
            onClick={() => post({ action: "updateConfig", config: { showCopilot: false } })}>
            Disable Ask
          </button>
        </div>
      </section>

      <section style={{ marginBottom: 28, borderTop: "1px solid var(--hairline)", paddingTop: 16 }}>
        <h2 className="eyebrow">Monthly Advisory Review</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          <button
            type="button"
            className="btn"
            disabled={pending || !periodId}
            onClick={() => post({ action: "createReport", periodId, publish: false })}
          >
            Create draft report
          </button>
          <button
            type="button"
            className="btn"
            disabled={pending || !periodId}
            onClick={() => post({ action: "createReport", periodId, publish: true })}
          >
            Publish report
          </button>
        </div>
        <ul style={{ listStyle: "none", padding: 0, marginTop: 12 }}>
          {reports.map((r) => (
            <li key={r.id} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", borderBottom: "1px solid var(--hairline)", padding: "8px 0" }}>
              <span style={{ flex: 1, fontFamily: "var(--utility)", fontSize: 13 }}>
                {r.title} · {r.status} · v{r.version}
              </span>
              {r.status === "DRAFT" && (
                <button type="button" className="chip" onClick={() => post({ action: "publishReport", reportId: r.id })}>
                  Publish
                </button>
              )}
              {r.status === "PUBLISHED" && (
                <button type="button" className="chip" onClick={() => post({ action: "retractReport", reportId: r.id })}>
                  Retract
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginBottom: 28, borderTop: "1px solid var(--hairline)", paddingTop: 16 }}>
        <h2 className="eyebrow">Insights & questions</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          <button
            type="button"
            className="chip"
            disabled={!periodId}
            onClick={() => post({ action: "draftInsights", periodId })}
          >
            Draft insight from release
          </button>
          <button
            type="button"
            className="chip"
            disabled={!periodId}
            onClick={() => post({
              action: "createQuestion",
              periodId,
              publish: true,
              question: "What drove the largest cost movement this month?",
            })}
          >
            Publish sample question
          </button>
          <button
            type="button"
            className="chip"
            disabled={!periodId}
            onClick={() => post({
              action: "createDocumentRequest",
              title: "Supporting schedule",
              description: "Please upload the supporting schedule for this period.",
            })}
          >
            Request a document
          </button>
        </div>
        <ul style={{ listStyle: "none", padding: 0, marginTop: 12 }}>
          {insights.map((i) => (
            <li key={i.id} style={{ display: "flex", gap: 8, alignItems: "center", borderBottom: "1px solid var(--hairline)", padding: "8px 0" }}>
              <span style={{ flex: 1, fontFamily: "var(--utility)", fontSize: 13 }}>{i.title} · {i.status}</span>
              {i.status !== "PUBLISHED" && (
                <button type="button" className="chip" onClick={() => post({ action: "setInsightStatus", insightId: i.id, status: "PUBLISHED" })}>
                  Publish to client
                </button>
              )}
              {i.status === "PUBLISHED" && (
                <button type="button" className="chip" onClick={() => post({ action: "setInsightStatus", insightId: i.id, status: "ARCHIVED" })}>
                  Archive
                </button>
              )}
            </li>
          ))}
        </ul>
        <ul style={{ listStyle: "none", padding: 0, marginTop: 8 }}>
          {questions.map((q) => (
            <li key={q.id} className="prepared-by" style={{ marginBottom: 6 }}>
              [{q.status}] {q.question}
              {q.responseBody ? ` — Client: ${q.responseBody}` : ""}
              {q.responseBody && !q.responseReviewedAt ? " (response not an accounting fact until reviewed)" : ""}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
