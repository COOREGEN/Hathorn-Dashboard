import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { resolveActiveFirmId } from "@/lib/tenancy";
import { loadPortfolio, type PortfolioRow } from "@/lib/portfolio";
import StaffHeader from "@/components/staff-header";

/**
 * Attention — who needs you this month.
 *
 * Designed as a register, not a feed. A partner with thirty clients should see the whole
 * practice without scrolling, run their eye down one column, and stop at the rows that
 * need them.
 */
export const dynamic = "force-dynamic";

const money = (n: number | null) => {
  if (n === null) return "—";
  const s = n < 0 ? "−" : "", v = Math.abs(n);
  return v >= 1000 ? `${s}$${(v / 1000).toFixed(1)}M` : `${s}$${v.toFixed(0)}K`;
};

const BAND = {
  urgent: { col: "#9E401D", label: "Urgent" },
  watch: { col: "#9A7B1E", label: "Watch" },
  steady: { col: "#2C504D", label: "Steady" },
};
const SEV: Record<string, string> = {
  critical: "#9E401D", high: "#DB5928", medium: "#9A7B1E", low: "#6E675B",
};

/** Twelve months of revenue in 74×22. The fastest read on the row. */
function Spark({ points }: { points: number[] }) {
  if (points.length < 2) return <span className="caption" style={{ opacity: .5 }}>—</span>;
  const w = 74, h = 22, hi = Math.max(...points), lo = Math.min(...points, 0);
  const span = hi - lo || 1;
  const x = (i: number) => (i / (points.length - 1)) * (w - 2) + 1;
  const y = (v: number) => h - 3 - ((v - lo) / span) * (h - 6);
  const d = points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = points[points.length - 1], first = points[0];
  const rising = last >= first;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h, display: "block" }}>
      <polyline points={d} fill="none" stroke={rising ? "#2C504D" : "#DB5928"} strokeWidth={1.4} />
      <circle cx={x(points.length - 1)} cy={y(last)} r={2} fill={rising ? "#2C504D" : "#DB5928"} />
    </svg>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span className="eyebrow" style={{ minWidth: 62, fontSize: 8.5 }}>{label}</span>
      {children}
    </div>
  );
}

