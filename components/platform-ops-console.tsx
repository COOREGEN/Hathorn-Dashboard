"use client";

import { useEffect, useState, useTransition } from "react";

type JobRow = {
  id: string;
  jobType: string;
  clientId: string | null;
  status: string;
  attempt: number;
  maxAttempts: number;
  errorCode: string | null;
  errorMessage: string | null;
  retryEligible: boolean;
  createdAt: string;
};

export default function PlatformOpsConsole() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [usage, setUsage] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [q, setQ] = useState("");
  const [firms, setFirms] = useState<any[]>([]);
  const [diag, setDiag] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [pending, startTransition] = useTransition();

  async function refresh() {
    const [j, u] = await Promise.all([
      fetch("/api/ops/jobs").then((r) => r.json()),
      fetch("/api/ops/usage").then((r) => r.json()),
    ]);
    if (j.ok) {
      setCounts(j.counts || {});
      setJobs(j.jobs || []);
    }
    if (u.ok) {
      setUsage(u.usage);
      setHealth(u.health);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function retry(jobId: string) {
    startTransition(async () => {
      const res = await fetch("/api/ops/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "retry", jobId }),
      }).then((r) => r.json());
      setMsg(res.ok ? `Retried · ref ${res.reference || ""}` : res.error || "Retry failed");
      await refresh();
    });
  }

  function runIntegrity() {
    startTransition(async () => {
      const res = await fetch("/api/ops/diagnostics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "integrity" }),
      }).then((r) => r.json());
      setMsg(res.ok ? "Integrity check complete" : res.error || "Failed");
      if (res.ok) setDiag(res.result);
    });
  }

  function searchFirms() {
    startTransition(async () => {
      const res = await fetch(`/api/ops/diagnostics?q=${encodeURIComponent(q)}`).then((r) => r.json());
      if (res.ok) setFirms(res.firms || []);
    });
  }

  function loadClient(clientId: string) {
    startTransition(async () => {
      const res = await fetch(`/api/ops/diagnostics?clientId=${encodeURIComponent(clientId)}`)
        .then((r) => r.json());
      if (res.ok) setDiag(res.diagnostics);
      else setMsg(res.error || "Not found");
    });
  }

  return (
    <div style={{ marginTop: 48 }}>
      <h2 className="display-m" style={{ marginBottom: 8 }}>Operations</h2>
      <p className="section-q" style={{ marginBottom: 24 }}>
        System health, jobs, and safe support diagnostics — metadata only, never raw books.
      </p>

      {health && (
        <section style={{ marginBottom: 32 }}>
          <h3 className="eyebrow" style={{ marginBottom: 12 }}>System health</h3>
          <p className="caption" style={{ marginBottom: 8 }}>
            {health.appEnv} · {health.appVersion}
            {health.gitCommit ? ` · ${health.gitCommit}` : ""} · {health.status}
          </p>
          <table className="data" style={{ width: "100%" }}>
            <thead>
              <tr><th>Dependency</th><th>Tier</th><th>Status</th><th>Detail</th></tr>
            </thead>
            <tbody>
              {(health.dependencies || []).map((d: any) => (
                <tr key={d.name}>
                  <td>{d.name}</td>
                  <td>{d.tier}</td>
                  <td>{d.status}</td>
                  <td className="caption">{d.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {usage && (
        <section style={{ marginBottom: 32 }}>
          <h3 className="eyebrow" style={{ marginBottom: 12 }}>Usage</h3>
          <p className="caption">
            Firms {usage.firms?.active} · Clients {usage.clients?.total} · Jobs today {usage.jobs?.createdLast24h} ·
            Failed jobs {usage.jobs?.FAILED || 0} · Sync success {usage.integrations?.syncSuccessPct ?? "—"}% ·
            AI requests (24h) {usage.ai?.requestsLast24h}
          </p>
        </section>
      )}

      <section style={{ marginBottom: 32 }}>
        <h3 className="eyebrow" style={{ marginBottom: 12 }}>Background jobs</h3>
        <p className="caption" style={{ marginBottom: 12 }}>
          Queued {counts.QUEUED || 0} · Running {counts.RUNNING || 0} · Retrying {counts.RETRYING || 0} ·
          Failed {counts.FAILED || 0} · Stuck {counts.STUCK || 0}
        </p>
        <table className="data" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>Type</th><th>Status</th><th>Attempt</th><th>Error</th><th />
            </tr>
          </thead>
          <tbody>
            {jobs.filter((j) => ["FAILED", "STUCK", "RETRYING", "RUNNING", "QUEUED"].includes(j.status))
              .slice(0, 20)
              .map((j) => (
                <tr key={j.id}>
                  <td>{j.jobType}</td>
                  <td>{j.status}</td>
                  <td className="num">{j.attempt}/{j.maxAttempts}</td>
                  <td className="caption">{j.errorCode || "—"}</td>
                  <td>
                    {j.retryEligible && (
                      <button type="button" className="btn-text" disabled={pending} onClick={() => retry(j.id)}>
                        Retry
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            {!jobs.length && (
              <tr><td colSpan={5} className="caption">No jobs yet.</td></tr>
            )}
          </tbody>
        </table>
        <button type="button" className="btn-secondary" style={{ marginTop: 12 }} disabled={pending} onClick={runIntegrity}>
          Run integrity check
        </button>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 className="eyebrow" style={{ marginBottom: 12 }}>Firm search</h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Firm name, id, or admin email"
            style={{ flex: 1 }}
          />
          <button type="button" className="btn-secondary" disabled={pending} onClick={searchFirms}>
            Search
          </button>
        </div>
        {firms.length > 0 && (
          <table className="data" style={{ width: "100%" }}>
            <thead>
              <tr><th>Firm</th><th>Status</th><th>Clients</th><th>Slug</th></tr>
            </thead>
            <tbody>
              {firms.map((f) => (
                <tr key={f.id}>
                  <td>{f.name}</td>
                  <td>{f.status}</td>
                  <td className="num">{f.client_count}</td>
                  <td className="caption">{f.slug}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="caption" style={{ marginTop: 16 }}>
          Client diagnostics (paste client id):
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="input"
            id="diag-client"
            placeholder="client id"
            style={{ flex: 1 }}
            onKeyDown={(e) => {
              if (e.key === "Enter") loadClient((e.target as HTMLInputElement).value.trim());
            }}
          />
          <button
            type="button"
            className="btn-secondary"
            disabled={pending}
            onClick={() => {
              const el = document.getElementById("diag-client") as HTMLInputElement | null;
              if (el?.value) loadClient(el.value.trim());
            }}
          >
            Inspect
          </button>
        </div>
      </section>

      {diag && (
        <section style={{ marginBottom: 32 }}>
          <h3 className="eyebrow" style={{ marginBottom: 12 }}>Diagnostic detail</h3>
          <pre
            className="caption"
            style={{
              whiteSpace: "pre-wrap",
              background: "var(--rule-soft)",
              padding: 16,
              overflow: "auto",
              maxHeight: 360,
            }}
          >
            {JSON.stringify(diag, null, 2)}
          </pre>
        </section>
      )}

      {msg && <p className="caption" style={{ color: "var(--gold-deep)" }}>{msg}</p>}
    </div>
  );
}
