"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

export default function ConnectionDetail({
  initial,
}: {
  initial: {
    connection: {
      id: string; clientId: string; provider: string; status: string; health: string;
      externalAccountId: string | null; externalAccountName: string | null;
      connectedAt: string | null; lastSuccessfulSyncAt: string | null;
      lastAttemptedSyncAt: string | null; lastErrorMessage: string | null;
      capabilities: string[];
    };
    runs: {
      id: string; status: string; syncType: string; startedAt: string; completedAt: string | null;
      recordsReceived: number; recordsCreated: number; recordsUpdated: number; recordsSkipped: number;
      errorMessage: string | null; triggeredBy: string;
    }[];
  };
}) {
  const [bundle, setBundle] = useState(initial);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const c = bundle.connection;

  function act(action: string, extra: Record<string, unknown> = {}) {
    setError("");
    startTransition(async () => {
      const res = await fetch(`/api/integrations/${c.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        setError(data.error || data.outcome?.run?.errorMessage || "Action failed.");
      }
      const g = await fetch(`/api/integrations/${c.id}`);
      const full = await g.json();
      if (full.ok) setBundle(full);
    });
  }

  return (
    <div>
      <p className="caption" style={{ marginBottom: 12 }}>
        <Link href={`/integrations?client=${c.clientId}`} style={{ color: "var(--ink-soft)" }}>
          ← Integrations
        </Link>
      </p>
      <h1 className="display-l" style={{ margin: 0 }}>{c.provider}</h1>
      <p className="section-q" style={{ marginTop: 8 }}>
        {c.status.replace(/_/g, " ")} · {c.health.replace(/_/g, " ")}
      </p>

      <section style={{ margin: "24px 0" }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Connection</div>
        <ul className="caption">
          <li>External account: {c.externalAccountName || c.externalAccountId || "—"}</li>
          <li>Connected: {c.connectedAt || "—"}</li>
          <li>Last successful sync: {c.lastSuccessfulSyncAt || "—"}</li>
          <li>Last attempted sync: {c.lastAttemptedSyncAt || "—"}</li>
          <li>Capabilities: {c.capabilities.join(", ")}</li>
          {c.lastErrorMessage && <li>Last error: {c.lastErrorMessage}</li>}
        </ul>
        <p className="caption" style={{ marginTop: 10 }}>
          Tokens and secrets are never shown in this interface.
        </p>
      </section>

      <div className="flex gap-2 flex-wrap" style={{ marginBottom: 28 }}>
        <button type="button" className="btn" disabled={pending} onClick={() => {
          if (c.provider === "file") {
            act("sync", {
              importPayload: {
                filename: "hub-detail-import.csv",
                sha256: `detail-${c.id}-${Date.now()}`,
                docType: "PNL",
                rowCount: 0,
              },
            });
          } else {
            act("sync");
          }
        }}>
          {pending ? "Working…" : "Sync now"}
        </button>
        {c.provider === "mock" && (
          <button type="button" className="chip" disabled={pending}
            onClick={() => act("sync", { importPayload: { filename: "x", sha256: "x", docType: "FORCE_AUTH_FAIL" } })}>
            Simulate auth failure
          </button>
        )}
        {c.provider === "quickbooks" && (
          <a className="chip" href={`/api/qbo/connect?clientId=${c.clientId}`}>Reauthorize</a>
        )}
      </div>
      {error && <p className="caption" role="alert" style={{ color: "var(--accent-deep)" }}>{error}</p>}

      <section style={{ paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Sync history</div>
        <ul className="caption">
          {bundle.runs.map((r) => (
            <li key={r.id}>
              {r.startedAt} · {r.syncType} · {r.status}
              {" · "}{r.recordsReceived} received / {r.recordsCreated} created / {r.recordsUpdated} updated / {r.recordsSkipped} skipped
              {r.errorMessage ? ` · ${r.errorMessage}` : ""}
            </li>
          ))}
          {!bundle.runs.length && <li>No runs yet.</li>}
        </ul>
      </section>
    </div>
  );
}
