"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Status = { connected: boolean; realmId: string | null; lastSyncAt: string | null; lastSyncStatus: string };

export default function QboPanel({ clientId, configured }: { clientId: string; configured: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() || 12);
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/qbo/sync?clientId=${clientId}`).then((r) => r.json()).then(setStatus).catch(() => {});
  }, [clientId]);

  async function sync() {
    setBusy(true); setResult(null);
    const res = await fetch("/api/qbo/sync", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, year, month }),
    });
    setResult(await res.json());
    setBusy(false);
    router.refresh();
  }

  async function disconnect() {
    if (!confirm("Disconnect QuickBooks? Uploads will go back to CSV only.")) return;
    await fetch("/api/qbo/sync", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    setStatus({ connected: false, realmId: null, lastSyncAt: null, lastSyncStatus: "" });
  }

  if (!configured) {
    return (
      <div className="">
        <h2 className="display-m">QuickBooks Online</h2>
        <p className="caption" style={{ marginTop: 8 }}>
          Not configured on this server. Add <span style={{ fontFamily: "ui-monospace, monospace" }}>QBO_CLIENT_ID</span> and{" "}
          <span style={{ fontFamily: "ui-monospace, monospace" }}>QBO_CLIENT_SECRET</span> to your environment, then restart.
          Until then, the bookkeeper uploads all four CSVs by hand.
        </p>
      </div>
    );
  }

  return (
    <div className="">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="display-m">QuickBooks Online</h2>
          <p className="caption" style={{ marginTop: 4 }}>
            Pulls the P&amp;L by class and AR aging. Payroll and hours stay CSV.
          </p>
        </div>
        <span className="tag" style={{ color: status?.connected ? "var(--brand)" : "var(--ink-mute)" }}>
          {status?.connected ? "Connected" : "Not connected"}
        </span>
      </div>

      {!status?.connected ? (
        <a className="btn" style={{ display: "inline-block", background: "#2CA01C", borderColor: "#2CA01C" }}
          href={`/api/qbo/connect?clientId=${clientId}`}>
          Connect to QuickBooks
        </a>
      ) : (
        <>
          <div className="caption" style={{ marginBottom: 16 }}>
            Company {status.realmId}
            {status.lastSyncAt && <> · last pulled {status.lastSyncAt} — {status.lastSyncStatus}</>}
          </div>
          <div className="flex gap-2 items-end flex-wrap">
            <div>
              <label className="field-label">Year</label>
              <input type="number" className="input" style={{ marginTop: 5, width: 96 }} value={year} onChange={(e) => setYear(+e.target.value)} />
            </div>
            <div>
              <label className="field-label">Month</label>
              <select className="input" style={{ marginTop: 5 }} value={month} onChange={(e) => setMonth(+e.target.value)}>
                {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <button className="btn" disabled={busy} onClick={sync}>
              {busy ? "Pulling…" : "Pull this month"}
            </button>
            <button className="ml-auto" style={{ fontFamily: "var(--utility)", fontSize: 10.5, color: "var(--accent-deep)", cursor: "pointer" }} onClick={disconnect}>Disconnect</button>
          </div>
        </>
      )}

      {result && (
        <div style={{ marginTop: 22 }}>
          {result.ok ? (
            <>
              <div style={{ fontFamily: "var(--display)", fontSize: 17, marginBottom: 12, color: result.gate?.pass ? "var(--brand)" : "var(--accent-deep)" }}>
                Pulled {result.pulled.plLines} P&amp;L lines and {result.pulled.arRows} AR rows.{" "}
                {result.gate?.pass ? "Gate passed — ready for review." : "Gate failed — see below."}
              </div>
              {result.warnings?.map((w: string, i: number) => (
                <div key={i} style={{ fontFamily: "var(--utility)", fontSize: 11, padding: "8px 11px", marginBottom: 6, borderLeft: "2px solid var(--gold-label)", color: "var(--ink-soft)" }}>{w}</div>
              ))}
              {result.gate?.checks?.filter((c: any) => !c.pass).map((c: any, i: number) => (
                <div key={i} style={{ fontFamily: "var(--utility)", fontSize: 11, padding: "8px 11px", marginBottom: 6, borderLeft: "2px solid var(--accent-deep)", color: "var(--accent-deep)" }}>
                  <b>{c.name}</b> — {c.detail}
                </div>
              ))}
            </>
          ) : (
            <div style={{ fontFamily: "var(--utility)", fontSize: 11, padding: "8px 11px", borderLeft: "2px solid var(--accent-deep)", color: "var(--accent-deep)" }}>
              {result.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
