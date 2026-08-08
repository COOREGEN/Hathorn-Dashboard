"use client";
/**
 * The advisor's cockpit, docked above the dashboard preview:
 * gate status, inline story editing, and the Approve & Publish action.
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Note = { id: string; slot: string; tone: string; heading: string; body: string };
type Gate = { pass: boolean; checks: { name: string; pass: boolean; detail: string }[] };

export default function ReviewPanel({ periodId, clientName, status, gate, notes: initial, storyAgentEnabled }:
  { periodId: string; clientName: string; status: string; gate: Gate; notes: Note[]; storyAgentEnabled: boolean }) {
  const [notes, setNotes] = useState(initial);
  const [drafting, setDrafting] = useState(false);
  const [draftMsg, setDraftMsg] = useState("");
  const [open, setOpen] = useState(true);
  const [showGate, setShowGate] = useState(!gate.pass);
  const [busy, setBusy] = useState(false);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [publishMsg, setPublishMsg] = useState("");
  const [saved, setSaved] = useState("");
  const router = useRouter();

  async function saveNote(n: Note) {
    setSaved("");
    await fetch("/api/notes", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(n),
    });
    setSaved(n.id);
    setTimeout(() => setSaved(""), 1500);
    router.refresh();
  }

  async function addNote(slot: string) {
    const res = await fetch("/api/notes", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodId, slot }),
    });
    const n = await res.json();
    setNotes([...notes, n]);
    router.refresh();
  }

  async function removeNote(id: string) {
    await fetch("/api/notes", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    });
    setNotes(notes.filter((n) => n.id !== id));
    router.refresh();
  }

  /**
   * Publishing now goes through the release authority, which re-evaluates inside the
   * transaction and can refuse with named blockers. The previous handler only acted on
   * success — a refused publish did nothing at all, so the button read as broken when it
   * was in fact working correctly and had something to say.
   */
  async function approve() {
    setBusy(true); setBlockers([]); setPublishMsg("");
    const res = await fetch("/api/approve", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ periodId }),
    });
    const data = await res.json().catch(() => ({ ok: res.ok }));
    setBusy(false);

    if (!res.ok || !data.ok) {
      // Show every reason, not just the first — a publish usually fails for more than one.
      setBlockers(data.blockers?.length
        ? data.blockers.map((b: any) => b.message)
        : [data.error || "This period could not be published."]);
      return;
    }
    setPublishMsg(
      `Published as version ${data.version ?? 1}. The period is now locked — changing it means issuing an amendment.`);
    setTimeout(() => router.push("/portfolio"), 1400);
  }

  /** The only route back into a locked period. */
  async function amend() {
    const reason = prompt("Why is this month being amended? The reason travels with the new version.");
    if (!reason?.trim()) return;
    setBusy(true); setBlockers([]);
    const res = await fetch("/api/approve", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodId, action: "amend", reason }),
    });
    const data = await res.json().catch(() => ({ ok: false }));
    setBusy(false);
    if (!data.ok) { setBlockers([data.error || "Could not open an amendment."]); return; }
    setPublishMsg("Amendment open. Correct the figures, then publish again to issue a new version.");
    router.refresh();
  }

  /** Asks the agent for a first draft. Replaces existing notes only after confirmation. */
  async function draftStory() {
    const hasWork = notes.some((n) => n.body && !n.heading.startsWith("Draft —"));
    if (hasWork && !confirm("Replace the current commentary with a fresh draft?")) return;
    setDrafting(true); setDraftMsg("");
    const res = await fetch("/api/story/draft", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodId, replace: true }),
    });
    const data = await res.json();
    setDrafting(false);
    if (!data.ok) { setDraftMsg(data.error || "Draft failed."); return; }
    setDraftMsg(
      data.warning ||
      `Drafted ${data.count} notes${data.source === "claude" ? "" : " from threshold signals"}. Edit before publishing.`,
    );
    router.refresh();
  }

  async function unpublish() {
    if (!confirm("Unpublish this period? The client will lose access until it's re-approved.")) return;
    await fetch("/api/admin/unpublish", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ periodId }),
    });
    router.refresh();
  }

  // Server-refreshed notes (e.g. after a draft) must replace local state.
  useEffect(() => { setNotes(initial); }, [initial]);

  const slotNotes = (slot: string) => notes.filter((n) => n.slot === slot);

  return (
    <div className="no-print" style={{ position: "sticky", top: 0, zIndex: 40, background: "var(--ink)", borderBottom: "1px solid var(--hairline-dark)" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "14px 28px" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="wordmark-sub">Review · {clientName}</div>
            <div style={{ fontFamily: "var(--display)", fontSize: 19, color: "var(--paper)", marginTop: 2 }}>
              {status === "PUBLISHED" ? "Published" : "Draft — not visible to the client"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="tag" style={{ background: "transparent", color: gate.pass ? "#7FC29B" : "#E08B6B", cursor: "pointer", padding: "5px 11px" }}
              onClick={() => setShowGate(!showGate)}>
              Gate: {gate.pass ? "ALL TIES PASS" : "FAILING"} · {gate.checks.filter((c) => c.pass).length}/{gate.checks.length}
            </button>
            <button className="tag" style={{ background: "transparent", color: "#A8A196", cursor: "pointer", padding: "5px 11px" }} onClick={() => setOpen(!open)}>
              {open ? "Hide story editor" : "Edit story"}
            </button>
            {status !== "PUBLISHED" && (
              <button className="tag" style={{ background: "transparent", color: "var(--gold)", cursor: "pointer", padding: "5px 11px" }}
                disabled={drafting} onClick={draftStory}
                title={storyAgentEnabled
                  ? "Draft commentary from this month's numbers"
                  : "No API key set — will draft from threshold signals"}>
                {drafting ? "Drafting…" : "Draft the story"}
              </button>
            )}
            <button className="tag" style={{ background: "transparent", color: "#A8A196", cursor: "pointer", padding: "5px 11px" }} onClick={() => window.print()}>
              PDF ↓
            </button>
            {status === "PUBLISHED" && (
              <button className="tag" style={{ background: "transparent", color: "#E08B6B", cursor: "pointer", padding: "5px 11px" }} onClick={amend}>
                Amend
              </button>
            )}
            {status !== "PUBLISHED" && (
              <button className="btn" style={{ padding: "9px 18px" }}
                disabled={!gate.pass || busy} onClick={approve}>
                {busy ? "Publishing…" : "Approve & Publish"}
              </button>
            )}
          </div>
        </div>

        {blockers.length > 0 && (
          <div className="caption" style={{ marginTop: 10, padding: "10px 13px",
            border: "1px solid #7A3A1C", color: "#E08B6B" }}>
            <strong style={{ display: "block", marginBottom: 5 }}>
              This period cannot be published yet
            </strong>
            {blockers.map((b, i) => <div key={i} style={{ marginTop: 4 }}>— {b}</div>)}
          </div>
        )}

        {publishMsg && (
          <div className="caption" style={{ marginTop: 10, padding: "10px 13px",
            border: "1px solid var(--hairline-dark)", color: "#8FC7A8" }}>
            {publishMsg}
          </div>
        )}

        {draftMsg && (
          <div className="caption" style={{ marginTop: 10, padding: "9px 12px", border: "1px solid var(--hairline-dark)", color: "var(--gold-label)" }}>
            {draftMsg}
          </div>
        )}

        {showGate && (
          <div className="mt-3 grid sm:grid-cols-2 gap-1.5 pb-1">
            {gate.checks.map((c, i) => (
              <div key={i} className="flex gap-2" style={{ fontFamily: "var(--utility)", fontSize: 10.5, padding: "7px 10px", border: "1px solid var(--hairline-dark)", color: c.pass ? "#8A9B8F" : "#E08B6B" }}>
                <span className="font-bold">{c.pass ? "✓" : "✗"}</span>
                <span><b style={{ color: "#C9C2B6" }}>{c.name}</b> — {c.detail}</span>
              </div>
            ))}
          </div>
        )}

        {open && (
          <div className="mt-3 grid lg:grid-cols-2 gap-4 pb-2">
            {(["WHAT_CHANGED", "ACTION"] as const).map((slot) => (
              <div key={slot}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="wordmark-sub">
                    {slot === "WHAT_CHANGED" ? "What Changed" : "Actions"}
                  </span>
                  <button style={{ fontFamily: "var(--utility)", fontSize: 10, color: "#8C857A", cursor: "pointer" }} onClick={() => addNote(slot)}>
                    + Add note
                  </button>
                </div>
                <div className="space-y-2">
                  {slotNotes(slot).map((n) => (
                    <div key={n.id} style={{ padding: 11, border: "1px solid var(--hairline-dark)" }}>
                      <div className="flex gap-2 mb-1.5">
                        <select value={n.tone}
                          onChange={(e) => setNotes(notes.map((x) => x.id === n.id ? { ...x, tone: e.target.value } : x))}
                          style={{ fontFamily: "var(--utility)", fontSize: 10, padding: "4px 6px", background: "transparent", border: "1px solid var(--hairline-dark)", color: "#C9C2B6" }}>
                          <option value="info">info</option><option value="warn">warn</option><option value="bad">bad</option>
                        </select>
                        <input value={n.heading}
                          onChange={(e) => setNotes(notes.map((x) => x.id === n.id ? { ...x, heading: e.target.value } : x))}
                          style={{ flex: 1, fontFamily: "var(--utility)", fontSize: 11.5, fontWeight: 600, background: "transparent", border: "1px solid var(--hairline-dark)", padding: "5px 8px", color: "var(--paper)" }} placeholder="A number, a cause, an action…" />
                        <button style={{ fontFamily: "var(--utility)", fontSize: 10, color: "#8C857A", cursor: "pointer" }} onClick={() => removeNote(n.id)}>✕</button>
                      </div>
                      <textarea value={n.body} rows={2}
                        onChange={(e) => setNotes(notes.map((x) => x.id === n.id ? { ...x, body: e.target.value } : x))}
                        style={{ width: "100%", fontFamily: "var(--editorial)", fontSize: 13, lineHeight: 1.55, background: "transparent", border: "1px solid var(--hairline-dark)", padding: "7px 9px", color: "#DCD6CB" }} />
                      <button style={{ fontFamily: "var(--utility)", fontSize: 10, fontWeight: 600, marginTop: 6, cursor: "pointer", color: saved === n.id ? "#7FC29B" : "var(--gold-label)" }}
                        onClick={() => saveNote(notes.find((x) => x.id === n.id)!)}>
                        {saved === n.id ? "Saved ✓" : "Save note"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
