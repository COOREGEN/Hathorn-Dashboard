"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatCents } from "@/lib/reconciliation/money";

type Bundle = {
  reconciliation: {
    id: string; clientId: string; periodId: string; type: string; status: string;
    readiness: string; controlSource: string; supportingSource: string;
    controlAmountCents: number | null; supportingAmountCents: number | null;
    differenceCents: number | null; absoluteDifferenceCents: number | null;
    toleranceCents: number; toleranceSource: string; issues: string[];
    reviewedBy: string | null; reviewedAt: string | null;
  };
  runs: {
    id: string; status: string; differenceCents: number | null; engineVersion: string;
    createdAt: string; controlSnapshot: any; supportingSnapshot: any;
  }[];
  exceptions: {
    id: string; type: string; severity: string; title: string; description: string;
    status: string; resolutionNote: string | null; acceptedDifferenceCents: number | null;
  }[];
  definition: {
    label: string; controlDescription: string; supportingDescription: string;
    includes: string[]; excludes: string[];
  };
  analysis: {
    possibleExplanations: string[]; questionsToInvestigate: string[];
    sourceItemsToReview: string[]; potentialNextSteps: string[];
    locked: { controlAmountCents: number | null; supportingAmountCents: number | null;
      differenceCents: number | null; status: string };
    source: string; model: string;
  };
};

