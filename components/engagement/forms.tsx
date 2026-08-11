"use client";
/**
 * Engagement capture forms.
 *
 * Deliberately plain and fast. These get filled in during or immediately after a call —
 * anything that takes more than a few seconds per item does not get used, and an
 * engagement record nobody fills in is worse than none, because it looks complete.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

function useAction(clientId: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (body: any, onDone?: () => void) => {
    setBusy(true); setError("");
    const res = await fetch("/api/engagement", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, ...body }),
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) { setError(data.error || "Something went wrong."); return false; }
    onDone?.(); router.refresh(); return true;
  };
  return { run, busy, error };
}

const Err = ({ error }: { error: string }) =>
  error ? <p className="caption" style={{ color: "var(--accent-text)", marginTop: 10 }}>{error}</p> : null;

/* ---------- Stage ---------- */

export function StageControl({ clientId, readyToAdvance, nextStage, nextLabel }: {
  clientId: string; readyToAdvance: boolean; nextStage: string | null; nextLabel: string;
}) {
  const { run, busy } = useAction(clientId);
  if (!nextStage) return null;
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button className="btn" disabled={busy} onClick={() => run({ action: "setStage", stage: nextStage })}>
        {busy ? "Moving…" : `Advance to ${nextLabel}`}
      </button>
      {!readyToAdvance && (
        <span className="caption">Not everything is done — advancing anyway is your call.</span>
      )}
    </div>
  );
}

/* ---------- Discovery ---------- */

export function FindingForm({ clientId }: { clientId: string }) {
  const { run, busy, error } = useAction(clientId);
  const [f, setF] = useState({ kind: "INEFFICIENCY", area: "", title: "", detail: "", severity: "medium" });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="card">
      <div className="card-t">Capture a finding</div>
      <div className="card-s">From the discovery call, while it is still fresh.</div>
      <div className="grid g3" style={{ gap: 12, marginTop: 14 }}>
        <div>
          <label className="field-label">Type</label>
          <select className="input" style={{ marginTop: 5 }} value={f.kind} onChange={set("kind")}>
            <option value="INEFFICIENCY">Inefficiency</option>
            <option value="GAP">Gap</option>
            <option value="RISK">Risk</option>
            <option value="OPPORTUNITY">Opportunity</option>
          </select>
        </div>
        <div>
          <label className="field-label">Area</label>
          <input className="input" style={{ marginTop: 5 }} value={f.area} onChange={set("area")}
            placeholder="bookkeeping, payroll, receivables…" />
        </div>
        <div>
          <label className="field-label">Severity</label>
          <select className="input" style={{ marginTop: 5 }} value={f.severity} onChange={set("severity")}>
            <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </select>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <label className="field-label">What you found</label>
        <input className="input" style={{ marginTop: 5 }} value={f.title} onChange={set("title")}
          placeholder="Payroll is entered by hand from three spreadsheets" />
      </div>
      <div style={{ marginTop: 12 }}>
        <label className="field-label">Detail</label>
        <textarea className="input" style={{ marginTop: 5, minHeight: 64, fontFamily: "var(--editorial)" }}
          value={f.detail} onChange={set("detail")} placeholder="Why it matters, what it costs, who said it" />
      </div>
      <Err error={error} />
      <button className="btn" style={{ marginTop: 14 }} disabled={busy || !f.title.trim()}
        onClick={() => run({ action: "addFinding", ...f },
          () => setF({ kind: f.kind, area: "", title: "", detail: "", severity: "medium" }))}>
        {busy ? "Saving…" : "Add finding"}
      </button>
    </div>
  );
}

export function ResolveFinding({ clientId, id }: { clientId: string; id: string }) {
  const { run, busy } = useAction(clientId);
  return (
    <button className="linkish" disabled={busy}
      onClick={() => run({ action: "resolveFinding", id, status: "ADDRESSED" })}>
      Mark addressed
    </button>
  );
}

/* ---------- Cleanup ---------- */

export function ScopeForm({ clientId }: { clientId: string }) {
  const { run, busy, error } = useAction(clientId);
  const [f, setF] = useState({ from: "", to: "", sourceSystem: "", note: "" });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="card">
      <div className="card-t">Scope the historical audit</div>
      <div className="card-s">Which periods are being reviewed, and from which system.</div>
      <div className="grid g3" style={{ gap: 12, marginTop: 14 }}>
        <div><label className="field-label">From</label>
          <input className="input" style={{ marginTop: 5 }} value={f.from} onChange={set("from")} placeholder="Jan 2025" /></div>
        <div><label className="field-label">To</label>
          <input className="input" style={{ marginTop: 5 }} value={f.to} onChange={set("to")} placeholder="Dec 2025" /></div>
        <div><label className="field-label">Source system</label>
          <input className="input" style={{ marginTop: 5 }} value={f.sourceSystem} onChange={set("sourceSystem")}
            placeholder="QuickBooks Online" /></div>
      </div>
      <Err error={error} />
      <button className="btn" style={{ marginTop: 14 }} disabled={busy || !f.from || !f.to}
        onClick={() => run({ action: "addScope", ...f }, () => setF({ from: "", to: "", sourceSystem: "", note: "" }))}>
        {busy ? "Saving…" : "Add scope"}
      </button>
    </div>
  );
}

