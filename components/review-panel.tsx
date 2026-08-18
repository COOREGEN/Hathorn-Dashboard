"use client";
/**
 * The advisor's call-prep cockpit: gate status, story editing, lock for the call,
 * amendments, and version history.
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BrandMark from "@/components/brand-mark";

type Note = { id: string; slot: string; tone: string; heading: string; body: string };
type Gate = { pass: boolean; checks: { name: string; pass: boolean; detail: string }[] };
type ReleaseVersion = {
  id: string; version: number; publishedAt: string; status: string;
  amendmentReason: string; revokedReason: string;
};
type EvalPreview = {
  canPublish: boolean;
  blockers: { message: string }[];
  warnings: { message: string }[];
  nextVersion: number;
};

export default function ReviewPanel({
  periodId, clientName, status, gate, notes: initial, storyAgentEnabled,
  history = [], evaluation,
}: {
  periodId: string; clientName: string; status: string; gate: Gate; notes: Note[];
  storyAgentEnabled: boolean; history?: ReleaseVersion[]; evaluation?: EvalPreview | null;
}) {
  const [notes, setNotes] = useState(initial);
  const [drafting, setDrafting] = useState(false);
  const [draftMsg, setDraftMsg] = useState("");
  const [open, setOpen] = useState(true);
  const [showGate, setShowGate] = useState(!gate.pass);
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blockers, setBlockers] = useState<string[]>(
    evaluation && !evaluation.canPublish
      ? evaluation.blockers.map((b) => b.message)
      : [],
  );
  const [publishMsg, setPublishMsg] = useState("");
  const [saved, setSaved] = useState("");
  const [dialog, setDialog] = useState<null | "amend" | "withdraw" | "draft">(null);
  const [reasonDraft, setReasonDraft] = useState("");
  const router = useRouter();

  async function saveNote(n: Note) {
    setSaved("");
    const res = await fetch("/api/notes", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(n),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setBlockers([data.error || "Could not save note."]);
      return;
    }
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
    if (!res.ok) { setBlockers([n.error || "Could not add note."]); return; }
    setNotes([...notes, n]);
    router.refresh();
  }

  async function removeNote(id: string) {
    const res = await fetch("/api/notes", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setBlockers([data.error || "Could not remove note."]);
      return;
    }
    setNotes(notes.filter((n) => n.id !== id));
    router.refresh();
  }

  async function approve() {
    setBusy(true); setBlockers([]); setPublishMsg("");
    const res = await fetch("/api/approve", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ periodId }),
    });
    const data = await res.json().catch(() => ({ ok: res.ok }));
    setBusy(false);

    if (!res.ok || !data.ok) {
      setBlockers(data.blockers?.length
        ? data.blockers.map((b: any) => b.message)
        : [data.error || "This period could not be locked."]);
      return;
    }
    setPublishMsg(
      `Published as version ${data.version ?? 1}. The client can see it in their portal. Changing it means an amendment.`);
    setTimeout(() => router.push("/today"), 1400);
  }

  async function amend(reason: string) {
    if (!reason.trim()) return;
    setBusy(true); setBlockers([]); setDialog(null);
    const res = await fetch("/api/approve", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodId, action: "amend", reason }),
    });
    const data = await res.json().catch(() => ({ ok: false }));
    setBusy(false);
    if (!data.ok) { setBlockers([data.error || "Could not open an amendment."]); return; }
    setPublishMsg("Amendment open. Correct the figures and story, then lock again to issue a new version.");
    router.refresh();
  }

  async function draftStory(confirmed = false) {
    const hasWork = notes.some((n) => n.body && !n.heading.startsWith("Draft —"));
    if (hasWork && !confirmed) {
      setDialog("draft");
      return;
    }
    setDialog(null);
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
      `Drafted ${data.count} notes${data.source === "claude" ? "" : " from threshold signals"}. Edit before locking for the call.`,
    );
    router.refresh();
  }

  async function withdraw(reason: string) {
    if (!reason.trim()) return;
    setDialog(null);
    setBusy(true);
    const res = await fetch("/api/admin/unpublish", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodId, reason }),
    });
    const data = await res.json().catch(() => ({ ok: false }));
    setBusy(false);
    if (!data.ok) { setBlockers([data.error || "Could not withdraw."]); return; }
    router.refresh();
  }

  useEffect(() => { setNotes(initial); }, [initial]);

  const slotNotes = (slot: string) => notes.filter((n) => n.slot === slot);
  const warnings = evaluation?.warnings?.map((w) => w.message) ?? [];

  return (
    <div className="no-print" style={{ position: "sticky", top: 0, zIndex: 40, background: "var(--ink)", borderBottom: "1px solid var(--hairline-dark)" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "14px 28px" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <BrandMark href="/" tone="ink" size="sm" sub={`Call prep · ${clientName}`} />
            <div style={{ height: 8 }} />
            <div style={{ fontFamily: "var(--display)", fontSize: 19, color: "var(--paper)", marginTop: 2 }}>
              {status === "PUBLISHED"
                ? "Published — live in the client portal"
                : history.some((h) => h.status === "ACTIVE")
                  ? "Amendment open — prior version still live in the portal"
                  : "Draft — not visible to the client"}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button className="tag" style={{ background: "transparent", color: gate.pass ? "#7FC29B" : "#E08B6B", cursor: "pointer", padding: "5px 11px" }}
              onClick={() => setShowGate(!showGate)}>
              Gate: {gate.pass ? "ALL TIES PASS" : "FAILING"} · {gate.checks.filter((c) => c.pass).length}/{gate.checks.length}
            </button>
            {history.length > 0 && (
              <button className="tag" style={{ background: "transparent", color: "#A8A196", cursor: "pointer", padding: "5px 11px" }}
                onClick={() => setShowHistory(!showHistory)}>
                Versions · {history.length}
              </button>
            )}
            <button className="tag" style={{ background: "transparent", color: "#A8A196", cursor: "pointer", padding: "5px 11px" }} onClick={() => setOpen(!open)}>
              {open ? "Hide story editor" : "Edit story"}
            </button>
            {status !== "PUBLISHED" && (
              <button className="tag" style={{ background: "transparent", color: "var(--gold)", cursor: "pointer", padding: "5px 11px" }}
                disabled={drafting} onClick={() => draftStory()}
                title={storyAgentEnabled
                  ? "Draft commentary for the advisory call"
                  : "No API key set — will draft from threshold signals"}>
                {drafting ? "Drafting…" : "Draft the story"}
              </button>
            )}
            <button className="tag" style={{ background: "transparent", color: "#A8A196", cursor: "pointer", padding: "5px 11px" }} onClick={() => window.print()}>
              Print
            </button>
            {status === "PUBLISHED" && (
              <>
                <button className="tag" style={{ background: "transparent", color: "#E08B6B", cursor: "pointer", padding: "5px 11px" }}
                  onClick={() => { setReasonDraft(""); setDialog("amend"); }}>
                  Amend
                </button>
                <button className="tag" style={{ background: "transparent", color: "#E08B6B", cursor: "pointer", padding: "5px 11px" }}
                  disabled={busy} onClick={() => { setReasonDraft(""); setDialog("withdraw"); }}>
                  Withdraw
                </button>
              </>
            )}
            {status !== "PUBLISHED" && (
              <button className="btn" style={{ padding: "9px 18px" }}
                disabled={!gate.pass || busy || (evaluation ? !evaluation.canPublish : false)} onClick={approve}>
                {busy ? "Publishing…" : `Publish to portal${evaluation?.nextVersion ? ` · v${evaluation.nextVersion}` : ""}`}
              </button>
            )}
          </div>
        </div>

        {warnings.length > 0 && status !== "PUBLISHED" && (
          <div className="caption" style={{ marginTop: 10, padding: "10px 13px",
            border: "1px solid var(--hairline-dark)", color: "var(--gold-label)" }}>
            <strong style={{ display: "block", marginBottom: 5 }}>Before you lock</strong>
            {warnings.map((w, i) => <div key={i} style={{ marginTop: 4 }}>— {w}</div>)}
          </div>
        )}

        {blockers.length > 0 && (
          <div className="caption" style={{ marginTop: 10, padding: "10px 13px",
            border: "1px solid #7A3A1C", color: "#E08B6B" }}>
            <strong style={{ display: "block", marginBottom: 5 }}>
              This period cannot be locked yet
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

        {dialog && (
          <div className="mt-3" style={{ border: "1px solid var(--hairline-dark)", padding: "12px 14px", background: "rgba(0,0,0,0.25)" }}>
            {dialog === "draft" && (
              <>
                <div className="caption" style={{ color: "#C9C2B6", marginBottom: 10 }}>
                  Replace the current commentary with a fresh draft?
                </div>
                <div className="flex gap-2">
                  <button className="tag" style={{ cursor: "pointer", color: "var(--gold)" }}
                    disabled={drafting} onClick={() => draftStory(true)}>
                    Replace draft
                  </button>
                  <button className="tag" style={{ cursor: "pointer", color: "#A8A196" }}
                    onClick={() => setDialog(null)}>
                    Cancel
                  </button>
                </div>
              </>
            )}
            {(dialog === "amend" || dialog === "withdraw") && (
              <>
                <div className="caption" style={{ color: "#C9C2B6", marginBottom: 8 }}>
                  {dialog === "amend"
                    ? "Why is this month being amended? The reason travels with the new version."
                    : "Why withdraw this locked statement? The month returns to draft for call prep."}
                </div>
                <textarea
                  value={reasonDraft}
                  onChange={(e) => setReasonDraft(e.target.value)}
                  rows={2}
                  style={{
                    width: "100%", fontFamily: "var(--editorial)", fontSize: 13,
                    background: "transparent", border: "1px solid var(--hairline-dark)",
                    padding: "7px 9px", color: "#DCD6CB", marginBottom: 10,
                  }}
                  placeholder="Required reason"
                />
                <div className="flex gap-2">
                  <button className="tag" style={{ cursor: "pointer", color: "#E08B6B" }}
                    disabled={busy || reasonDraft.trim().length < 3}
                    onClick={() => dialog === "amend" ? amend(reasonDraft) : withdraw(reasonDraft)}>
                    {dialog === "amend" ? "Open amendment" : "Withdraw lock"}
                  </button>
                  <button className="tag" style={{ cursor: "pointer", color: "#A8A196" }}
                    onClick={() => setDialog(null)}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {showHistory && history.length > 0 && (
          <div className="mt-3" style={{ border: "1px solid var(--hairline-dark)", padding: "10px 12px" }}>
            <div className="wordmark-sub" style={{ marginBottom: 8 }}>Version history</div>
            {history.map((h) => (
              <div key={h.id} className="caption" style={{ color: "#C9C2B6", marginBottom: 6 }}>
                v{h.version} · {h.status} · {h.publishedAt?.slice(0, 16) || "—"}
                {h.amendmentReason ? ` · ${h.amendmentReason}` : ""}
                {h.revokedReason ? ` · withdrawn: ${h.revokedReason}` : ""}
              </div>
            ))}
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
                    {slot === "WHAT_CHANGED" ? "The story for the call" : "Commitments to leave with"}
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
                        {/* A destructive control needs a hit area you can aim at:
                            on a phone this was 8px wide next to the heading field. */}
                        <button
                          aria-label="Remove note"
                          title="Remove note"
                          style={{
                            flex: "0 0 auto", width: 34, minHeight: 30,
                            display: "grid", placeItems: "center",
                            fontFamily: "var(--utility)", fontSize: 12, color: "#8C857A",
                            border: "1px solid var(--hairline-dark)", background: "transparent",
                            cursor: "pointer",
                          }}
                          onClick={() => removeNote(n.id)}
                        >✕</button>
                      </div>
                      {/* The commentary is the product; a two-line window onto a
                          four-line note is a poor place to write it on a phone. */}
                      <textarea value={n.body} rows={3}
                        onChange={(e) => setNotes(notes.map((x) => x.id === n.id ? { ...x, body: e.target.value } : x))}
                        style={{ width: "100%", minHeight: 92, fontFamily: "var(--editorial)", fontSize: 13, lineHeight: 1.55, background: "transparent", border: "1px solid var(--hairline-dark)", padding: "7px 9px", color: "#DCD6CB" }} />
                      <button style={{ fontFamily: "var(--utility)", fontSize: 10, fontWeight: 600, marginTop: 6, padding: "7px 2px", cursor: "pointer", color: saved === n.id ? "#7FC29B" : "var(--gold-label)" }}
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
