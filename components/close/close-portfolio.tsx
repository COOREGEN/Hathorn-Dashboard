"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

type Row = {
  clientId: string; clientName: string; periodId: string;
  closeStatus: string; progressPct: number; overdue: boolean;
  whyNotClosed: string[]; blockers: { title: string; detail: string }[];
  blockingExceptions: number; closeRunId: string | null;
};

export default function ClosePortfolio({
  year: initialYear, month: initialMonth, counts, clients,
}: {
  year: number; month: number;
  counts: Record<string, number>;
  clients: Row[];
}) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [rows, setRows] = useState(clients);
  const [stats, setStats] = useState(counts);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function reload(y: number, m: number) {
    window.location.href = `/close?year=${y}&month=${m}`;
  }

  function startClose(clientId: string, periodId: string) {
    setError("");
    startTransition(async () => {
      const res = await fetch("/api/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, periodId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || "Could not start close.");
        return;
      }
      window.location.href = `/close/${data.run.id}`;
    });
  }

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-4"
        style={{ borderBottom: "1px solid var(--hairline)", paddingBottom: 18, marginBottom: 28 }}>
        <div>
          <h1 className="display-l" style={{ margin: 0 }}>Month-End Close</h1>
          <p className="section-q" style={{ marginTop: 8, marginBottom: 0 }}>
            Automate the checklist. Preserve professional judgment. Feed the release engine.
          </p>
        </div>
        <div className="flex gap-3">
          <div>
            <label className="field-label">Year</label>
            <input type="number" className="input tnum" style={{ marginTop: 4, width: 100 }}
              value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </div>
          <div>
            <label className="field-label">Month</label>
            <select className="input" style={{ marginTop: 4 }} value={month}
              onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}</option>
              ))}
            </select>
          </div>
          <button type="button" className="btn" style={{ alignSelf: "flex-end" }}
            onClick={() => reload(year, month)}>Go</button>
        </div>
      </div>

      <section style={{ marginBottom: 28 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          {month}/{year} · {stats.total} clients
        </div>
        <p className="caption">
          {stats.closed} closed · {stats.readyToPublish} ready to publish ·{" "}
          {stats.readyForReview} ready for review · {stats.inProgress} in progress ·{" "}
          {stats.blocked} blocked · {stats.notStarted} not started
          {stats.overdue ? ` · ${stats.overdue} overdue` : ""}
        </p>
        <p className="caption" style={{ marginTop: 8 }}>
          <Link href="/exceptions" style={{ color: "var(--ink)" }}>Exceptions queue →</Link>
        </p>
      </section>

      {error && <p className="caption" role="alert" style={{ color: "var(--accent-deep)" }}>{error}</p>}

      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {rows.map((r) => (
          <li key={r.periodId} style={{
            padding: "18px 0", borderTop: "1px solid var(--hairline)",
            display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
          }}>
            <div style={{ maxWidth: 640 }}>
              <div style={{ fontFamily: "var(--editorial)", fontSize: 20 }}>{r.clientName}</div>
              <div className="caption" style={{ marginTop: 4 }}>
                {r.closeStatus.replace(/_/g, " ")}
                {r.closeStatus !== "NOT_STARTED" ? ` · ${r.progressPct}%` : ""}
                {r.overdue ? " · OVERDUE" : ""}
                {r.blockingExceptions ? ` · ${r.blockingExceptions} blocking` : ""}
              </div>
              {!!r.whyNotClosed.length && (
                <ul className="caption" style={{ marginTop: 8 }}>
                  {r.whyNotClosed.slice(0, 3).map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
            </div>
            <div className="flex gap-2" style={{ alignItems: "flex-start" }}>
              {r.closeRunId ? (
                <Link href={`/close/${r.closeRunId}`} className="btn">Open close</Link>
              ) : (
                <button type="button" className="btn" disabled={pending}
                  onClick={() => startClose(r.clientId, r.periodId)}>
                  {pending ? "Starting…" : "Start close"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
