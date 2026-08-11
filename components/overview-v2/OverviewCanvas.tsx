"use client";
/**
 * Client Overview V2 — Hathorn Intelligence OS prototype.
 * One continuous financial environment. Metric = lens, not page.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OverviewLens, OverviewV2Model } from "@/lib/overview-v2/build";
import HeroChart, { LENS_META, fmtMoney, fmtVal } from "./HeroChart";

const LENSES: OverviewLens[] = ["revenue", "grossProfit", "grossMarginPct", "netIncome", "cash", "arTotal"];
const SECONDARY: OverviewLens[] = ["grossMarginPct", "cash", "arTotal", "netIncome"];

function Delta({
  lens, compare,
}: {
  lens: OverviewLens;
  compare: OverviewV2Model["compare"]["priorYear"][OverviewLens];
}) {
  if (compare.points != null) {
    const up = compare.points >= 0;
    return (
      <span className={`ov2-delta ${up ? "is-up" : "is-down"}`}>
        {up ? "↑" : "↓"} {Math.abs(compare.points).toFixed(1)} pts
      </span>
    );
  }
  if (compare.deltaPct == null) return <span className="ov2-delta is-flat">—</span>;
  const up = compare.deltaPct >= 0;
  return (
    <span className={`ov2-delta ${up ? "is-up" : "is-down"}`}>
      {up ? "↑" : "↓"} {Math.abs(compare.deltaPct).toFixed(1)}%
    </span>
  );
}

export default function OverviewCanvas({ model }: { model: OverviewV2Model }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [lens, setLens] = useState<OverviewLens>("revenue");
  const [range, setRange] = useState<"6M" | "12M" | "ALL">("12M");
  const [compareMode, setCompareMode] = useState<"PRIOR_YEAR" | "PRIOR_MONTH" | "NONE">("PRIOR_YEAR");
  const [cmdOpen, setCmdOpen] = useState(false);
  const [driversOpen, setDriversOpen] = useState(false);
  const [query, setQuery] = useState("");

  const cur = model.cur;
  const meta = LENS_META[lens];
  const heroValue = cur[lens];
  const compare = compareMode === "PRIOR_MONTH"
    ? model.compare.priorMonth[lens]
    : compareMode === "PRIOR_YEAR"
      ? model.compare.priorYear[lens]
      : { delta: null, deltaPct: null, points: null };

  const askHref = useMemo(() => {
    const parts = [`client=${encodeURIComponent(model.client.id)}`];
    if (cur.year && cur.month) {
      parts.push(`year=${cur.year}`, `month=${cur.month}`, `period=${encodeURIComponent(cur.periodId)}`);
    }
    return `/ask?${parts.join("&")}`;
  }, [model.client.id, cur.year, cur.month, cur.periodId]);

  const selectPeriod = useCallback((periodId: string) => {
    startTransition(() => {
      const sp = new URLSearchParams(window.location.search);
      sp.set("client", model.client.id);
      sp.set("month", periodId);
      router.push(`/dash/overview-v2?${sp.toString()}`);
    });
  }, [model.client.id, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(true);
      }
      if (e.key === "Escape") setCmdOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const suggestions = [
    `What changed for ${model.client.name} in ${cur.label}?`,
    `Explain the cash movement in ${cur.label}`,
    `What should I discuss with the client?`,
    `Where is our biggest variance this month?`,
  ];

  return (
    <div className="ov2">
      <aside className="ov2-rail" aria-label="Firm">
        <Link href="/today" className="ov2-mark">
          <span className="ov2-mark-h">HATHORN</span>
          <span className="ov2-mark-s">Intelligence</span>
        </Link>
        <nav className="ov2-rail-nav">
          <Link href="/today">Today</Link>
          <Link href="/clients">Clients</Link>
          <Link href="/close">Work</Link>
          <Link href="/dash/reports">Reports</Link>
          <button type="button" className="ov2-rail-ask" onClick={() => setCmdOpen(true)}>
            Ask<br />Hathorn
          </button>
        </nav>
        <div className="ov2-rail-foot">
          <span className="ov2-eyebrow">Prototype</span>
          <span>Overview V2</span>
        </div>
      </aside>

      <div className="ov2-main">
        <header className="ov2-top">
          <div className="ov2-top-left">
            <span className="ov2-word">HATHORN</span>
          </div>
          <div className="ov2-top-ctx">
            <span className="ov2-client-chip">{model.client.name.split(" ")[0].toUpperCase()}</span>
            <span className="ov2-period-chip">{cur.label.toUpperCase()}</span>
          </div>
          <button type="button" className="ov2-cmd-btn" onClick={() => setCmdOpen(true)} aria-label="Ask Hathorn">
            <span>⌘ K</span>
          </button>
        </header>

        <section className="ov2-hero">
          <div className="ov2-hero-meta">
            <div>
              <div className="ov2-kicker">{model.client.name.toUpperCase()}</div>
              <div className="ov2-period-line">
                <PeriodScrubber
                  periods={model.periods}
                  activeId={cur.periodId}
                  onSelect={selectPeriod}
                />
              </div>
            </div>
            <div className="ov2-status">
              <span><i />{model.status.books}</span>
              <span>{model.status.close}</span>
              <span>{model.status.connection}</span>
            </div>
          </div>

          <div className="ov2-hero-figure">
            <div className="ov2-hero-figure-main">
              <div className="ov2-hero-value tnum">{fmtVal(heroValue, meta.unit)}</div>
              <div className="ov2-hero-label">{meta.label}</div>
              <div className="ov2-hero-delta">
                <Delta lens={lens} compare={compare} />
                <span className="ov2-hero-delta-basis">
                  {compareMode === "PRIOR_YEAR" ? "vs prior year" : compareMode === "PRIOR_MONTH" ? "vs prior month" : "no comparison"}
                </span>
              </div>
            </div>
            {model.narrative.signal && (
              <div className="ov2-signal">
                <span className="ov2-eyebrow">Hathorn signal</span>
                <strong>● {model.narrative.signal}</strong>
              </div>
            )}
          </div>

          <div className="ov2-controls" role="toolbar" aria-label="Financial lens">
            <div className="ov2-control-group">
              {LENSES.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={lens === l ? "on" : ""}
                  onClick={() => setLens(l)}
                >
                  {LENS_META[l].label}
                </button>
              ))}
            </div>
            <div className="ov2-control-group ov2-control-right">
              {(["6M", "12M", "ALL"] as const).map((r) => (
                <button key={r} type="button" className={range === r ? "on" : ""} onClick={() => setRange(r)}>
                  {r === "ALL" ? "All" : r}
                </button>
              ))}
              <button
                type="button"
                className={compareMode === "PRIOR_YEAR" ? "on" : ""}
                onClick={() => setCompareMode((m) => (m === "PRIOR_YEAR" ? "NONE" : "PRIOR_YEAR"))}
                disabled={!model.priorYear}
              >
                Prior year
              </button>
            </div>
          </div>

          <HeroChart
            periods={model.periods}
            lens={lens}
            activePeriodId={cur.periodId}
            showPriorYear={compareMode === "PRIOR_YEAR"}
            range={range}
          />

          <div className="ov2-series-key">
            <span><b />Actual</span>
            {compareMode === "PRIOR_YEAR" && model.priorYear && <span className="is-prior"><b />Prior year</span>}
          </div>
        </section>

        <section className="ov2-intel">
          <div className="ov2-intel-copy">
            <span className="ov2-eyebrow">What Hathorn sees</span>
            <h2>{model.narrative.headline}</h2>
            <p>{model.narrative.body}</p>
            {model.narrative.noteHeading && (
              <p className="ov2-note">
                <em>{model.narrative.noteHeading}.</em> {model.narrative.noteBody}
              </p>
            )}
            <div className="ov2-actions">
              <button type="button" className="ov2-btn-primary" onClick={() => setDriversOpen((v) => !v)}>
                {driversOpen ? "Hide drivers" : "Explore drivers"}
              </button>
              <button type="button" className="ov2-btn-ghost" onClick={() => setCmdOpen(true)}>
                Ask Hathorn
              </button>
              <Link className="ov2-btn-ghost" href={`/dash/financials?client=${model.client.id}&month=${cur.periodId}`}>
                Open financials
              </Link>
            </div>
          </div>

          <aside className="ov2-secondary" aria-label="Supporting metrics">
            {SECONDARY.filter((l) => l !== lens).slice(0, 3).map((l) => (
              <button key={l} type="button" className="ov2-sec-metric" onClick={() => setLens(l)}>
                <span className="ov2-eyebrow">{LENS_META[l].label}</span>
                <strong className="tnum">{fmtVal(cur[l], LENS_META[l].unit)}</strong>
                <Delta lens={l} compare={model.compare.priorYear[l]} />
              </button>
            ))}
          </aside>
        </section>

        {driversOpen && (
          <section className="ov2-drivers" aria-label="Driver analysis">
            <div>
              <span className="ov2-eyebrow">Why net income changed</span>
              <h3>Period bridge · {model.priorMonth?.label ?? "—"} → {cur.label}</h3>
              <ul className="ov2-bridge">
                {model.drivers.netIncome.map((row, i) => {
                  const isEdge = i === 0 || i === model.drivers.netIncome.length - 1;
                  const mag = Math.max(...model.drivers.netIncome.map((x) => Math.abs(x.delta)), 1);
                  const w = isEdge ? 0 : Math.max(8, (Math.abs(row.delta) / mag) * 100);
                  return (
                    <li key={row.label} className={isEdge ? "is-edge" : ""}>
                      <span>{row.label}</span>
                      {!isEdge && (
                        <i style={{ width: `${w}%`, background: row.delta >= 0 ? "var(--brand)" : "var(--accent-deep)" }} />
                      )}
                      <strong className="tnum">{fmtMoney(row.delta)}</strong>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <span className="ov2-eyebrow">Revenue contributors</span>
              <h3>Entity movement</h3>
              <ul className="ov2-slices">
                {model.drivers.revenueSlices.length === 0 && <li>No entity-level movement versus prior month.</li>}
                {model.drivers.revenueSlices.map((s) => (
                  <li key={s.label}>
                    <span>{s.label}</span>
                    <strong className="tnum" style={{ color: s.delta >= 0 ? "var(--brand-deep)" : "var(--accent-deep)" }}>
                      {s.delta >= 0 ? "+" : ""}{fmtMoney(s.delta)}
                    </strong>
                  </li>
                ))}
              </ul>
              <p className="ov2-method">
                Deterministic bridges from the ledger. Causal claim beyond the close requires transaction detail — Hathorn will not invent it.
              </p>
            </div>
          </section>
        )}
      </div>

      {cmdOpen && (
        <div className="ov2-cmd" role="dialog" aria-modal="true" aria-label="Ask Hathorn">
          <button type="button" className="ov2-cmd-scrim" aria-label="Close" onClick={() => setCmdOpen(false)} />
          <div className="ov2-cmd-panel">
            <div className="ov2-eyebrow">✦ Ask Hathorn</div>
            <h2>What do you want to understand about {model.client.name.split(" ")[0]}?</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                window.location.href = askHref;
              }}
            >
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Why did profitability move in ${cur.label}?`}
              />
            </form>
            <p className="ov2-method" style={{ marginTop: 12 }}>
              Opens Ask Hathorn in context for {model.client.name} · {cur.label}.
              {query.trim() ? ` Prompt ready: “${query.trim()}”.` : ""}
            </p>
            <div className="ov2-cmd-suggest">
              <span className="ov2-eyebrow">Suggested</span>
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setQuery(s)}
                >
                  {s}
                </button>
              ))}
              <Link className="ov2-btn-primary" href={askHref} style={{ marginTop: 8, display: "inline-flex", width: "fit-content" }}>
                Open Ask Hathorn
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PeriodScrubber({
  periods, activeId, onSelect,
}: {
  periods: OverviewV2Model["periods"];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  // Group by year so JAN'25 and JAN'26 are never ambiguous.
  const years = Array.from(new Set(periods.map((p) => p.year))).sort((a, b) => a - b);
  return (
    <div className="ov2-scrub-wrap" aria-label="Reporting period">
      {years.map((year) => (
        <div key={year} className="ov2-scrub-year">
          <span className="ov2-scrub-year-label">{year}</span>
          <div className="ov2-scrub" role="listbox" aria-label={`${year} periods`}>
            {periods.filter((p) => p.year === year).map((p) => {
              const on = p.periodId === activeId;
              return (
                <button
                  key={p.periodId}
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={on ? "on" : ""}
                  onClick={() => onSelect(p.periodId)}
                  title={p.label}
                >
                  <span>{p.label.split(" ")[0].slice(0, 3).toUpperCase()}</span>
                  {on && <i />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
