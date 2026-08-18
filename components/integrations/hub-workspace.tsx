"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

type Conn = {
  id: string; provider: string; status: string; health: string;
  externalAccountId: string | null; externalAccountName: string | null;
  lastSuccessfulSyncAt: string | null; lastAttemptedSyncAt: string | null;
  lastErrorMessage: string | null; capabilities: string[];
};

type Run = {
  id: string; provider: string; status: string; startedAt: string;
  recordsReceived: number; recordsCreated: number; recordsSkipped: number;
  errorMessage: string | null;
};

export default function IntegrationsHub({
  clients, initialClientId, initial,
}: {
  clients: { id: string; name: string }[];
  initialClientId: string;
  initial: {
    counts: { connected: number; healthy: number; needsReconnect: number; failedSyncs: number; stale: number };
    readiness: Record<string, string>;
    providers: { key: string; name: string; description: string; configured: boolean }[];
    connections: Conn[];
    recentRuns: Run[];
  };
}) {
  const [clientId, setClientId] = useState(initialClientId);
  const [data, setData] = useState(initial);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1 || 12);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function reload(next: string) {
    window.location.href = `/integrations?client=${next}`;
  }

  async function refresh() {
    const res = await fetch(`/api/integrations?clientId=${clientId}`);
    const json = await res.json();
    if (json.ok) setData(json);
  }

  function sync(connectionId: string, extra: Record<string, unknown> = {}) {
    setError("");
    startTransition(async () => {
      const res = await fetch(`/api/integrations/${connectionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync", year, month, ...extra }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        setError(json.error || json.outcome?.run?.errorMessage || "Sync failed.");
      }
      await refresh();
    });
  }

  function label(provider: string) {
    return ({ quickbooks: "QuickBooks Online", file: "CSV / Excel", mock: "Mock Provider" } as any)[provider] || provider;
  }

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-4"
        style={{ borderBottom: "1px solid var(--hairline)", paddingBottom: 18, marginBottom: 28 }}>
        <div>
          <h1 className="display-l" style={{ margin: 0 }}>Integrations</h1>
          <p className="section-q" style={{ marginTop: 8, marginBottom: 0 }}>
            Connect once. Normalize once. Use everywhere. Credentials never leave the server.
          </p>
        </div>
        <div>
          <label className="field-label" htmlFor="i-client">Client</label>
          <select id="i-client" className="input" style={{ marginTop: 4, minWidth: 240 }}
            value={clientId} onChange={(e) => { setClientId(e.target.value); reload(e.target.value); }}>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <section style={{ marginBottom: 28 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Hub status</div>
        <p className="caption">
          {data.counts.connected} connected · {data.counts.healthy} healthy ·{" "}
          {data.counts.needsReconnect} need reconnect · {data.counts.stale} stale ·{" "}
          {data.counts.failedSyncs} failed sync(s) in recent history
        </p>
        <p className="caption" style={{ marginTop: 8 }}>
          Readiness — P&L: {data.readiness.PROFIT_AND_LOSS || "—"} · AR: {data.readiness.ACCOUNTS_RECEIVABLE || "—"} ·{" "}
          Payroll: {data.readiness.PAYROLL || "—"} · File: {data.readiness.FILE_IMPORT || "—"}
        </p>
      </section>

      <div className="flex gap-3 flex-wrap" style={{ marginBottom: 24 }}>
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
      </div>
      {error && <p className="caption" role="alert" style={{ color: "var(--accent-deep)", marginBottom: 16 }}>{error}</p>}

      <section style={{ marginBottom: 36 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Providers</div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {data.connections.map((c) => (
            <li key={c.id} style={{
              padding: "16px 0", borderTop: "1px solid var(--hairline)",
              display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
            }}>
              <div style={{ maxWidth: 520 }}>
                <div style={{ fontFamily: "var(--editorial)", fontSize: 18 }}>{label(c.provider)}</div>
                <div className="caption" style={{ marginTop: 4 }}>
                  {c.status.replace(/_/g, " ")} · health {c.health.replace(/_/g, " ")}
                  {c.externalAccountName ? ` · ${c.externalAccountName}` : ""}
                </div>
                <div className="caption" style={{ marginTop: 4 }}>
                  Last success: {c.lastSuccessfulSyncAt || "—"}
                  {c.lastErrorMessage ? ` · ${c.lastErrorMessage}` : ""}
                </div>
                <div className="caption" style={{ marginTop: 4 }}>
                  Capabilities: {c.capabilities.join(", ")}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap" style={{ alignItems: "flex-start" }}>
                {c.provider === "quickbooks" && c.status === "DISCONNECTED" && (
                  <a className="btn" href={`/api/qbo/connect?clientId=${clientId}`}>Connect</a>
                )}
                {c.provider !== "quickbooks" || c.status !== "DISCONNECTED" ? (
                  <button type="button" className="btn" disabled={pending}
                    onClick={() => {
                      if (c.provider === "file") {
                        sync(c.id, {
                          importPayload: {
                            filename: `manual-import-${year}-${month}.csv`,
                            sha256: `demo-${clientId}-${year}-${month}`,
                            docType: "PNL",
                            rowCount: 0,
                          },
                        });
                      } else {
                        sync(c.id);
                      }
                    }}>
                    {pending ? "Syncing…" : "Sync now"}
                  </button>
                ) : null}
                <Link href={`/integrations/${c.id}`} className="chip">Manage</Link>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Recent syncs</div>
        {!data.recentRuns.length ? (
          <p className="caption">No sync runs yet.</p>
        ) : (
          <ul className="caption">
            {data.recentRuns.map((r) => (
              <li key={r.id}>
                {r.startedAt} · {label(r.provider)} · {r.status}
                {" · "}recv {r.recordsReceived} / new {r.recordsCreated} / skip {r.recordsSkipped}
                {r.errorMessage ? ` · ${r.errorMessage}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
