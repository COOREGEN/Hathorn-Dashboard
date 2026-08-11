"use client";

import { useEffect, useState, useTransition } from "react";

type Citation = {
  sourceType: string;
  sourceId?: string;
  title: string;
  period?: string;
  page?: number;
  section?: string;
};

type ToolTrace = { tool: string; ok: boolean; label: string; ms: number };

type Msg = {
  role: "user" | "assistant";
  content: string;
  sourceStatus?: string;
  citations?: Citation[];
  toolsUsed?: ToolTrace[];
  warnings?: string[];
  keyNumbers?: { label: string; value: string; detail?: string }[];
  messageId?: string;
};

const STATUS_LABEL: Record<string, string> = {
  SUPPORTED_BY_SOURCE_DATA: "Supported by source data",
  PARTIALLY_SUPPORTED: "Partially supported",
  INSUFFICIENT_DATA: "Insufficient data",
  SOURCE_VERIFICATION_REQUIRED: "Source verification required",
  DRAFT_NOT_FINAL: "Draft — not finalized",
  UNAVAILABLE: "Unavailable",
};

export default function AskPanel({
  clientId,
  clientName,
  periodId,
  periodLabel,
  year,
  month,
}: {
  clientId?: string | null;
  clientName?: string | null;
  periodId?: string | null;
  periodLabel?: string | null;
  year?: number | null;
  month?: number | null;
}) {
  const [question, setQuestion] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<Citation[] | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const q = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
      const res = await fetch(`/api/copilot${q}`);
      const data = await res.json();
      if (!cancelled && data.ok) setSuggestions(data.suggestions || []);
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [clientId]);

  function ask(text: string) {
    const q = text.trim();
    if (!q || pending) return;
    setError(null);
    setMessages((m) => [...m, { role: "user", content: q }]);
    setQuestion("");
    startTransition(async () => {
      try {
        const res = await fetch("/api/copilot", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            question: q,
            conversationId,
            clientId: clientId || undefined,
            periodId: periodId || undefined,
            year: year || undefined,
            month: month || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok || data.ok === false) {
          setError(data.error || "Ask Hathorn could not complete that request.");
          return;
        }
        setConversationId(data.conversationId);
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: data.answer,
            sourceStatus: data.sourceStatus,
            citations: data.citations,
            toolsUsed: data.toolsUsed,
            warnings: data.warnings,
            keyNumbers: data.keyNumbers,
            messageId: data.messageId,
          },
        ]);
        if (data.citations?.length) setDrawer(data.citations);
      } catch {
        setError("The analysis could not be generated. Underlying data was not modified.");
      }
    });
  }

  async function feedback(messageId: string, helpful: boolean, reason?: string) {
    await fetch("/api/copilot/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messageId, helpful, reason }),
    }).catch(() => {});
  }

  return (
    <div className="ask-panel">
      <div>
        <p className="eyebrow" style={{ margin: 0 }}>Ask Hathorn</p>
        <h2 className="display-m" style={{ fontSize: 28, margin: "4px 0 10px" }}>
          {clientName ? `Ask about ${clientName}` : "What needs attention?"}
        </h2>
        {(clientName || periodLabel) && (
          <p style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 16px" }}>
            {clientName && <span className="ask-badge">{clientName}</span>}
            {periodLabel && <span className="ask-badge">{periodLabel}</span>}
          </p>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: 64 }} aria-live="polite">
        {messages.length === 0 && (
          <p className="prose" style={{ margin: 0, color: "var(--ink-mute)" }}>
            Hathorn tools answer first. The model only explains grounded results — never invents books.
          </p>
        )}
        {messages.map((m, i) => (
          <article key={i}>
            <pre className="ask-msg-body">{m.content}</pre>
            {m.role === "assistant" && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
                {m.sourceStatus && (
                  <span className="eyebrow" style={{ margin: 0 }}>
                    {STATUS_LABEL[m.sourceStatus] || m.sourceStatus}
                  </span>
                )}
                {!!m.toolsUsed?.length && (
                  <span className="prepared-by">
                    Checked: {Array.from(new Set(m.toolsUsed.map((t) => t.label))).join(" · ")}
                  </span>
                )}
                {!!m.keyNumbers?.length && (
                  <ul className="ask-numbers">
                    {m.keyNumbers.map((k) => (
                      <li key={k.label}>
                        <span>{k.label}</span>
                        <strong style={{ fontVariantNumeric: "tabular-nums lining-nums" }}>{k.value}</strong>
                      </li>
                    ))}
                  </ul>
                )}
                {!!m.warnings?.length && (
                  <ul className="ask-warnings">
                    {m.warnings.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                )}
                {!!m.citations?.length && (
                  <button type="button" className="chip" onClick={() => setDrawer(m.citations || [])}>
                    Sources ({m.citations.length})
                  </button>
                )}
                {m.messageId && (
                  <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <button type="button" className="chip" onClick={() => feedback(m.messageId!, true)}>Helpful</button>
                    <button type="button" className="chip" onClick={() => feedback(m.messageId!, false, "unclear")}>Not helpful</button>
                    <button type="button" className="chip" onClick={() => feedback(m.messageId!, false, "incorrect_number")}>Incorrect number</button>
                  </span>
                )}
              </div>
            )}
          </article>
        ))}
      </div>

      {!!suggestions.length && messages.length === 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "16px 0" }}>
          {suggestions.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => ask(s)} disabled={pending}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); ask(question); }}
        style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "end", marginTop: 16 }}
      >
        <label className="sr-only" htmlFor="ask-hathorn-input">Question</label>
        <textarea
          id="ask-hathorn-input"
          className="ask-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder={clientName ? "Why did revenue change?" : "Which July closes are blocked?"}
          disabled={pending}
        />
        <button type="submit" className="btn" disabled={pending || !question.trim()}>
          {pending ? "Checking…" : "Ask"}
        </button>
      </form>
      {error && <p style={{ color: "#8a2b2b", fontFamily: "var(--utility)", fontSize: 13 }}>{error}</p>}

      {drawer && (
        <aside style={{ marginTop: 16, borderTop: "1px solid var(--hairline)", paddingTop: 12 }} aria-label="Sources">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 className="eyebrow" style={{ margin: 0 }}>Sources</h3>
            <button type="button" className="chip" onClick={() => setDrawer(null)}>Close</button>
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
            {drawer.map((c, i) => (
              <li key={`${c.sourceType}-${c.sourceId || c.title}-${i}`} className="ask-source-row">
                <span className="eyebrow" style={{ margin: 0 }}>{c.sourceType.replace(/_/g, " ")}</span>
                <strong>{c.title}</strong>
                <span className="prepared-by">
                  {[c.period, c.page != null ? `Page ${c.page}` : "", c.section].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
