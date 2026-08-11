"use client";
import { useState } from "react";

type Comment = { id: string; user_name: string; user_role: string; body: string; created_at: string };

export default function CommentThread({ periodId, metricSlot, initialComments, userRole }:
  { periodId: string; metricSlot: string; initialComments: Comment[]; userRole: string }) {
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState("");
  const [open, setOpen] = useState(comments.length > 0);
  const [posting, setPosting] = useState(false);

  const [error, setError] = useState("");

  async function post() {
    if (!body.trim()) return;
    setPosting(true); setError("");
    const res = await fetch("/api/comments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodId, metricSlot, body }),
    });
    const data = await res.json().catch(() => ({}));
    setPosting(false);
    if (!res.ok) {
      setError(data.error || "Could not post that comment.");
      return;
    }
    setComments([...comments, {
      id: data.id, user_name: "You", user_role: userRole, body, created_at: new Date().toISOString(),
    }]);
    setBody("");
  }

  const isAdvisor = ["ADMIN", "ADVISOR"].includes(userRole);
  const prompt = isAdvisor ? "Reply to client…" : "Ask your advisor a question…";

  return (
    <div >
      <button className="flex items-center gap-1.5"
        style={{ fontFamily: "var(--utility)", fontSize: 10, fontWeight: 600, letterSpacing: ".08em",
          textTransform: "uppercase", color: comments.length ? "var(--gold-deep)" : "var(--ink-mute)" }}
        onClick={() => setOpen(!open)}>
        {comments.length ? `${comments.length} comment${comments.length > 1 ? "s" : ""}` : "Ask a question"}
        <span className="text-[10px]">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ marginTop: 10, border: "1px solid var(--hairline)", background: "#FFFDF8" }}>
          {comments.map((c) => (
            <div key={c.id} style={{ padding: "12px 14px", borderBottom: "1px solid var(--hairline)" }}>
              <div className="flex justify-between mb-1">
                <span style={{ fontFamily: "var(--utility)", fontSize: 11, fontWeight: 600 }}>{c.user_name}</span>
                <span className="eyebrow" style={{ fontSize: 8.5 }}>
                  {["ADMIN", "ADVISOR"].includes(c.user_role) ? "Hathorn Advisory" : "Client"}
                </span>
              </div>
              <div style={{ fontFamily: "var(--editorial)", fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-soft)" }}>{c.body}</div>
            </div>
          ))}
          {error && (
            <p className="caption" style={{ padding: "8px 14px 0", color: "var(--accent-deep)" }}>{error}</p>
          )}
          <div className="flex gap-2" style={{ padding: 10 }}>
            <input className="input" style={{ flex: 1 }} value={body} onChange={(e) => setBody(e.target.value)}
              placeholder={prompt} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && post()} />
            <button className="btn" style={{ padding: "9px 16px" }} disabled={posting || !body.trim()} onClick={post}>
              {posting ? "…" : "Send"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