export function ScopeStatus({ clientId, id, status }: { clientId: string; id: string; status: string }) {
  const { run, busy } = useAction(clientId);
  const next = status === "NOT_STARTED" ? "IN_PROGRESS" : status === "IN_PROGRESS" ? "COMPLETE" : null;
  if (!next) return <span className="caption" style={{ color: "var(--brand-text)" }}>Complete</span>;
  return (
    <button className="linkish" disabled={busy} onClick={() => run({ action: "setScopeStatus", id, status: next })}>
      {next === "IN_PROGRESS" ? "Start" : "Mark complete"}
    </button>
  );
}

export function CleanupForm({ clientId }: { clientId: string }) {
  const { run, busy, error } = useAction(clientId);
  const [f, setF] = useState({ category: "UNRECONCILED", title: "", detail: "", amount: "", periods: "" });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="card">
      <div className="card-t">Record what the audit found</div>
      <div className="card-s">Nothing downstream is trustworthy until these close.</div>
      <div className="grid g3" style={{ gap: 12, marginTop: 14 }}>
        <div><label className="field-label">Category</label>
          <select className="input" style={{ marginTop: 5 }} value={f.category} onChange={set("category")}>
            <option value="UNRECONCILED">Unreconciled</option>
            <option value="MISCLASSIFIED">Misclassified</option>
            <option value="MISSING">Missing</option>
            <option value="DUPLICATE">Duplicate</option>
            <option value="UNSUPPORTED">Unsupported</option>
          </select></div>
        <div><label className="field-label">Amount ($K)</label>
          <input className="input" style={{ marginTop: 5 }} value={f.amount} onChange={set("amount")} placeholder="12.4" /></div>
        <div><label className="field-label">Periods affected</label>
          <input className="input" style={{ marginTop: 5 }} value={f.periods} onChange={set("periods")} placeholder="Mar–Jun 2025" /></div>
      </div>
      <div style={{ marginTop: 12 }}>
        <label className="field-label">What is wrong</label>
        <input className="input" style={{ marginTop: 5 }} value={f.title} onChange={set("title")}
          placeholder="Owner draws posted to contract labor" />
      </div>
      <Err error={error} />
      <button className="btn" style={{ marginTop: 14 }} disabled={busy || !f.title.trim()}
        onClick={() => run({ action: "addCleanupFinding", ...f },
          () => setF({ category: f.category, title: "", detail: "", amount: "", periods: "" }))}>
        {busy ? "Saving…" : "Add finding"}
      </button>
    </div>
  );
}

export function ResolveCleanup({ clientId, id }: { clientId: string; id: string }) {
  const { run, busy } = useAction(clientId);
  return (
    <span className="flex gap-3">
      <button className="linkish" disabled={busy}
        onClick={() => run({ action: "resolveCleanup", id, status: "FIXED" })}>Fixed</button>
      <button className="linkish muted" disabled={busy}
        onClick={() => run({ action: "resolveCleanup", id, status: "ACCEPTED" })}>Accept</button>
    </span>
  );
}

/* ---------- Alignment ---------- */

