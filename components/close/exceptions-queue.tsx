"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

type Ex = {
  id: string; clientName: string; clientId: string; year: number | null; month: number | null;
  title: string; severity: string; status: string; assignedTo: string | null;
  blocking: boolean; periodId: string | null; closeRunId: string | null;
};

export default function ExceptionsQueue({
  initial, users, currentUserId,
}: {
  initial: Ex[];
  users: { id: string; name: string }[];
  currentUserId: string;
}) {
  const [rows, setRows] = useState(initial);
  const [mine, setMine] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  async function reload(nextMine: boolean) {
    const q = nextMine ? "?mine=1" : "";
    const res = await fetch(`/api/exceptions${q}`);
    const data = await res.json();
    if (data.ok) setRows(data.exceptions);
  }

  function assign(exceptionId: string, assigneeId: string) {
    setError("");
    startTransition(async () => {
      const res = await fetch("/api/exceptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign", exceptionId, assigneeId: assigneeId || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) setError(data.error || "Assign failed.");
      await reload(mine);
    });
  }

  function resolve(exceptionId: string) {
    const note = window.prompt("Resolution note (required):");
    if (!note) return;
    setError("");
    startTransition(async () => {
      const res = await fetch("/api/exceptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resolve", exceptionId, resolutionNote: note, resolutionCategory: "OTHER",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) setError(data.error || "Resolve failed.");
      await reload(mine);
    });
  }

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-4"
        style={{ borderBottom: "1px solid var(--hairline)", paddingBottom: 18, marginBottom: 28 }}>
        <div>
          <h1 className="display-l" style={{ margin: 0 }}>Exceptions</h1>
          <p className="section-q" style={{ marginTop: 8, marginBottom: 0 }}>
            Firm-wide open work from reconciliations, documents, variance, and close checks.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="chip" onClick={() => { setMine(false); reload(false); }}>All</button>
          <button type="button" className="chip" onClick={() => { setMine(true); reload(true); }}>My open items</button>
          <Link href="/close" className="chip">Close →</Link>
        </div>
      </div>
      {error && <p className="caption" role="alert" style={{ color: "var(--accent-deep)" }}>{error}</p>}

      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--utility)", fontSize: 12 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid var(--hairline)" }}>
            <th style={{ padding: "8px 6px" }}>Client</th>
            <th style={{ padding: "8px 6px" }}>Period</th>
            <th style={{ padding: "8px 6px" }}>Issue</th>
            <th style={{ padding: "8px 6px" }}>Severity</th>
            <th style={{ padding: "8px 6px" }}>Status</th>
            <th style={{ padding: "8px 6px" }}>Owner</th>
            <th style={{ padding: "8px 6px" }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} style={{ borderBottom: "1px solid var(--hairline)" }}>
              <td style={{ padding: "10px 6px" }}>{e.clientName}</td>
              <td className="tnum" style={{ padding: "10px 6px" }}>
                {e.month && e.year ? `${e.month}/${e.year}` : "—"}
              </td>
              <td style={{ padding: "10px 6px" }}>
                {e.title}
                {e.blocking ? " · blocking" : ""}
                {e.closeRunId && (
                  <> · <Link href={`/close/${e.closeRunId}`}>close</Link></>
                )}
              </td>
              <td style={{ padding: "10px 6px" }}>{e.severity}</td>
              <td style={{ padding: "10px 6px" }}>{e.status}</td>
              <td style={{ padding: "10px 6px" }}>
                <select className="input" style={{ fontSize: 11 }} disabled={pending}
                  value={e.assignedTo || ""}
                  onChange={(ev) => assign(e.id, ev.target.value)}>
                  <option value="">Unassigned</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  <option value={currentUserId}>Me</option>
                </select>
              </td>
              <td style={{ padding: "10px 6px" }}>
                {e.status !== "RESOLVED" && (
                  <button type="button" className="chip" disabled={pending} onClick={() => resolve(e.id)}>
                    Resolve
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="caption">No exceptions match.</p>}
    </div>
  );
}
