"use client";
/**
 * Placeholder for when cash is modeled. v1 only shows baseline cash as context —
 * we refuse to draw a fake cash forecast.
 */
export default function CashOutlookChart({ baselineCash }: { baselineCash: number | null }) {
  return (
    <div style={{ padding: "28px 0", borderTop: "1px solid var(--hairline)" }}>
      <div className="eyebrow">Cash</div>
      <p style={{ fontFamily: "var(--editorial)", fontSize: 16, color: "var(--ink-soft)",
        marginTop: 10, maxWidth: 520, lineHeight: 1.5 }}>
        {baselineCash == null
          ? "No baseline cash on the source period. Cash is not projected until working-capital drivers are modeled."
          : `Baseline cash $${baselineCash.toFixed(1)}K is an ACTUAL balance. It is not forecast in this version — projecting cash without receivables, payables, and debt schedules would invent certainty.`}
      </p>
    </div>
  );
}
