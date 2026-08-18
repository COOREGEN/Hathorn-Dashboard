"use client";

import { useState, useTransition } from "react";

type Question = {
  id: string;
  question: string;
  status: string;
  responseBody: string | null;
};

type Insight = {
  id: string;
  title: string;
  section: string;
  body: string;
  publishedAt: string | null;
};

export default function InsightsClient({
  insights,
  questions,
  canAnswer,
}: {
  insights: Insight[];
  questions: Question[];
  canAnswer: boolean;
}) {
  const [rows, setRows] = useState(questions);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function answer(questionId: string, body: string) {
    setError("");
    startTransition(async () => {
      const res = await fetch("/api/client-portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "answerQuestion", questionId, body }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Could not save your response.");
        return;
      }
      setRows((prev) => prev.map((q) => (q.id === questionId ? json.question : q)));
    });
  }

  return (
    <div>
      <section style={{ marginBottom: 40 }}>
        <h2 className="eyebrow">Insights</h2>
        {!insights.length && (
          <p className="prepared-by" style={{ marginTop: 10 }}>
            No published insights for this engagement yet.
          </p>
        )}
        <div style={{ display: "grid", gap: 20, marginTop: 14 }}>
          {insights.map((i) => (
            <article key={i.id} style={{ borderTop: "1px solid rgba(44,80,77,0.14)", paddingTop: 12 }}>
              <p className="eyebrow">{i.section}</p>
              <h3 className="display-m" style={{ fontSize: 24, margin: "4px 0 8px" }}>{i.title}</h3>
              <p className="prose" style={{ whiteSpace: "pre-wrap" }}>{i.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="eyebrow">Questions for management</h2>
        <p className="prepared-by" style={{ marginTop: 8 }}>
          {canAnswer
            ? "Your responses help your advisor prepare — they are not posted to the books automatically."
            : "Management questions are read-only on this portal. Your advisor can enable responses when needed."}
        </p>
        {error && <p style={{ color: "#8a2b2b", marginTop: 8 }}>{error}</p>}
        <div style={{ display: "grid", gap: 18, marginTop: 16 }}>
          {rows.map((q) => (
            <div key={q.id} style={{ borderTop: "1px solid rgba(44,80,77,0.14)", paddingTop: 12 }}>
              <p className="prose">{q.question}</p>
              {q.responseBody ? (
                <p className="prepared-by" style={{ marginTop: 8 }}>
                  Your response: {q.responseBody}
                </p>
              ) : canAnswer ? (
                <AnswerForm disabled={pending} onSubmit={(body) => answer(q.id, body)} />
              ) : (
                <p className="prepared-by" style={{ marginTop: 8 }}>
                  Responses are not enabled for this portal.
                </p>
              )}
            </div>
          ))}
          {!rows.length && (
            <p className="prepared-by">No open management questions right now.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function AnswerForm({ onSubmit, disabled }: { onSubmit: (body: string) => void; disabled: boolean }) {
  const [body, setBody] = useState("");
  return (
    <form
      style={{ marginTop: 10, display: "grid", gap: 8 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (body.trim()) onSubmit(body.trim());
      }}
    >
      <textarea
        className="ask-input"
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Your response"
        disabled={disabled}
      />
      <button type="submit" className="btn" disabled={disabled || body.trim().length < 2}>
        {disabled ? "Saving…" : "Send response"}
      </button>
    </form>
  );
}
