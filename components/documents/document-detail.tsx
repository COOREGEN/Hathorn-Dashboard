"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type {
  DocumentType, ExtractionRun, SourceDocument, StructuredDraft,
} from "@/lib/documents/types";
import type { PayrollReconciliation } from "@/lib/documents/reconcile-payroll";

const money = (n: number | null | undefined) =>
  n == null ? "—" : `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function DocumentDetail({
  document: initial, extractions: initialExtractions, latest: initialLatest,
  reconciliation: initialRecon, summary: initialSummary, types,
}: {
  document: SourceDocument;
  extractions: ExtractionRun[];
  latest: ExtractionRun | null;
  reconciliation: PayrollReconciliation | null;
  summary: string;
  types: { value: DocumentType; label: string }[];
}) {
  const [doc, setDoc] = useState(initial);
  const [extractions, setExtractions] = useState(initialExtractions);
  const [latest, setLatest] = useState(initialLatest);
  const [recon, setRecon] = useState(initialRecon);
  const [summary, setSummary] = useState(initialSummary);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const draft: StructuredDraft | null =
    doc.reviewedJson || latest?.structuredResult || null;
  const raw = latest?.rawResult;

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setError("");
    startTransition(async () => {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Action failed."); return; }
      if (data.document) setDoc(data.document);
      if (data.extraction) setLatest(data.extraction);
      if (data.extractions) setExtractions(data.extractions);
      // Refresh detail bundle
      const g = await fetch(`/api/documents/${doc.id}`);
      const full = await g.json().catch(() => ({}));
      if (full.ok) {
        setDoc(full.document);
        setExtractions(full.extractions);
        setLatest(full.latest);
        setRecon(full.reconciliation);
        setSummary(full.summary);
      }
    });
  }

  return (
    <div>
      <p className="caption" style={{ marginBottom: 12 }}>
        <Link href={`/documents?client=${doc.clientId}`} style={{ color: "var(--ink-soft)" }}>
          ← Documents
        </Link>
      </p>
      <h1 className="display-l" style={{ margin: 0 }}>
        {types.find((t) => t.value === doc.documentType)?.label || doc.documentType}
      </h1>
      <p className="section-q" style={{ marginTop: 8 }}>
        {doc.originalFilename} · {doc.status.replace(/_/g, " ")} · SHA-256 {doc.sha256.slice(0, 12)}…
      </p>

      <div className="flex gap-2 flex-wrap" style={{ margin: "22px 0 28px" }}>
        <a className="btn" href={`/api/documents/${doc.id}?download=1`}>Download original</a>
        <button type="button" className="chip" disabled={pending} onClick={() => act("reprocess")}>
          Reprocess
        </button>
        <button type="button" className="chip" disabled={pending || doc.status === "APPROVED"}
          onClick={() => act("approve")}>Approve</button>
        <button type="button" className="chip" disabled={pending}
          onClick={() => act("reject", { reason: "Rejected after review" })}>Reject</button>
        <select className="input" style={{ width: "auto" }} value={doc.documentType}
          disabled={pending}
          onChange={(e) => act("set_type", { documentType: e.target.value })}>
          {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      {error && <p className="caption" role="alert" style={{ color: "var(--accent-deep)" }}>{error}</p>}

      <section style={{ marginBottom: 32 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Metadata</div>
        <dl className="caption" style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "6px 12px", maxWidth: 640 }}>
          <dt>MIME</dt><dd>{doc.mimeType}</dd>
          <dt>Size</dt><dd>{doc.fileSize.toLocaleString()} bytes</dd>
          <dt>Uploaded</dt><dd>{doc.uploadedAt}</dd>
          <dt>Period</dt><dd>{doc.periodId || "—"}</dd>
          <dt>Engine</dt><dd>{latest ? `${latest.engine} ${latest.engineVersion}` : "—"}</dd>
          <dt>Confidence</dt><dd>{latest?.confidenceSummary || "—"}</dd>
        </dl>
      </section>

      <section style={{ marginBottom: 32, paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Summary</div>
        <pre style={{
          whiteSpace: "pre-wrap", fontFamily: "var(--editorial)", fontSize: 15,
          lineHeight: 1.55, maxWidth: 720, margin: 0,
        }}>{summary}</pre>
      </section>

      {recon?.available && (
        <section style={{ marginBottom: 32, paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Payroll vs ledger (exception only)</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" style={{ marginBottom: 12 }}>
            <div>
              <div className="eyebrow">Register gross</div>
              <div className="tnum" style={{ fontFamily: "var(--display)", fontSize: 22 }}>{money(recon.registerGross)}</div>
            </div>
            <div>
              <div className="eyebrow">Ledger payroll</div>
              <div className="tnum" style={{ fontFamily: "var(--display)", fontSize: 22 }}>{money(recon.ledgerPayrollDollars)}</div>
            </div>
            <div>
              <div className="eyebrow">Difference</div>
              <div className="tnum" style={{ fontFamily: "var(--display)", fontSize: 22 }}>{money(recon.difference)}</div>
            </div>
            <div>
              <div className="eyebrow">Status</div>
              <div style={{ fontFamily: "var(--editorial)", fontSize: 18, marginTop: 6 }}>{recon.status.replace(/_/g, " ")}</div>
            </div>
          </div>
          <p className="caption">{recon.detail}</p>
        </section>
      )}

      <section style={{ marginBottom: 32, paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Source vs extracted</div>
        <div className="grid lg:grid-cols-2 gap-8">
          <div>
            <div className="caption" style={{ marginBottom: 8 }}>SOURCE (parsed tables)</div>
            {!raw?.tables?.length ? (
              <p className="caption">No tables in raw extraction.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="w-full" style={{ fontSize: 12, fontFamily: "var(--sans)" }}>
                  <thead>
                    <tr>{raw.tables[0].headers.map((h, i) => (
                      <th key={i} style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid var(--hairline)" }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {raw.tables[0].rows.slice(0, 20).map((row, ri) => (
                      <tr key={ri}>{row.map((c, ci) => (
                        <td key={ci} className="tnum" style={{ padding: "4px 8px", borderBottom: "1px solid var(--hairline)" }}>{c}</td>
                      ))}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div>
            <div className="caption" style={{ marginBottom: 8 }}>EXTRACTED DRAFT</div>
            {!draft ? (
              <p className="caption">No structured draft yet.</p>
            ) : (
              <>
                <ul className="caption" style={{ marginBottom: 12 }}>
                  {draft.fields.map((f) => (
                    <li key={f.key}>{f.label}: {typeof f.value === "number" ? money(f.value) : (f.value ?? "—")}
                      {f.source?.tableIndex != null && (
                        <span style={{ color: "var(--ink-soft)" }}>
                          {" "}· table {f.source.tableIndex}
                          {f.source.column != null ? ` col ${f.source.column}` : ""}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="caption">Confidence rules: {draft.confidenceRules.join(" ")}</p>
                {draft.warnings.length > 0 && (
                  <p className="caption" style={{ marginTop: 8 }}>Warnings: {draft.warnings.join(" · ")}</p>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <section style={{ paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Extraction history</div>
        <p className="caption" style={{ marginBottom: 12 }}>
          Reprocessing appends a new run. Raw parser output is never overwritten.
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {extractions.map((e) => (
            <li key={e.id} className="caption" style={{ padding: "8px 0", borderTop: "1px solid var(--hairline)" }}>
              {e.createdAt} · {e.engine} {e.engineVersion} · {e.status}
              {e.confidenceSummary ? ` · ${e.confidenceSummary}` : ""}
              {e.errorMessage ? ` · ${e.errorMessage}` : ""}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
