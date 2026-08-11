"use client";
/**
 * Storage panel.
 *
 * Restoring is destructive and irreversible from the user's point of view, so it is
 * deliberately not a one-click action: the operator has to type the word. Everything
 * else — taking a snapshot, checking one is readable — is one click, because a backup
 * routine people avoid is a backup routine that doesn't run.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

type Status = {
  count: number; latest: string | null; latestAt: string | null;
  ageHours: number | null; totalBytes: number; healthy: boolean;
};
type Snapshot = { name: string; sizeBytes: number; createdAt: string };

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, {
  year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
});

export default function BackupPanel({ initial }: { initial: Status }) {
  const [status, setStatus] = useState<Status>(initial);
  const [list, setList] = useState<Snapshot[] | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const router = useRouter();

  async function refresh() {
    const res = await fetch("/api/admin/backup");
    const data = await res.json();
    if (data.status) { setStatus(data.status); setList(data.backups); }
  }

  async function snapshot() {
    setBusy("create"); setMessage(null);
    const res = await fetch("/api/admin/backup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create" }),
    });
    const data = await res.json();
    setBusy("");
    setMessage(data.ok
      ? { tone: "ok", text: `Snapshot taken and verified — ${data.backup.note}.` }
      : { tone: "bad", text: data.error });
    await refresh();
  }

  async function verify(name: string) {
    setBusy(name); setMessage(null);
    const res = await fetch("/api/admin/backup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", name }),
    });
    const data = await res.json();
    setBusy("");
    setMessage(data.ok && data.result.ok
      ? { tone: "ok", text: `${name} is readable — ${data.result.note}.` }
      : { tone: "bad", text: data.result?.note || data.error });
  }

  async function restore(name: string) {
    setBusy(name); setMessage(null);
    const res = await fetch("/api/admin/backup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore", name, confirm: "RESTORE" }),
    });
    const data = await res.json();
    setBusy(""); setRestoring(null); setConfirmText("");
    setMessage(data.ok
      ? { tone: "ok", text: `Restored ${data.restored}. The previous state was saved as ${data.safetyCopy}.` }
      : { tone: "bad", text: data.error });
    await refresh();
    router.refresh();
  }

  return (
    <div>
      <div className="grid sm:grid-cols-4 gap-x-8 gap-y-4">
        <div className="kpi">
          <div className="eyebrow">Snapshots</div>
          <div className="kpi-value tnum">{status.count}</div>
          <div className="kpi-sub">{mb(status.totalBytes)} on disk</div>
        </div>
        <div className="kpi">
          <div className="eyebrow">Most recent</div>
          <div className="kpi-value tnum" style={{ fontSize: 24,
            color: status.healthy ? "var(--brand)" : "var(--accent-text)" }}>
            {status.ageHours === null ? "None" : `${status.ageHours}h ago`}
          </div>
          <div className="kpi-sub">{status.latestAt ? when(status.latestAt) : "No snapshot has been taken"}</div>
        </div>
        <div className="kpi">
          <div className="eyebrow">Schedule</div>
          <div className="kpi-value" style={{ fontSize: 18,
            color: status.healthy ? "var(--brand)" : "var(--accent-text)" }}>
            {status.healthy ? "Current" : "Stale"}
          </div>
          <div className="kpi-sub">Expected hourly</div>
        </div>
        <div className="kpi">
          <div className="eyebrow">Retention</div>
          <div className="kpi-value" style={{ fontSize: 18 }}>7 · 31 · ∞</div>
          <div className="kpi-sub">All week, daily a month, monthly beyond</div>
        </div>
      </div>

      {!status.healthy && (
        <div className="note note-bad" style={{ marginTop: 20 }}>
          <div className="note-head">No recent snapshot</div>
          <div className="note-body">
            The scheduled job does not appear to be running. Add it to cron:
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}>
              {" "}0 * * * * cd /srv/ledger &amp;&amp; npm run backup
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 22 }}>
        <button className="btn" onClick={snapshot} disabled={busy === "create"}>
          {busy === "create" ? "Taking snapshot…" : "Take a snapshot now"}
        </button>
        <button className="btn btn-quiet" onClick={() => (list ? setList(null) : refresh())}>
          {list ? "Hide snapshots" : "Show snapshots"}
        </button>
      </div>

      {message && (
        <p className="caption" style={{ marginTop: 14, maxWidth: 620,
          color: message.tone === "ok" ? "var(--brand-text)" : "var(--accent-text)" }}>
          {message.text}
        </p>
      )}

      {list && (
        <div style={{ marginTop: 22 }}>
          {list.length === 0 ? (
            <p className="prose">No snapshots yet.</p>
          ) : (
            <table className="ledger-table">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Snapshot</th>
                  <th>Taken</th><th>Size</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((b) => (
                  <tr key={b.name}>
                    <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 11.5 }}>{b.name}</td>
                    <td>{when(b.createdAt)}</td>
                    <td>{mb(b.sizeBytes)}</td>
                    <td className="space-x-4">
                      <button onClick={() => verify(b.name)} disabled={busy === b.name}
                        style={{ fontFamily: "var(--utility)", fontSize: 11, color: "var(--ink-mute)", cursor: "pointer" }}>
                        {busy === b.name ? "…" : "Verify"}
                      </button>
                      <button onClick={() => { setRestoring(b.name); setConfirmText(""); }}
                        style={{ fontFamily: "var(--utility)", fontSize: 11, color: "var(--accent-text)", cursor: "pointer" }}>
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {restoring && (
        <div style={{ marginTop: 22, border: "1px solid var(--accent)", padding: "18px 20px" }}>
          <div className="eyebrow" style={{ color: "var(--accent-text)", marginBottom: 8 }}>
            Restore {restoring}
          </div>
          <p className="prose" style={{ maxWidth: 620 }}>
            This replaces every client&apos;s data with the contents of that snapshot. Anything
            published since it was taken will be gone. The current state is saved first, so a
            restore can itself be undone, but clients viewing the portal will see the change
            immediately.
          </p>
          <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 14 }}>
            <input className="input" style={{ maxWidth: 220 }} value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type RESTORE to confirm" aria-label="Type RESTORE to confirm" />
            <button className="btn" style={{ background: "var(--accent-deep)", borderColor: "var(--accent-deep)" }}
              disabled={confirmText !== "RESTORE" || busy === restoring}
              onClick={() => restore(restoring)}>
              {busy === restoring ? "Restoring…" : "Restore this snapshot"}
            </button>
            <button className="btn btn-quiet" onClick={() => { setRestoring(null); setConfirmText(""); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
