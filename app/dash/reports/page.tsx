import Frame from "@/components/dash/frame";
import Link from "next/link";

export default function Reports({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  return (
    <Frame searchParams={searchParams} title="Reports" showFilters={false}
      subtitle="Reusable management, budget, lender, and data-quality packs">
      {(ctx) => {
        const { cur, balance, budget, client } = ctx as any;
        const slug = client.slug || client.id;
        const packs = [
          { t: "Monthly statement", s: `Five-section client deliverable for ${cur.label}`,
            ready: cur.status === "PUBLISHED",
            href: `/portal?client=${encodeURIComponent(slug)}&month=${cur.periodId}`,
            blocked: "Publish the period first." },
          { t: "Review sheet", s: "Gate results, story editor, and approval",
            ready: true, href: `/review/${cur.periodId}` },
          { t: "Lender pack", s: "Balance sheet, coverage ratios, thirteen-week cash",
            ready: balance.available, blocked: "Upload a balance sheet with the close." },
          { t: "Budget variance", s: "Actual against plan, month and year to date",
            ready: budget.available, blocked: "Upload a budget for this year." },
          { t: "Data quality", s: "Confidence components and tie-out results", ready: true,
            href: `/dash/alerts?month=${cur.periodId}` },
          { t: "Payroll detail", s: "Composition, overtime, and hours by entity", ready: true,
            href: `/dash/financials?month=${cur.periodId}` },
        ];
        return (
          <>
            <div className="grid g3">
              {packs.map((p) => (
                <div className="card" key={p.t}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span style={{ fontFamily: "var(--display)", fontSize: 17 }}>{p.t}</span>
                    <span className="tag" style={{ color: p.ready ? "var(--brand-text)" : "var(--ink-mute)" }}>
                      {p.ready ? "Ready" : "Blocked"}
                    </span>
                  </div>
                  <p className="caption" style={{ marginTop: 8 }}>{p.s}</p>
                  {p.ready && p.href ? (
                    <Link href={p.href} style={{ display: "inline-block", marginTop: 12,
                      fontFamily: "var(--utility)", fontSize: 11, fontWeight: 600,
                      color: "var(--gold-deep)" }}>Open →</Link>
                  ) : !p.ready ? (
                    <p className="caption" style={{ marginTop: 10, color: "var(--accent-text)" }}>{p.blocked}</p>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="caption section-gap" style={{ maxWidth: 640 }}>
              Every pack renders from the same figures shown here — nothing is re-keyed, so a
              lender pack and a client statement can never disagree. PDF export currently uses
              the browser print stylesheet; a server-side renderer is the next step for
              {" "}{client.name}-branded deliverables.
            </p>
          </>
        );
      }}
    </Frame>
  );
}
