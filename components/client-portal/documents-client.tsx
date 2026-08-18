"use client";

import { useState, useTransition } from "react";

type Doc = { id: string; originalFilename: string; documentType: string; uploadedAt: string };
type Req = {
  id: string; title: string; description: string; dueDate: string | null;
  status: string; clientNote: string | null;
};

export default function DocumentsClient({
  documents,
  requests,
  canUpload,
}: {
  documents: Doc[];
  requests: Req[];
  canUpload: boolean;
}) {
  const [reqs, setReqs] = useState(requests);
  const [docs, setDocs] = useState(documents);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function upload(requestId: string, file: File) {
    setError("");
    startTransition(async () => {
      const fd = new FormData();
      fd.set("requestId", requestId);
      fd.set("file", file);
      const res = await fetch("/api/client-portal", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Upload failed.");
        return;
      }
      setReqs((prev) => prev.map((r) => (r.id === requestId ? json.request : r)));
      setDocs((prev) => [
        {
          id: json.documentId,
          originalFilename: file.name,
          documentType: "OTHER",
          uploadedAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    });
  }

  function markNA(requestId: string) {
    startTransition(async () => {
      const res = await fetch("/api/client-portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "markRequestNA", requestId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Could not update request.");
        return;
      }
      setReqs((prev) => prev.map((r) => (r.id === requestId ? json.request : r)));
    });
  }

  return (
    <div>
      {error && <p style={{ color: "#8a2b2b" }}>{error}</p>}

      <section style={{ marginBottom: 36 }}>
        <h2 className="eyebrow">Needs your attention</h2>
        <div style={{ display: "grid", gap: 14, marginTop: 12 }}>
          {reqs.filter((r) => r.status === "OPEN").map((r) => (
            <div key={r.id} style={{ borderTop: "1px solid rgba(44,80,77,0.14)", paddingTop: 12 }}>
              <p className="prose">{r.title}</p>
              {r.description && <p className="prepared-by">{r.description}</p>}
              {r.dueDate && <p className="prepared-by">Due {r.dueDate}</p>}
              {canUpload && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  <label className="chip" style={{ cursor: "pointer" }}>
                    {pending ? "Working…" : "Upload"}
                    <input
                      type="file"
                      style={{ display: "none" }}
                      disabled={pending}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) upload(r.id, f);
                      }}
                    />
                  </label>
                  <button type="button" className="chip" disabled={pending} onClick={() => markNA(r.id)}>
                    Not applicable
                  </button>
                </div>
              )}
            </div>
          ))}
          {!reqs.some((r) => r.status === "OPEN") && (
            <p className="prepared-by">No open document requests.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="eyebrow">Shared documents</h2>
        <ul style={{ listStyle: "none", padding: 0, marginTop: 12 }}>
          {docs.map((d) => (
            <li key={d.id} style={{ borderTop: "1px solid rgba(44,80,77,0.12)", padding: "10px 0", display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div className="prose">{d.originalFilename}</div>
                <div className="prepared-by">{d.documentType} · {d.uploadedAt.slice(0, 10)}</div>
              </div>
              <a className="chip" href={`/api/client-portal/download?id=${d.id}`}>
                Download
              </a>
            </li>
          ))}
          {!docs.length && (
            <li className="prepared-by">No shared documents yet.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