export function GoalForm({ clientId, kpis, findings }: {
  clientId: string; kpis: { key: string; label: string; unit: string }[]; findings: any[];
}) {
  const { run, busy, error } = useAction(clientId);
  const [f, setF] = useState({
    title: "", detail: "", horizon: "YEAR", targetDate: "", kpiKey: "",
    targetValue: "", targetLo: "", targetHi: "", fromFindingId: "",
  });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const chosen = kpis.find((k) => k.key === f.kpiKey);
  const isRange = chosen && (chosen.unit === "percent" || chosen.unit === "ratio");

  return (
    <div className="card">
      <div className="card-t">Agree a goal</div>
      <div className="card-s">
        Naming a metric here sets its target and records the basis as agreed with the client —
        which is what lets the dashboard say why the number is being watched.
      </div>

      <div style={{ marginTop: 14 }}>
        <label className="field-label">What the client wants</label>
        <input className="input" style={{ marginTop: 5 }} value={f.title} onChange={set("title")}
          placeholder="Get labor under control without losing caregivers" />
      </div>

      <div className="grid g3" style={{ gap: 12, marginTop: 12 }}>
        <div><label className="field-label">Horizon</label>
          <select className="input" style={{ marginTop: 5 }} value={f.horizon} onChange={set("horizon")}>
            <option value="QUARTER">This quarter</option>
            <option value="YEAR">This year</option>
            <option value="THREE_YEAR">Three years</option>
          </select></div>
        <div><label className="field-label">By when</label>
          <input className="input" style={{ marginTop: 5 }} value={f.targetDate} onChange={set("targetDate")}
            placeholder="Dec 2026" /></div>
        <div><label className="field-label">Measured by</label>
          <select className="input" style={{ marginTop: 5 }} value={f.kpiKey} onChange={set("kpiKey")}>
            <option value="">— not measured by a metric —</option>
            {kpis.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select></div>
      </div>

      {f.kpiKey && (
        <div className="grid g3" style={{ gap: 12, marginTop: 12 }}>
          {isRange ? (
            <>
              <div><label className="field-label">Target low</label>
                <input className="input" style={{ marginTop: 5 }} value={f.targetLo} onChange={set("targetLo")} placeholder="65" /></div>
              <div><label className="field-label">Target high</label>
                <input className="input" style={{ marginTop: 5 }} value={f.targetHi} onChange={set("targetHi")} placeholder="72" /></div>
            </>
          ) : (
            <div><label className="field-label">Target value</label>
              <input className="input" style={{ marginTop: 5 }} value={f.targetValue} onChange={set("targetValue")} placeholder="250" /></div>
          )}
        </div>
      )}

      {findings.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <label className="field-label">Came from a discovery finding</label>
          <select className="input" style={{ marginTop: 5 }} value={f.fromFindingId} onChange={set("fromFindingId")}>
            <option value="">— not linked —</option>
            {findings.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select>
        </div>
      )}

      <Err error={error} />
      <button className="btn" style={{ marginTop: 14 }} disabled={busy || !f.title.trim()}
        onClick={() => run({ action: "addGoal", ...f }, () =>
          setF({ title: "", detail: "", horizon: f.horizon, targetDate: "", kpiKey: "",
            targetValue: "", targetLo: "", targetHi: "", fromFindingId: "" }))}>
        {busy ? "Saving…" : "Agree this goal"}
      </button>
    </div>
  );
}

export function PainForm({ clientId, kpis }: { clientId: string; kpis: { key: string; label: string }[] }) {
  const { run, busy, error } = useAction(clientId);
  const [f, setF] = useState({ title: "", rootCause: "", kpiKey: "" });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="card">
      <div className="card-t">Record a pain point</div>
      <div className="card-s">
        The root cause in the client&apos;s own words — the thing an advisor forgets by month four.
      </div>
      <div style={{ marginTop: 14 }}>
        <label className="field-label">What hurts</label>
        <input className="input" style={{ marginTop: 5 }} value={f.title} onChange={set("title")}
          placeholder="Never knows if payroll will clear" />
      </div>
      <div style={{ marginTop: 12 }}>
        <label className="field-label">Why it happens</label>
        <textarea className="input" style={{ marginTop: 5, minHeight: 56, fontFamily: "var(--editorial)" }}
          value={f.rootCause} onChange={set("rootCause")}
          placeholder="Medicaid pays on a three-week lag and payroll runs fortnightly" />
      </div>
      <div style={{ marginTop: 12 }}>
        <label className="field-label">Measured by</label>
        <select className="input" style={{ marginTop: 5 }} value={f.kpiKey} onChange={set("kpiKey")}>
          <option value="">— not measured by a metric —</option>
          {kpis.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
      </div>
      <Err error={error} />
      <button className="btn" style={{ marginTop: 14 }} disabled={busy || !f.title.trim()}
        onClick={() => run({ action: "addPainPoint", ...f }, () => setF({ title: "", rootCause: "", kpiKey: "" }))}>
        {busy ? "Saving…" : "Add pain point"}
      </button>
    </div>
  );
}

/* ---------- Sessions ---------- */

export function SessionPlanner({ clientId, periodLabel, periodId }: {
  clientId: string; periodLabel: string; periodId: string;
}) {
  const { run, busy, error } = useAction(clientId);
  const [when, setWhen] = useState("");
  return (
    <div className="card">
      <div className="card-t">Plan the next session</div>
      <div className="card-s">
        The agenda drafts itself from the agreed goals, the pain points, and what was promised
        last month and has not happened.
      </div>
      <div className="flex gap-3 items-end flex-wrap" style={{ marginTop: 14 }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label className="field-label">Date</label>
          <input className="input" style={{ marginTop: 5 }} value={when} onChange={(e) => setWhen(e.target.value)}
            placeholder="12 Aug 2026, 10:00" />
        </div>
        <button className="btn" disabled={busy}
          onClick={() => run({ action: "planSession", periodId, periodLabel, scheduledFor: when }, () => setWhen(""))}>
          {busy ? "Drafting…" : "Draft the agenda"}
        </button>
      </div>
      <Err error={error} />
    </div>
  );
}

export function SessionRecorder({ clientId, id, existingNotes }: {
  clientId: string; id: string; existingNotes: string;
}) {
  const { run, busy, error } = useAction(clientId);
  const [notes, setNotes] = useState(existingNotes || "");
  const [open, setOpen] = useState(false);
  if (!open) return <button className="linkish" onClick={() => setOpen(true)}>Record what happened</button>;
  return (
    <div style={{ marginTop: 12 }}>
      <textarea className="input" style={{ minHeight: 140, fontFamily: "var(--editorial)", fontSize: 14 }}
        value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Err error={error} />
      <div className="flex gap-3" style={{ marginTop: 10 }}>
        <button className="btn" disabled={busy}
          onClick={() => run({ action: "recordSession", id, notes }, () => setOpen(false))}>
          {busy ? "Saving…" : "Mark held"}
        </button>
        <button className="btn btn-quiet" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
