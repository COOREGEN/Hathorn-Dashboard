"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatCents } from "@/lib/reconciliation/money";

type Period = { id: string; year: number; month: number; status: string };
type Pack = {
  counts: {
    matched: number; withinTolerance: number; exceptions: number;
    needsData: number; underReview: number; resolved: number;
  };
  openExceptionCount: number;
  readiness: { allRequiredComplete: boolean; criticalExceptions: boolean };
  rows: {
    id: string; type: string; status: string; readiness: string;
    controlAmountCents: number | null; supportingAmountCents: number | null;
    differenceCents: number | null; absoluteDifferenceCents: number | null;
    toleranceCents: number;
  }[];
  config: { type: string; requirement: string; label: string }[];
  definitions: { key: string; label: string }[];
};

const labelFor = (type: string) =>
  ({ PAYROLL: "Payroll", ACCOUNTS_RECEIVABLE: "Accounts receivable", DEBT: "Debt" } as any)[type] || type;

export default function ReconWorkspace({
  clients, initialClientId, periods, initialPeriodId, initialPack, enabled,
}: {
  clients: { id: string; name: string }[];
  initialClientId: string;
  periods: Period[];
  initialPeriodId: string;
  initialPack: Pack | null;
  enabled: boolean;
}) {
  const [clientId, setClientId] = useState(initialClientId);
  const [periodId, setPeriodId] = useState(initialPeriodId);
  const [pack, setPack] = useState(initialPack);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function reload(nextClient: string, nextPeriod: string) {
    window.location.href = `/reconciliations?client=${nextClient}&period=${nextPeriod}`;
  }

  function runPack() {
    setError("");
    startTransition(async () => {
      const res = await fetch("/api/reconciliations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, periodId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Run failed."); return; }
      setPack(data.pack);
    });
  }

  const period = periods.find((p) => p.id === periodId);
  const periodLabel = period
    ? `${period.year}-${String(period.month).padStart(2, "0")}`
    : "—";

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-4"
        style={{ borderBottom: "1px solid var(--hairline)", paddingBottom: 18, marginBottom: 28 }}>
        <div>
          <h1 className="display-l" style={{ margin: 0 }}>Reconciliations</h1>
          <p className="section-q" style={{ marginTop: 8, marginBottom: 0 }}>
            Deterministic tie-outs of control balances to supporting schedules. Analysis only — nothing posts to the books.
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <div>
            <label className="field-label" htmlFor="r-client">Client</label>
            <select id="r-client" className="input" style={{ marginTop: 4, minWidth: 220 }}
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                reload(e.target.value, periodId);
              }}>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="r-period">Period</label>
            <select id="r-period" className="input" style={{ marginTop: 4, minWidth: 160 }}
              value={periodId}
              onChange={(e) => {
                setPeriodId(e.target.value);
                reload(clientId, e.target.value);
              }}>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.year}-{String(p.month).padStart(2, "0")} · {p.status}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <p className="caption" style={{ marginBottom: 22, maxWidth: 720 }}>
        {enabled ? "Reconciliation intelligence is enabled." : "Disabled via configuration."}
        {" "}Operational tolerance is not financial-statement materiality.
        {" "}Publish gate is unchanged — this is a readiness signal only.
      </p>

      {pack && (
        <section style={{ marginBottom: 28 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            {periodLabel} reconciliation status
          </div>
          <p className="caption" style={{ marginBottom: 8 }}>
            {pack.counts.matched} Matched · {pack.counts.withinTolerance} Within tolerance ·{" "}
            {pack.counts.exceptions} Exceptions · {pack.counts.needsData} Missing ·{" "}
            {pack.openExceptionCount} open exception(s)
          </p>
          <p className="caption">
            Required complete: {pack.readiness.allRequiredComplete ? "YES" : "NO"}
            {" · "}Critical exceptions: {pack.readiness.criticalExceptions ? "YES" : "NO"}
          </p>
        </section>
      )}

      <div className="flex gap-2 flex-wrap" style={{ marginBottom: 28 }}>
        <button type="button" className="btn" disabled={pending || !enabled || !periodId} onClick={runPack}>
          {pending ? "Running…" : "Run reconciliation pack"}
        </button>
      </div>
      {error && <p className="caption" role="alert" style={{ color: "var(--accent-deep)" }}>{error}</p>}

      <section style={{ marginBottom: 36 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Required reconciliations</div>
        {!pack?.rows.length ? (
          <p className="caption">No runs yet for this period. Run the pack to compare control vs supporting balances.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {pack.rows.map((r) => (
              <li key={r.id} style={{
                padding: "14px 0", borderTop: "1px solid var(--hairline)",
                display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
              }}>
                <div>
                  <Link href={`/reconciliations/${r.id}`}
                    style={{ color: "var(--ink)", textDecoration: "none", fontFamily: "var(--editorial)", fontSize: 17 }}>
                    {labelFor(r.type)}
                  </Link>
                  <div className="caption" style={{ marginTop: 4 }}>
                    {r.status.replace(/_/g, " ")}
                    {r.absoluteDifferenceCents != null
                      ? ` · difference ${formatCents(r.absoluteDifferenceCents)}`
                      : ""}
                    {` · tolerance ${formatCents(r.toleranceCents)}`}
                  </div>
                </div>
                <Link href={`/reconciliations/${r.id}`} className="chip">Open</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pack?.config && (
        <section style={{ paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Client configuration</div>
          <ul className="caption">
            {pack.config.map((c) => (
              <li key={c.type}>{c.label || labelFor(c.type)} — {c.requirement.replace(/_/g, " ")}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