export default function ReconDetail({ initial }: { initial: Bundle }) {
  const [bundle, setBundle] = useState(initial);
  const [note, setNote] = useState("Reviewed supporting schedule and accepted timing difference.");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const r = bundle.reconciliation;
  const latest = bundle.runs[0];

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setError("");
    startTransition(async () => {
      const res = await fetch(`/api/reconciliations/${r.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Action failed."); return; }
      if (data.bundle) setBundle(data.bundle);
      else if (action === "rerun" && data.reconciliationId) {
        const g = await fetch(`/api/reconciliations/${data.reconciliationId}`);
        const full = await g.json();
        if (full.ok) setBundle(full);
      }
    });
  }

  return (
    <div>
      <p className="caption" style={{ marginBottom: 12 }}>
        <Link href={`/reconciliations?client=${r.clientId}&period=${r.periodId}`}
          style={{ color: "var(--ink-soft)" }}>
          ← Reconciliations
        </Link>
      </p>
      <h1 className="display-l" style={{ margin: 0 }}>{bundle.definition.label}</h1>
      <p className="section-q" style={{ marginTop: 8 }}>
        {r.status.replace(/_/g, " ")} · {r.readiness.replace(/_/g, " ")}
        {" · "}tolerance {formatCents(r.toleranceCents)} ({r.toleranceSource.replace(/_/g, " ")})
      </p>

      <div className="flex gap-2 flex-wrap" style={{ margin: "20px 0 28px" }}>
        <button type="button" className="btn" disabled={pending} onClick={() => act("rerun")}>
          Re-run
        </button>
        <button type="button" className="chip" disabled={pending} onClick={() => act("analyze")}>
          Generate investigation draft
        </button>
      </div>
      {error && <p className="caption" role="alert" style={{ color: "var(--accent-deep)" }}>{error}</p>}

      <section style={{ marginBottom: 32 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Side-by-side</div>
        <div className="grid sm:grid-cols-3 gap-6" style={{ maxWidth: 900 }}>
          <div>
            <div className="eyebrow">Control</div>
            <div className="tnum" style={{ fontFamily: "var(--display)", fontSize: 28, marginTop: 6 }}>
              {formatCents(r.controlAmountCents)}
            </div>
            <p className="caption" style={{ marginTop: 8 }}>{bundle.definition.controlDescription}</p>
          </div>
          <div>
            <div className="eyebrow">Supporting</div>
            <div className="tnum" style={{ fontFamily: "var(--display)", fontSize: 28, marginTop: 6 }}>
              {formatCents(r.supportingAmountCents)}
            </div>
            <p className="caption" style={{ marginTop: 8 }}>{bundle.definition.supportingDescription}</p>
          </div>
          <div>
            <div className="eyebrow">Difference</div>
            <div className="tnum" style={{ fontFamily: "var(--display)", fontSize: 28, marginTop: 6 }}>
              {formatCents(r.absoluteDifferenceCents)}
            </div>
            <p className="caption" style={{ marginTop: 8 }}>
              Supporting − control = {formatCents(r.differenceCents)}
            </p>
          </div>
        </div>
      </section>

      {latest && (
        <section style={{ marginBottom: 32, paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Components</div>
          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <p className="caption" style={{ marginBottom: 8 }}><strong>Control</strong></p>
              <ul className="caption">
                {(latest.controlSnapshot?.components || []).map((c: any) => (
                  <li key={c.label}>{c.label}: {formatCents(c.amountCents)}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="caption" style={{ marginBottom: 8 }}><strong>Supporting</strong></p>
              <ul className="caption">
                {(latest.supportingSnapshot?.components || []).map((c: any) => (
                  <li key={c.label}>{c.label}: {formatCents(c.amountCents)}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      <section style={{ marginBottom: 32, paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Issues</div>
        {r.issues.length ? (
          <ul className="caption">{r.issues.map((i) => <li key={i}>{i}</li>)}</ul>
        ) : (
          <p className="caption">No blocking issues on the latest run.</p>
        )}
        <p className="caption" style={{ marginTop: 12 }}>
          Includes: {bundle.definition.includes.join("; ")}.
          {" "}Excludes: {bundle.definition.excludes.join("; ")}.
        </p>
      </section>

      <section style={{ marginBottom: 32, paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Exceptions</div>
        {!bundle.exceptions.length ? (
          <p className="caption">No exceptions recorded for this reconciliation.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {bundle.exceptions.map((ex) => (
              <li key={ex.id} style={{ padding: "12px 0", borderTop: "1px solid var(--hairline)" }}>
                <div className="caption">
                  <strong style={{ fontWeight: 600 }}>{ex.severity}</strong> · {ex.type.replace(/_/g, " ")} · {ex.status}
                </div>
                <p style={{ fontFamily: "var(--editorial)", fontSize: 16, margin: "6px 0" }}>{ex.title}</p>
                <p className="caption">{ex.description}</p>
                {ex.status !== "RESOLVED" && (
                  <div className="flex gap-2 flex-wrap" style={{ marginTop: 10 }}>
                    <input className="input" style={{ minWidth: 280 }} value={note}
                      onChange={(e) => setNote(e.target.value)} />
                    <button type="button" className="chip" disabled={pending}
                      onClick={() => act("resolve", {
                        exceptionId: ex.id,
                        resolutionNote: note,
                        resolutionCategory: "TIMING_DIFFERENCE",
                      })}>
                      Resolve
                    </button>
                    <button type="button" className="chip" disabled={pending}
                      onClick={() => act("resolve", {
                        exceptionId: ex.id,
                        resolutionNote: note,
                        resolutionCategory: "IMMATERIAL_ACCEPTED",
                        acceptDifference: true,
                      })}>
                      Accept difference
                    </button>
                  </div>
                )}
                {ex.resolutionNote && (
                  <p className="caption" style={{ marginTop: 8 }}>Resolution: {ex.resolutionNote}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginBottom: 32, paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Investigation draft</div>
        <p className="caption" style={{ marginBottom: 10 }}>
          Model {bundle.analysis.model} · locked status {bundle.analysis.locked.status}
          {" · "}diff {formatCents(bundle.analysis.locked.differenceCents)}
        </p>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Possible explanations</div>
        <ul className="caption" style={{ marginBottom: 14 }}>
          {bundle.analysis.possibleExplanations.map((x) => <li key={x}>{x}</li>)}
        </ul>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Questions to investigate</div>
        <ul className="caption" style={{ marginBottom: 14 }}>
          {bundle.analysis.questionsToInvestigate.map((x) => <li key={x}>{x}</li>)}
        </ul>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Next steps</div>
        <ul className="caption">
          {bundle.analysis.potentialNextSteps.map((x) => <li key={x}>{x}</li>)}
        </ul>
      </section>

      <section style={{ paddingTop: 24, borderTop: "1px solid var(--hairline)" }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Run history</div>
        <ul className="caption">
          {bundle.runs.map((run) => (
            <li key={run.id}>
              {run.createdAt} · {run.status} · Δ {formatCents(run.differenceCents)} · {run.engineVersion}
            </li>
          ))}
        </ul>
        <p className="caption" style={{ marginTop: 12 }}>
          Review: {r.reviewedBy ? `${r.reviewedBy.slice(0, 8)}… at ${r.reviewedAt}` : "Not finalized."}
          {" "}Historical runs are preserved when sources change.
        </p>
      </section>
    </div>
  );
}
