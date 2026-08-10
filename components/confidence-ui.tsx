"use client";
/**
 * Confidence and comparability, made visible.
 *
 * The design rule here: never let a weak figure look strong, and never let a figure
 * look weak by moving it. Confidence sits *beside* the numbers, not inside them.
 */
import { useState } from "react";
import type { ComparabilityResult, ComparabilityIssue } from "@/lib/comparability";
import type { Confidence } from "@/lib/confidence";

/* ── Persistent badge in the masthead ───────────────────────────────────── */

export function ConfidenceBadge({ confidence, onOpen }: {
  confidence?: Confidence; onOpen: () => void;
}) {
  if (!confidence) return null;
  const colour = confidence.band === "high" ? "#7FC29B"
    : confidence.band === "moderate" ? "var(--gold)" : "#E08B6B";

  return (
    <button onClick={onOpen} title={confidence.weakest ?? "Evidence is complete"}
      className="flex items-center gap-2"
      style={{ background: "transparent", border: "1px solid var(--hairline-dark)",
        padding: "6px 11px", cursor: "pointer" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: colour, display: "inline-block" }} />
      <span className="tnum" style={{ fontFamily: "var(--utility)", fontSize: 10.5,
        fontWeight: 600, letterSpacing: ".08em", color: "#C9C2B6" }}>
        {confidence.overall}% confidence
      </span>
    </button>
  );
}

/* ── Expandable breakdown ───────────────────────────────────────────────── */

