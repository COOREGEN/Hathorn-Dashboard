"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { DocumentType, SourceDocument } from "@/lib/documents/types";

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function DocumentsWorkspace({
  clients, initialClientId, periods, initialDocuments, types, intelligence,
}: {
  clients: { id: string; name: string }[];
  initialClientId: string;
  periods: { id: string; year: number; month: number; status: string }[];
  initialDocuments: SourceDocument[];
  types: { value: DocumentType; label: string }[];
  intelligence: { enabled: boolean; reason: string };
}) {
  const [clientId, setClientId] = useState(initialClientId);
  const [docs, setDocs] = useState(initialDocuments);
  const [documentType, setDocumentType] = useState<DocumentType>("PAYROLL_REGISTER");
  const [periodId, setPeriodId] = useState(periods[0]?.id || "");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  async function onUpload(file: File | null) {
    if (!file) return;
    setError(""); setNotice("");
    const fd = new FormData();
    fd.set("clientId", clientId);
    fd.set("documentType", documentType);
    if (periodId) fd.set("periodId", periodId);
    fd.set("file", file);
    startTransition(async () => {
      const res = await fetch("/api/documents", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Upload failed."); return; }
      setDocs((d) => [data.document, ...d.filter((x) => x.id !== data.document.id)]);
      if (data.duplicates?.length) {
        setNotice(`Duplicate content detected (same SHA-256 as ${data.duplicates.length} earlier upload). Both copies kept.`);
      } else {
        setNotice("Document stored. Extraction is a draft until you approve.");
      }
    });
  }

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-4"
        style={{ borderBottom: "1px solid var(--hairline)", paddingBottom: 18, marginBottom: 28 }}>
        <div>
          <h1 className="display-l" style={{ margin: 0 }}>Documents</h1>
          <p className="section-q" style={{ marginTop: 8, marginBottom: 0 }}>
            Supporting schedules and source evidence. Extraction creates drafts — never posts to the books.
          </p>
        </div>
        <div>
          <label className="field-label" htmlFor="doc-client">Client</label>
          <select id="doc-client" className="input" style={{ marginTop: 4, minWidth: 240 }}
            value={clientId}
            onChange={(e) => { window.location.href = `/documents?client=${e.target.value}`; }}>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <p className="caption" style={{ marginBottom: 24, maxWidth: 640 }}>
        {intelligence.enabled
          ? "Document worker enabled for PDF/XLSX. CSV uses the native parser."
          : "Native CSV parsing is available. Set DOCUMENT_INTELLIGENCE_ENABLED=1 for the Python worker (Docling optional)."}
        {" "}Files are not malware-scanned.
      </p>

      <section style={{ marginBottom: 36, paddingBottom: 28, borderBottom: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>Upload document</div>
        <div className="grid sm:grid-cols-3 gap-4" style={{ maxWidth: 820, marginBottom: 16 }}>
          <div>
            <label className="field-label" htmlFor="doc-type">Document type</label>
            <select id="doc-type" className="input" style={{ marginTop: 5 }}
              value={documentType} onChange={(e) => setDocumentType(e.target.value as DocumentType)}>
              {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="doc-period">Link period (optional)</label>
            <select id="doc-period" className="input" style={{ marginTop: 5 }}
              value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
              <option value="">— none —</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.year}-{String(p.month).padStart(2, "0")} · {p.status}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="doc-file">File</label>
            <input id="doc-file" className="input" style={{ marginTop: 5 }} type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls,.pdf,.docx,.pptx,.png,.jpg,.jpeg"
              disabled={pending}
              onChange={(e) => onUpload(e.target.files?.[0] || null)} />
          </div>
        </div>
        {pending && <p className="caption">Uploading…</p>}
        {error && <p className="caption" role="alert" style={{ color: "var(--accent-deep)" }}>{error}</p>}
        {notice && <p className="caption" style={{ color: "var(--ink-soft)" }}>{notice}</p>}
      </section>

      <section>
        <div className="eyebrow" style={{ marginBottom: 14 }}>Library</div>
        {!docs.length ? (
          <p className="caption">No documents yet for this client.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {docs.map((d) => (
              <li key={d.id} style={{
                borderTop: "1px solid var(--hairline)", padding: "16px 0",
                display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
              }}>
                <div>
                  <Link href={`/documents/${d.id}`} style={{ color: "var(--ink)", textDecoration: "none" }}>
                    <span style={{ fontFamily: "var(--editorial)", fontSize: 18 }}>
                      {types.find((t) => t.value === d.documentType)?.label || d.documentType}
                    </span>
                  </Link>
                  <div className="caption" style={{ marginTop: 4 }}>
                    {d.originalFilename} · {money(d.fileSize).replace("$", "")} bytes · {d.status.replace(/_/g, " ")}
                  </div>
                </div>
                <Link href={`/documents/${d.id}`} className="chip">Open</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