export default async function Portfolio({ searchParams }: {
  searchParams: Record<string, string | undefined>;
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role === "CLIENT") redirect("/portal");

  const p = loadPortfolio({
    tag: searchParams.tag, vertical: searchParams.vertical,
    band: searchParams.band, sort: searchParams.sort,
  }, new Date(), resolveActiveFirmId(s));
  const expanded = searchParams.open;

  const qs = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...searchParams, ...patch })) if (v) next.set(k, v);
    const q = next.toString();
    return q ? `/portfolio?${q}` : "/portfolio";
  };

  const chip = (href: string, on: boolean, label: string, count?: number) => (
    <Link key={label} href={href} className={`chip${on ? " on" : ""}`}>
      {label}{count !== undefined && <span className="chip-n">{count}</span>}
    </Link>
  );

  const activeFilters = [searchParams.band, searchParams.vertical, searchParams.tag].filter(Boolean).length;

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <StaffHeader
        sub="Dashboard · Attention"
        maxWidth={1440}
        userName={s.name}
        links={[{ href: "/dash", label: "Dashboard" }]}
      />

      <main style={{ maxWidth: 1440, margin: "0 auto", padding: "28px 32px 60px" }}>
        {/* Headline and cohort summary share a line — the summary is context, not content. */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 40, flexWrap: "wrap",
          borderBottom: "1px solid var(--hairline)", paddingBottom: 18, marginBottom: 18 }}>
          <div>
            <h1 style={{ fontFamily: "var(--display)", fontSize: 30, fontWeight: 300, margin: 0 }}>
              Attention
            </h1>
            <p className="caption" style={{ marginTop: 4 }}>
              {p.cohort.count} client{p.cohort.count === 1 ? "" : "s"}
              {activeFilters > 0 && " in this selection"} · ranked by advisory urgency
            </p>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 34, flexWrap: "wrap" }}>
            <div className="stat">
              <div className="eyebrow">Urgent</div>
              <div className="stat-v tnum" style={{ color: p.cohort.urgent ? BAND.urgent.col : "var(--ink)" }}>
                {p.cohort.urgent}
              </div>
            </div>
            <div className="stat">
              <div className="eyebrow">Watch</div>
              <div className="stat-v tnum" style={{ color: p.cohort.watch ? BAND.watch.col : "var(--ink)" }}>
                {p.cohort.watch}
              </div>
            </div>
            <div className="stat">
              <div className="eyebrow">Behind on close</div>
              <div className="stat-v tnum" style={{ color: p.cohort.behindOnClose ? BAND.urgent.col : "var(--ink)" }}>
                {p.cohort.behindOnClose}
              </div>
            </div>
            <div className="stat">
              <div className="eyebrow">Not tying</div>
              <div className="stat-v tnum" style={{ color: p.cohort.gateFailing ? BAND.urgent.col : "var(--ink)" }}>
                {p.cohort.gateFailing}
              </div>
            </div>
            <div className="stat">
              <div className="eyebrow">Combined revenue</div>
              <div className="stat-v tnum">{money(p.cohort.totalRevenue)}</div>
            </div>
            {/* A median across fewer than three clients describes one business. Suppressed. */}
            <div className="stat">
              <div className="eyebrow">Median net margin</div>
              <div className="stat-v tnum">
                {p.cohort.cohortMeaningful && p.cohort.medianNetMargin !== null
                  ? `${p.cohort.medianNetMargin}%`
                  : <span style={{ fontSize: 13, color: "var(--ink-mute)", fontFamily: "var(--utility)" }}>
                      needs 3+
                    </span>}
              </div>
            </div>
          </div>
        </div>

        {/* Filters are collapsed by default. Twenty-two chips above four rows makes the
            controls heavier than the data; they open when someone wants them. */}
        <details open={activeFilters > 0} style={{ marginBottom: 20 }}>
          <summary className="filter-toggle">
            {activeFilters > 0 ? `Filters (${activeFilters} active)` : "Filter and sort"}
          </summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
          <FilterGroup label="Status">
            {chip(qs({ band: undefined }), !searchParams.band, "All", p.cohort.count)}
            {(["urgent", "watch", "steady"] as const).map((b) =>
              chip(qs({ band: b }), searchParams.band === b, BAND[b].label,
                b === "urgent" ? p.cohort.urgent : b === "watch" ? p.cohort.watch : p.cohort.steady))}
          </FilterGroup>

          {p.allVerticals.length > 1 && (
            <FilterGroup label="Industry">
              {chip(qs({ vertical: undefined }), !searchParams.vertical, "All")}
              {p.allVerticals.map((v) =>
                chip(qs({ vertical: v.key }), searchParams.vertical === v.key, v.label))}
            </FilterGroup>
          )}

          {p.allTags.length > 0 && (
            <FilterGroup label="Tag">
              {chip(qs({ tag: undefined }), !searchParams.tag, "All")}
              {p.allTags.map((t) =>
                chip(qs({ tag: searchParams.tag === t ? undefined : t }), searchParams.tag === t, t))}
            </FilterGroup>
          )}

          <FilterGroup label="Sort by">
            {([["attention", "Needs attention"], ["decline", "Steepest decline"],
               ["growth", "Fastest growth"], ["confidence", "Weakest evidence"],
               ["revenue", "Largest"], ["margin", "Best margin"], ["name", "Name"]] as const)
              .map(([k, l]) => chip(qs({ sort: k }), (searchParams.sort ?? "attention") === k, l))}
          </FilterGroup>
        </div>
        </details>

        {p.rows.length === 0 ? (
          <div className="empty">
            <h3>Nothing matches this selection</h3>
            <p>Clear a filter to see the rest of the book.</p>
          </div>
        ) : (
          <div style={{ border: "1px solid var(--hairline)", background: "#FFFDF8" }}>
            {/* One line per client. The whole practice on one screen. */}
            <div className="book-head">
              <div>Client</div>
              <div>Trend</div>
              <div style={{ textAlign: "right" }}>Revenue</div>
              <div style={{ textAlign: "right" }}>Margin</div>
              <div style={{ textAlign: "right" }}>Cover</div>
              <div style={{ textAlign: "right" }}>Conf.</div>
              <div style={{ textAlign: "right" }}>Open</div>
              <div>Why</div>
              <div style={{ textAlign: "right" }}>Score</div>
            </div>

            {p.rows.map((r) => {
              const isOpen = expanded === r.clientId;
              const top = r.reasons[0];
              return (
                <div key={r.clientId}>
                  <div className="book-row" style={{ borderLeft: `3px solid ${BAND[r.band].col}` }}>
                    <div style={{ minWidth: 0 }}>
                      <Link href={`/dash?client=${r.clientId}`} className="book-name">{r.name}</Link>
                      <div className="book-sub">
                        {r.verticalLabel}
                        {r.periodLabel ? ` · ${r.periodLabel}` : " · no close"}
                        {r.status && r.status !== "PUBLISHED" ? " (draft)" : ""}
                      </div>
                    </div>

                    <div><Spark points={r.trend} /></div>

                    {/* data-label carries the column heading down into the stacked
                        layout: below 1180px the header row is hidden, and an
                        unlabelled figure on a financial screen is worse than none. */}
                    <div className="tnum book-num" data-label="Revenue">
                      {money(r.revenue)}
                      {r.revenueChangePct !== null && (
                        <div className="book-delta" style={{
                          color: r.revenueChangePct >= 0 ? "#2C504D" : "#B94B22" }}>
                          {r.revenueChangePct >= 0 ? "▲" : "▼"} {Math.abs(r.revenueChangePct)}%
                        </div>
                      )}
                    </div>

                    <div className="tnum book-num" data-label="Net margin" style={{
                      color: (r.netMarginPct ?? 0) < 0 ? "#B94B22" : "var(--ink)" }}>
                      {r.netMarginPct !== null ? `${r.netMarginPct}%` : "—"}
                    </div>

                    <div className="tnum book-num" data-label="Weeks cover" style={{
                      color: (r.weeksOfCover ?? 99) < 6 ? "#B94B22" : "var(--ink)" }}>
                      {r.weeksOfCover ?? "—"}
                    </div>

                    <div className="tnum book-num" data-label="Confidence" style={{
                      color: (r.confidence ?? 100) < 60 ? "#B94B22" : "var(--ink)" }}>
                      {r.confidence !== null ? `${r.confidence}%` : "—"}
                    </div>

                    <div className="tnum book-num" data-label="Open items" style={{
                      color: r.oldestCommitmentMonths >= 3 ? "#B94B22" : "var(--ink)" }}>
                      {r.openCommitments || "—"}
                    </div>

                    {/* Loudest reason inline; the rest on demand. */}
                    <div style={{ minWidth: 0 }}>
                      {top ? (
                        <Link href={qs({ open: isOpen ? undefined : r.clientId })} className="book-why">
                          <span style={{ color: SEV[top.severity], fontWeight: 600 }}>{top.headline}</span>
                          {r.reasons.length > 1 && (
                            <span className="book-more">+{r.reasons.length - 1}</span>
                          )}
                        </Link>
                      ) : (
                        <span className="book-clear">Nothing outstanding</span>
                      )}
                    </div>

                    <div style={{ textAlign: "right" }} className="book-score-cell">
                      <span className="book-score" style={{ color: BAND[r.band].col }}>{r.attention}</span>
                    </div>
                  </div>

                  {isOpen && r.reasons.length > 0 && (
                    <div className="book-detail">
                      {r.reasons.map((reason) => (
                        <div key={reason.code} style={{ display: "flex", gap: 10, marginBottom: 9 }}>
                          <span style={{ width: 2, background: SEV[reason.severity], flexShrink: 0 }} />
                          <div>
                            <div style={{ fontFamily: "var(--utility)", fontSize: 11.5, fontWeight: 600,
                              color: SEV[reason.severity] }}>{reason.headline}</div>
                            <div className="caption" style={{ marginTop: 1 }}>{reason.detail}</div>
                          </div>
                        </div>
                      ))}
                      <Link href={`/dash?client=${r.clientId}`} className="book-open">
                        Open {r.name} →
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <details style={{ marginTop: 18 }}>
          <summary className="filter-toggle">How the score works</summary>
        <p className="caption" style={{ marginTop: 12, maxWidth: 780 }}>
          Score combines signals the platform already computes: whether the close is current
          and ties, cash runway, loss-making months, material revenue moves, metrics outside a
          target somebody actually agreed, evidence quality, and commitments that have not
          moved. Metrics with no agreed target are excluded — scoring a client against a band
          nobody set would be guesswork wearing a number.
        </p>
        </details>
      </main>
    </div>
  );
}