export function ConfidencePanel({ confidence, open, onClose }: {
  confidence?: Confidence; open: boolean; onClose: () => void;
}) {
  if (!confidence || !open) return null;

  return (
    <div className="panel no-print" style={{ marginTop: 28 }}>
      <div className="flex justify-between items-start" style={{ marginBottom: 4 }}>
        <div>
          <div className="panel-title">How far to trust this statement</div>
          <div className="panel-sub">
            Confidence describes the evidence, not the performance. The figures are never
            adjusted — a weak month with strong books still reads weak.
          </div>
        </div>
        <button onClick={onClose} className="eyebrow"
          style={{ background: "transparent", border: 0, cursor: "pointer" }}>Close</button>
      </div>

      <div style={{ marginTop: 18 }}>
        {confidence.components.map((c) => {
          const colour = c.score >= 80 ? "var(--brand)" : c.score >= 55 ? "var(--gold-deep)" : "var(--accent-text)";
          return (
            <div key={c.name} style={{ borderTop: "1px solid var(--hairline)", padding: "12px 0" }}>
              <div className="flex justify-between items-baseline">
                <span style={{ fontFamily: "var(--utility)", fontSize: 12, fontWeight: 600 }}>{c.name}</span>
                <span className="tnum" style={{ fontFamily: "var(--utility)", fontSize: 12,
                  fontWeight: 600, color: colour }}>{c.score}</span>
              </div>
              <div style={{ position: "relative", height: 3, background: "#E8E2D4", marginTop: 7 }}>
                <div style={{ position: "absolute", inset: 0, width: `${c.score}%`, background: colour }} />
              </div>
              <p className="caption" style={{ marginTop: 6 }}>{c.detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Comparability notices ──────────────────────────────────────────────── */

function IssueRow({ issue }: { issue: ComparabilityIssue }) {
  const colour = issue.severity === "blocking" ? "var(--accent-deep)"
    : issue.severity === "warning" ? "var(--accent)" : "var(--ink-mute)";
  const heading = issue.severity === "blocking" ? "Not comparable"
    : issue.severity === "warning" ? "Read with care" : "Worth knowing";

  return (
    <div className="note" style={{ borderLeftColor: colour }}>
      <div className="note-head" style={{ color: colour }}>{heading}</div>
      <div className="note-body">
        {issue.message}
        {issue.guidance && (
          <span style={{ display: "block", marginTop: 6, color: "var(--ink-mute)", fontSize: 13.5 }}>
            {issue.guidance}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Shown above a comparison. A blocking issue means the table is absent, so this is the
 * only explanation the reader gets and it has to carry the whole message.
 */
export function ComparabilityNotice({ result, suppressed }: {
  result?: ComparabilityResult; suppressed?: boolean;
}) {
  if (!result || result.issues.length === 0) return null;

  const ordered = [...result.issues].sort((a, b) => {
    const rank = { blocking: 0, warning: 1, note: 2 };
    return rank[a.severity] - rank[b.severity];
  });

  return (
    <div style={{ marginBottom: suppressed ? 0 : 26, maxWidth: 700 }}>
      {suppressed && (
        <p className="prose" style={{ marginBottom: 14 }}>
          These two periods are not measured against each other, because the comparison
          would not mean what it appears to mean. The reason is below.
        </p>
      )}
      {ordered.map((issue, i) => <IssueRow key={i} issue={issue} />)}
    </div>
  );
}

/* ── Per-day view, for reading past a calendar difference ───────────────── */

export function PerDayStrip({ perDay, basisPerDay, basisLabel }: {
  perDay?: { days: number; revenuePerDay: number; hoursPerDay: number } | null;
  basisPerDay?: { days: number; revenuePerDay: number; hoursPerDay: number } | null;
  basisLabel?: string;
}) {
  if (!perDay) return null;
  const revDelta = basisPerDay && basisPerDay.revenuePerDay
    ? ((perDay.revenuePerDay - basisPerDay.revenuePerDay) / basisPerDay.revenuePerDay) * 100
    : null;

  return (
    <div className="panel" style={{ marginTop: 22 }}>
      <div className="panel-title">Per operating day</div>
      <div className="panel-sub">
        A short month earns less without anything going wrong. This is the check that
        separates the calendar from the business.
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4" style={{ marginTop: 16 }}>
        <div className="kpi">
          <div className="eyebrow">Days in period</div>
          <div className="kpi-value tnum" style={{ fontSize: 24 }}>{perDay.days}</div>
          {basisPerDay && <div className="kpi-sub">{basisPerDay.days} in {basisLabel}</div>}
        </div>
        <div className="kpi">
          <div className="eyebrow">Revenue per day</div>
          <div className="kpi-value tnum" style={{ fontSize: 24 }}>
            ${perDay.revenuePerDay.toFixed(1)}K
          </div>
          {revDelta !== null && (
            <div className="kpi-sub" style={{ color: revDelta >= 0 ? "var(--brand-text)" : "var(--accent-text)" }}>
              {revDelta >= 0 ? "▲" : "▼"} {Math.abs(revDelta).toFixed(1)}% vs {basisLabel}
            </div>
          )}
        </div>
        <div className="kpi">
          <div className="eyebrow">Hours per day</div>
          <div className="kpi-value tnum" style={{ fontSize: 24 }}>{perDay.hoursPerDay.toLocaleString()}</div>
          {basisPerDay && <div className="kpi-sub">{basisPerDay.hoursPerDay.toLocaleString()} in {basisLabel}</div>}
        </div>
        <div className="kpi">
          <div className="eyebrow">Reading</div>
          <div className="kpi-value" style={{ fontSize: 16 }}>
            {revDelta === null ? "—" : Math.abs(revDelta) < 2 ? "Flat per day" : revDelta > 0 ? "Genuinely up" : "Genuinely down"}
          </div>
          <div className="kpi-sub">After removing the calendar</div>
        </div>
      </div>
    </div>
  );
}

/* ── Band indicator, for range metrics ──────────────────────────────────── */

export function BandIndicator({ value, low, high, label }: {
  value: number; low: number; high: number; label: string;
}) {
  const [show, setShow] = useState(false);
  const position = value < low ? "below" : value > high ? "above" : "inside";
  const colour = position === "inside" ? "var(--brand)" : "var(--accent)";
  const scaleMax = Math.max(high * 1.4, value * 1.15, 100);
  const pct = (v: number) => Math.min(100, (v / scaleMax) * 100);

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ position: "relative", height: 8, background: "#E8E2D4" }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `${pct(low)}%`,
          width: `${pct(high) - pct(low)}%`, background: "var(--brand)", opacity: 0.22 }} />
        <div style={{ position: "absolute", top: -2, bottom: -2, width: 2,
          left: `${pct(value)}%`, background: colour }} />
      </div>
      <button className="caption" onClick={() => setShow(!show)}
        style={{ marginTop: 6, background: "transparent", border: 0, cursor: "pointer",
          color: position === "inside" ? "var(--brand-text)" : "var(--accent-text)" }}>
        {position === "inside" ? `Inside the ${low}–${high}% band` : `${position === "below" ? "Below" : "Above"} the ${low}–${high}% band`}
      </button>
      {show && (
        <p className="caption" style={{ marginTop: 4, maxWidth: 420 }}>
          {position === "above"
            ? `${label} above the band means margin is going to labor.`
            : position === "below"
              ? `${label} below the band is not efficiency. Check that billed hours were delivered and that costs are posting to the right account.`
              : `${label} is where it should be.`}
        </p>
      )}
    </div>
  );
}
