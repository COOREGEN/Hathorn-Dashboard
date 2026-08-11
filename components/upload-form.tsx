"use client";
import { useState } from "react";
import Link from "next/link";

type GateCheck = { name: string; pass: boolean; detail: string };

export default function UploadForm({ clients, entities }:
  { clients: { id: string; name: string }[]; entities: { id: string; clientId: string; name: string }[] }) {
  const [clientId, setClientId] = useState(clients[0]?.id || "");
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(6);
  const [files, setFiles] = useState<Record<string, File | null>>({
    pnl: null, payroll: null, ar: null, cash: null, balance: null, budget: null });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    pass: boolean; checks: GateCheck[]; error?: string; periodId?: string;
  } | null>(null);

  const slots = [
    ["pnl", "P&L (by class / export)"],
    ["payroll", "Payroll register"],
    ["ar", "AR aging"],
    ["cash", "Bank balance"],
    ["balance", "Balance sheet (optional)"],
    ["budget", "Budget (optional)"],
  ] as const;

  async function submit() {
    setBusy(true); setResult(null);
    const fd = new FormData();
    fd.set("clientId", clientId); fd.set("year", String(year)); fd.set("month", String(month));
    for (const [k] of slots) if (files[k]) fd.set(k, files[k] as File);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    setBusy(false);
    setResult(data);
  }

  const REQUIRED = ["pnl", "payroll", "ar", "cash"];
  const ready = clientId && REQUIRED.every((k) => files[k]);
  const clientEntities = entities.filter((e) => e.clientId === clientId);

  return (
    <div className="">
      <div className="grid sm:grid-cols-3 gap-4" style={{ marginBottom: 22 }}>
        <div>
          <label className="field-label">Client</label>
          <select className="input" style={{ marginTop: 5 }} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Year</label>
          <input type="number" className="input" style={{ marginTop: 5 }} value={year} onChange={(e) => setYear(+e.target.value)} />
        </div>
        <div>
          <label className="field-label">Month</label>
          <select className="input" style={{ marginTop: 5 }} value={month} onChange={(e) => setMonth(+e.target.value)}>
            {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      {clientEntities.length > 0 && (
        <p className="caption" style={{ marginBottom: 16 }}>
          Entity names for this client: {clientEntities.map((e) => e.name).join(" · ")}
        </p>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {slots.map(([k, label]) => (
          <label key={k}
            style={{ border: `1px solid ${files[k] ? "var(--brand)" : "var(--hairline)"}`, background: files[k] ? "var(--brand-tint)" : "transparent", padding: "18px 16px", textAlign: "center", cursor: "pointer" }}>
            <input type="file" accept=".csv" className="hidden"
              onChange={(e) => setFiles({ ...files, [k]: e.target.files?.[0] || null })} />
            <div style={{ fontFamily: "var(--utility)", fontSize: 11.5, fontWeight: 600 }}>{label}</div>
            <div className="caption" style={{ marginTop: 4, color: files[k] ? "var(--brand)" : "var(--ink-mute)" }}>
              {files[k] ? `✓ ${files[k]!.name}` : "Click to attach"}
            </div>
          </label>
        ))}
      </div>

      <button className="btn" style={{ width: "100%", marginTop: 22 }} disabled={!ready || busy} onClick={submit}>
        {busy ? "Uploading & running the gate…" : "Mark Close Final & Run the Gate"}
      </button>

      {result && (
        <div className="mt-4">
          <div style={{ fontFamily: "var(--display)", fontSize: 18, marginBottom: 14, color: result.pass ? "var(--brand)" : "var(--accent-deep)" }}>
            {result.error ? `Upload error: ${result.error}` :
              result.pass ? "Gate passed — ready for call prep." : "Gate failed — fix the breaks below and re-upload."}
          </div>
          {result.pass && result.periodId && (
            <Link href={`/review/${result.periodId}`} className="btn" style={{ display: "inline-block", marginBottom: 18 }}>
              Open call prep →
            </Link>
          )}
          <div className="space-y-1.5">
            {result.checks?.map((c, i) => (
              <div key={i} className="flex gap-2" style={{ fontFamily: "var(--utility)", fontSize: 11, padding: "8px 11px", borderLeft: `2px solid ${c.pass ? "var(--brand)" : "var(--accent-deep)"}`, color: c.pass ? "var(--ink-soft)" : "var(--accent-deep)" }}>
                <b>{c.pass ? "✓" : "✗"}</b>
                <span><b>{c.name}</b> — {c.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
