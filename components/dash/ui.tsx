/**
 * Shared presentational pieces for the dashboard views.
 *
 * Server components — no interactivity, so no client bundle. Anything that needs
 * state lives in the shell.
 */
import { fmtK } from "@/lib/metrics";

export const money = (n: number) => {
  const s = n < 0 ? "−" : "", v = Math.abs(n);
  return v >= 1000 ? `${s}$${(v / 1000).toFixed(2)}M` : `${s}$${v.toFixed(1)}K`;
};
export const pct = (n: number) => `${n.toFixed(1)}%`;

export function Kpi({ label, value, sub, tone = "n", delta }: {
  label: string; value: string; sub: string;
  tone?: "n" | "ok" | "bad" | "warn";
  delta?: { up: boolean; text: string } | null;
}) {
  const col = tone === "ok" ? "var(--brand)" : tone === "bad" ? "var(--accent-deep)"
    : tone === "warn" ? "var(--accent-text)" : "var(--ink)";
  return (
    <div className="kpi">
      <div className="eyebrow">{label}</div>
      <div className="kpi-v tnum" style={{ color: col }}>{value}</div>
      {delta && (
        <div className="kpi-delta" style={{ color: delta.up ? "var(--brand-text)" : "var(--accent-text)" }}>
          {delta.up ? "▲" : "▼"} {delta.text}
        </div>
      )}
      <div className="kpi-s">{sub}</div>
    </div>
  );
}

export function Card({ title, sub, children }: { title?: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="card">
      {title && <div className="card-t">{title}</div>}
      {sub && <div className="card-s">{sub}</div>}
      <div style={{ marginTop: title ? 14 : 0 }}>{children}</div>
    </div>
  );
}

export function Sec({ title, question, children }: { title: string; question?: string; children: React.ReactNode }) {
  return (
    <div className="section-gap">
      <h2 className="sec">{title}</h2>
      {question && <p className="sec-q">{question}</p>}
      {children}
    </div>
  );
}

export function Note({ tone, heading, body, lead }: { tone: string; heading: string; body: string; lead?: boolean }) {
  return (
    <div className={`note note-${tone}${lead ? " note-lead" : ""}`}>
      <div className="note-h">{heading}</div>
      <div className="note-b">{body}</div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="empty"><h3>{title}</h3><p>{children}</p></div>;
}

/** Range metric against its healthy band. Both sides of the band are a problem. */
export function Bullet({ label, value, lo, hi }: { label: string; value: number; lo: number; hi: number }) {
  const scale = Math.max(hi * 1.4, value * 1.15, 100);
  const p = (v: number) => Math.min(100, (v / scale) * 100);
  const bad = value < lo || value > hi;
  const col = bad ? "var(--accent)" : "var(--brand)";
  return (
    <div className="bullet">
      <div className="bullet-h">
        <span>{label}</span>
        <span className="tnum" style={{ color: col }}>{value.toFixed(1)}%</span>
      </div>
      <div className="track">
        <div className="band" style={{ left: `${p(lo)}%`, width: `${p(hi) - p(lo)}%` }} />
        <div className="fill" style={{ width: `${p(value)}%`, background: col }} />
        <div className="mark" style={{ left: `${p(hi)}%` }} />
      </div>
    </div>
  );
}
