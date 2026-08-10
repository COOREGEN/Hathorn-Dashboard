"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

type Item = {
  id: string; checkKey: string; category: string; title: string; kind: string;
  status: string; blocking: boolean; required: boolean; evidence: any;
  waiveReason: string | null; note: string | null;
};

export default function CloseDetail({
  initial,
}: {
  initial: {
    run: any; client: { id: string; name: string }; period: any;
    items: Item[]; exceptions: any[]; whyNotClosed: string[]; events: any[];
  };
}) {
  const [bundle, setBundle] = useState(initial);
  const [error, setError] = useState("");
  const [ai, setAi] = useState<any>(null);
  const [pending, startTransition] = useTransition();
  const run = bundle.run;

  function act(action: string, extra: Record<string, unknown> = {}) {
    setError("");
    startTransition(async () => {
      const res = await fetch(`/api/close/${run.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        setError(data.error || "Action failed.");
        return;
      }
      if (data.summary) setAi(data.summary);
      if (data.bundle) setBundle(data.bundle);
      else if (data.run) {
        const g = await fetch(`/api/close/${run.id}`);
        const full = await g.json();
        if (full.ok) setBundle(full);
      }
    });
  }

  const byCat: Record<string, Item[]> = {};
  for (const i of bundle.items) {
    (byCat[i.category] ||= []).push(i);
  }

  const mark = (status: string) => {
    if (status === "PASS") return "✓";
    if (status === "WAIVED") return "∼";
    if (status === "NOT_APPLICABLE") return "–";
    if (status === "FAIL" || status === "STALE") return "!";
    if (status === "NEEDS_REVIEW") return "?";
    return "·";
  };

  return (
    <div>
      <p className="caption" style={{ marginBottom: 12 }}>
        <Link href={`/close?year=${bundle.period?.year}&month=${bundle.period?.month}`}
          style={{ color: "var(--ink-soft)" }}>← Month-End Close</Link>
      </p>
      <h1 className="display-l" style={{ margin: 0 }}>{bundle.client?.name}</h1>
      <p className="section-q" style={{ marginTop: 8 }}>
        {bundle.period?.month}/{bundle.period?.year} · {run.status.replace(/_/g, " ")} · {run.summary?.progressPct ?? 0}%
        {run.overdue ? " · OVERDUE" : ""}
      </p>

      <section style={{ margin: "24px 0", padding: "16px 0", borderTop: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Why isn&apos;t this closed?</div>
        {!bundle.whyNotClosed?.length ? (
          <p className="caption">No blockers recorded — ready for existing review/release when evaluate is clear.</p>
        ) : (
          <ol className="caption">
            {bundle.whyNotClosed.map((w: string, i: number) => <li key={i}>{w}</li>)}
          </ol>
        )}
      </section>

      <div className="flex gap-2 flex-wrap" style={{ marginBottom: 24 }}>
        <button type="button" className="btn" disabled={pending} onClick={() => act("refresh")}>
          {pending ? "Working…" : "Refresh checks"}
        </button>
        <button type="button" className="chip" disabled={pending} onClick={() => act("ai_summary")}>
          AI close summary
        </button>
        <Link href={`/review/${bundle.period?.id}`} className="chip">Review / release →</Link>
        <Link href={`/exceptions?clientId=${bundle.client?.id}&periodId=${bundle.period?.id}`} className="chip">
          Exceptions
        </Link>
      </div>
      {error && <p className="caption" role="alert" style={{ color: "var(--accent-deep)" }}>{error}</p>}
      {ai && (
        <section style={{ marginBottom: 28, paddingBottom: 20, borderBottom: "1px solid var(--hairline)" }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>AI summary · requires professional review</div>
          <p className="caption">{ai.overallStatus}</p>
          <ul className="caption">
            {(ai.reviewerAttention || []).map((x: string, i: number) => <li key={i}>{x}</li>)}
          </ul>
        </section>
      )}

      {Object.entries(byCat).map(([cat, items]) => (
        <section key={cat} style={{ marginBottom: 28 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>{cat.replace(/_/g, " ")}</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {items.map((i) => (
              <li key={i.id} style={{
                padding: "10px 0", borderTop: "1px solid var(--hairline)",
                display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
              }}>
                <div style={{ maxWidth: 560 }}>
                  <div>
                    <span className="tnum" style={{ marginRight: 8 }}>{mark(i.status)}</span>
                    {i.title}
                    <span className="caption"> · {i.kind === "MANUAL" ? "manual" : "automated"} · {i.status.replace(/_/g, " ")}
                      {i.blocking ? " · blocking" : ""}</span>
                  </div>
                  {i.evidence?.detail && <div className="caption" style={{ marginTop: 4 }}>{i.evidence.detail}</div>}
                  {i.waiveReason && <div className="caption" style={{ marginTop: 4 }}>Waived: {i.waiveReason}</div>}
                </div>
                <div className="flex gap-2">
                  {i.kind === "MANUAL" && i.status !== "PASS" && i.status !== "WAIVED" && (
                    <button type="button" className="chip" disabled={pending}
                      onClick={() => act("complete_manual", { itemId: i.id })}>Complete</button>
                  )}
                  {(i.status === "NEEDS_REVIEW" || i.status === "STALE") && (
                    <button type="button" className="chip" disabled={pending}
                      onClick={() => act("review_check", { itemId: i.id })}>Mark reviewed</button>
                  )}
                  {i.status !== "WAIVED" && i.status !== "PASS" && i.status !== "NOT_APPLICABLE" && (
                    <button type="button" className="chip" disabled={pending}
                      onClick={() => {
                        const reason = window.prompt("Waiver reason (required):");
                        if (reason) act("waive", { itemId: i.id, reason });
                      }}>Waive</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section style={{ paddingTop: 16, borderTop: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Recent close events</div>
        <ul className="caption">
          {bundle.events.slice(0, 12).map((e: any) => (
            <li key={e.id}>{e.createdAt} · {e.eventType} · {e.detail}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
