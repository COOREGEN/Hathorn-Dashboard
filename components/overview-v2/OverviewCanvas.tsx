"use client";
/**
 * Client Financial Command Center V2
 * Institutional · cross-linked · fixture-true figures.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OverviewLens, OverviewV2Model } from "@/lib/overview-v2/build";
import HeroChart, { LENS_META, fmtMoney, fmtVal } from "./HeroChart";
import ExpenseDonut from "./ExpenseDonut";
import "./overview-v2.css";

const LENSES: OverviewLens[] = ["revenue", "grossProfit", "grossMarginPct", "netIncome", "cash", "arTotal"];
const SUPPORT: OverviewLens[] = ["grossMarginPct", "netIncome", "cash", "arTotal"];

function Spark({ values, up }: { values: number[]; up: boolean }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 64;
  const h = 24;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg className="ov2-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline fill="none" stroke={up ? "#6FBF9A" : "#C97B63"} strokeWidth="1.4" points={pts} />
    </svg>
  );
}

type DriverSel = { label: string; delta: number; kind: string } | null;

export default function OverviewCanvas({ model }: { model: OverviewV2Model }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [lens, setLens] = useState<OverviewLens>("revenue");
  const [range, setRange] = useState<"6M" | "12M" | "24M" | "YTD" | "ALL">("12M");
  const [compareMode, setCompareMode] = useState<"PRIOR_YEAR" | "PRIOR_MONTH" | "NONE">("PRIOR_YEAR");
  const [cmdOpen, setCmdOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [driver, setDriver] = useState<DriverSel>(null);

  const cur = model.cur;
  const meta = LENS_META[lens];
  const heroValue = cur[lens];
  const compare = compareMode === "PRIOR_MONTH"
    ? model.compare.priorMonth[lens]
    : compareMode === "PRIOR_YEAR"
      ? model.compare.priorYear[lens]
      : { delta: null, deltaPct: null, points: null };

  const idx = model.periods.findIndex((p) => p.periodId === cur.periodId);

  const askHref = useMemo(() => {
    const parts = [
      `client=${encodeURIComponent(model.client.id)}`,
      `year=${cur.year}`,
      `month=${cur.month}`,
      `period=${encodeURIComponent(cur.periodId)}`,
    ];
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

  const stepPeriod = (dir: -1 | 1) => {
    const next = model.periods[idx + dir];
    if (next) selectPeriod(next.periodId);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(true);
      }
      if (e.key === "Escape") {
        setCmdOpen(false);
        setDriver(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Cross-linked Ask suggestions follow lens + period.
  const suggestions = useMemo(() => {
    const m = meta.label.toLowerCase();
    return [
      `Why did ${m} move in ${cur.label}?`,
      "What should I discuss with the client?",
      `Explain cash in ${cur.label}`,
      "Where are the largest variances?",
    ];
  }, [meta.label, cur.label]);

  const seriesFor = (l: OverviewLens) =>
    model.periods.slice(Math.max(0, idx - 5), idx + 1).map((p) => p[l]);

  const compareLabel = compareMode === "PRIOR_YEAR"
    ? `vs ${model.priorYear?.label ?? "prior year"}`
    : compareMode === "PRIOR_MONTH" ? "vs prior month" : "";

  const insightTone = (l: OverviewLens, c: OverviewV2Model["compare"]["priorYear"][OverviewLens]) => {
    if (c.points != null) return c.points >= 0 ? "up" as const : "down" as const;
    if (c.deltaPct == null) return "flat" as const;
    return c.deltaPct >= 0 ? "up" as const : "down" as const;
  };

  return (
    <div className="ov2 ov2-dark">
      <aside className="ov2-rail" aria-label="Firm navigation">
        <div className="ov2-rail-brand">
          <div className="ov2-rail-badge">H</div>
          <div>
            <div className="ov2-rail-name">Hathorn</div>
            <div className="ov2-rail-sub">Advisory Group</div>
          </div>
        </div>

        <nav className="ov2-rail-nav">
          <Link href="/today"><Icon d="M3 12l9-9 9 9M5 10v10h14V10" />Today</Link>
          <Link href="/clients" className="on"><Icon d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />Clients</Link>
          <Link href="/close"><Icon d="M9 11l3 3L22 4M4 20h16" />Work</Link>
          <Link href="/dash/reports"><Icon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6" />Reports</Link>
          <button type="button" onClick={() => setCmdOpen(true)}>
            <Icon d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />Ask Hathorn
          </button>
        </nav>

        <div className="ov2-rail-firm">
          <div className="ov2-eyebrow">Firm</div>
          <Link href="/firm">Team</Link>
          <Link href="/integrations">Integrations</Link>
          <Link href="/firm">Settings</Link>
        </div>

        <div className="ov2-rail-user">
          <div className="ov2-avatar">{model.userName.charAt(0)}</div>
          <div>
            <div>{model.userName}</div>
            <div className="ov2-rail-role">{model.userRole === "ADMIN" ? "Managing Partner" : model.userRole}</div>
          </div>
        </div>
      </aside>

      <div className="ov2-workspace">
        <header className="ov2-top">
          <div className="ov2-crumbs">
            <Link href="/clients">Clients</Link>
            <span>/</span>
            <span>{model.client.name}</span>
          </div>
          <div className="ov2-top-right">
            <button type="button" className="ov2-search" onClick={() => setCmdOpen(true)}>
              <span>⌘ K Ask Hathorn anything…</span>
            </button>
            <button type="button" className="ov2-icon-btn" aria-label="Notifications">
              <Icon d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
            </button>
            <div className="ov2-avatar sm">{model.userName.charAt(0)}</div>
          </div>
        </header>

        <div className="ov2-title-row">
          <div>
            <h1>
              {model.client.name}
              <span className="ov2-verified" title="Client record" aria-hidden>✓</span>
            </h1>
            <div className="ov2-title-meta">
              <span>{cur.label}</span>
              <span className="ov2-dot-ok">{model.status.books}</span>
              <span className={model.qboConnected ? "ov2-dot-ok" : "ov2-dot-mute"}>
                {model.status.connection}
              </span>
            </div>
            <PeriodScrubber periods={model.periods} activeId={cur.periodId} onSelect={selectPeriod} />
          </div>
          <div className="ov2-period-tools">
            <button type="button" aria-label="Previous period" onClick={() => stepPeriod(-1)} disabled={idx <= 0}>‹</button>
            <button type="button" className="ov2-period-current">{cur.label}</button>
            <button type="button" aria-label="Next period" onClick={() => stepPeriod(1)} disabled={idx >= model.periods.length - 1}>›</button>
            <select
              className="ov2-compare"
              value={compareMode}
              aria-label="Compare to"
              onChange={(e) => setCompareMode(e.target.value as typeof compareMode)}
            >
              <option value="PRIOR_YEAR">Compare to · Prior year</option>
              <option value="PRIOR_MONTH">Compare to · Prior month</option>
              <option value="NONE">Compare to · Off</option>
            </select>
          </div>
        </div>

        <div className="ov2-body">
          <main className="ov2-canvas">
            <section className="ov2-chart-block">
              <div className="ov2-chart-head">
                <div>
                  <div className="ov2-eyebrow">{meta.label}</div>
                  <div className="ov2-hero-value tnum">{fmtVal(heroValue, meta.unit)}</div>
                  <div className="ov2-hero-delta">
                    <Delta compare={compare} />
                    <span>{compareLabel}</span>
                    {compare.delta != null && meta.unit === "money" && (
                      <span className="ov2-hero-amt">
                        ({compare.delta >= 0 ? "+" : ""}{fmtMoney(compare.delta)})
                      </span>
                    )}
                  </div>
                </div>
                <div className="ov2-range" role="group" aria-label="Chart range">
                  {(["6M", "12M", "24M", "YTD", "ALL"] as const).map((r) => (
                    <button key={r} type="button" className={range === r ? "on" : ""} onClick={() => setRange(r)}>{r}</button>
                  ))}
                </div>
              </div>

              <div className="ov2-lens" role="group" aria-label="Financial lens">
                {LENSES.map((l) => (
                  <button key={l} type="button" className={lens === l ? "on" : ""} onClick={() => setLens(l)}>
                    {LENS_META[l].label}
                  </button>
                ))}
              </div>

              <HeroChart
                periods={model.periods}
                lens={lens}
                activePeriodId={cur.periodId}
                showPriorYear={compareMode === "PRIOR_YEAR"}
                showBudget={lens === "revenue" && model.budget.available}
                range={range}
              />
            </section>

            <section className="ov2-metrics" aria-label="Supporting metrics">
              {SUPPORT.map((l) => {
                const c = model.compare.priorYear[l];
                const tone = insightTone(l, c);
                return (
                  <button
                    key={l}
                    type="button"
                    className={`ov2-metric${lens === l ? " on" : ""}`}
                    onClick={() => setLens(l)}
                  >
                    <div className="ov2-metric-top">
                      <span className="ov2-eyebrow">{LENS_META[l].label}</span>
                      <Spark values={seriesFor(l)} up={tone !== "down"} />
                    </div>
                    <div className="ov2-metric-v tnum">{fmtVal(cur[l], LENS_META[l].unit)}</div>
                    <div className="ov2-metric-d"><Delta compare={c} /></div>
                  </button>
                );
              })}
            </section>

            <section className="ov2-bottom-grid">
              <div className="ov2-waterfall">
                <div className="ov2-eyebrow">Why it changed</div>
                <h2>Net income · {model.drivers.fromLabel} → {model.drivers.toLabel}</h2>
                <ul>
                  {model.drivers.netIncome.map((row) => {
                    const edge = row.kind === "start" || row.kind === "end";
                    const mag = Math.max(
                      ...model.drivers.netIncome.filter((x) => !["start", "end"].includes(x.kind)).map((x) => Math.abs(x.delta)),
                      1,
                    );
                    const w = edge ? 0 : Math.max(10, (Math.abs(row.delta) / mag) * 100);
                    if (edge) {
                      return (
                        <li key={row.label} className="is-edge">
                          <span>{row.label}</span>
                          <strong className="tnum">{fmtMoney(row.delta)}</strong>
                        </li>
                      );
                    }
                    return (
                      <li key={row.label}>
                        <button type="button" className={`ov2-driver-btn${driver?.label === row.label ? " on" : ""}`} onClick={() => setDriver(row)}>
                          <span>{row.label}</span>
                          <i className={row.kind === "up" ? "up" : "down"} style={{ width: `${w}%` }} />
                          <strong className="tnum">{fmtMoney(row.delta)}</strong>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="ov2-fine">
                  Deterministic {model.drivers.mode} bridge from the ledger.
                  Click a driver for detail — Hathorn will not invent causes beyond posted categories.
                </p>
              </div>

              <div className="ov2-expense">
                <div className="ov2-eyebrow">Expense mix · {cur.label}</div>
                <h2>Where cost sits</h2>
                <ExpenseDonut slices={model.expenses} total={model.expenseTotal} />
              </div>
            </section>
          </main>

          <aside className="ov2-intel" aria-label="What Hathorn sees">
            <div className="ov2-intel-card">
              <div className="ov2-eyebrow">What Hathorn sees</div>
              <h2>{model.narrative.headline}</h2>
              <p>{model.narrative.body}</p>
              {model.narrative.signal && (
                <div className="ov2-signal-chip">● {model.narrative.signal}</div>
              )}
              {model.narrative.noteBody && (
                <p className="ov2-fine" style={{ marginTop: 12 }}>
                  Advisor note · {model.narrative.noteHeading}: {model.narrative.noteBody}
                </p>
              )}
              <button
                type="button"
                className="ov2-ask-suggestions"
                style={{ marginTop: 14, padding: 0, border: 0, background: "none", color: "var(--gold)", fontFamily: "var(--utility)", fontSize: 12, cursor: "pointer", textAlign: "left" }}
                onClick={() => {
                  const first = model.drivers.netIncome.find((d) => d.kind === "down" || d.kind === "up");
                  if (first) setDriver(first);
                }}
              >
                Explore drivers →
              </button>
            </div>

            <div className="ov2-intel-card">
              <div className="ov2-eyebrow">Key takeaways</div>
              <ul className="ov2-insight-list">
                {model.insights.slice(0, 3).map((ins) => (
                  <li key={ins.label}>
                    <span>{ins.label}</span>
                    <strong className={`tnum is-${ins.tone}`}>{ins.value}</strong>
                    <em>{ins.detail}</em>
                  </li>
                ))}
              </ul>
            </div>

            <div className="ov2-intel-card">
              <div className="ov2-eyebrow">Ask Hathorn</div>
              <div className="ov2-ask-suggestions">
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => { setQuery(s); setCmdOpen(true); }}>{s}</button>
                ))}
              </div>
              <form className="ov2-ask-inline" onSubmit={(e) => { e.preventDefault(); setCmdOpen(true); }}>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`${meta.label} · ${cur.label}`}
                  aria-label="Ask Hathorn"
                />
                <button type="submit">Ask</button>
              </form>
              <p className="ov2-fine">Context: {model.client.name} · {cur.label} · {meta.label}</p>
            </div>
          </aside>
        </div>

        <footer className="ov2-statusbar">
          <span className={model.status.closeTrack === "On track" || model.status.closeTrack === "Complete" ? "ok" : ""}>
            Close · {model.status.closeTrack}
          </span>
          <span>
            Reconciliations · {model.status.reconTotal ? `${model.status.reconDone} / ${model.status.reconTotal}` : "None on period"}
          </span>
          <span className={model.status.openItems ? "warn" : ""}>
            Open items · {model.status.openItems}
          </span>
          <span className={model.status.docsMissing ? "warn" : ""}>
            Documents · {model.status.docsMissing ? `${model.status.docsMissing} missing` : "Clear"}
          </span>
          <span>Partner review · {model.status.partnerReview}</span>
          <Link href={`/close?client=${model.client.id}`} className="ov2-status-cta">
            Go to Close Room →
          </Link>
        </footer>
      </div>

      {driver && (
        <aside className="ov2-drawer" role="dialog" aria-label={`${driver.label} detail`}>
          <button type="button" className="ov2-drawer-close" aria-label="Close" onClick={() => setDriver(null)}>×</button>
          <div className="ov2-eyebrow">Driver</div>
          <h3>{driver.label}</h3>
          <div className="ov2-drawer-v tnum">{fmtMoney(driver.delta)}</div>
          <p className="ov2-fine">
            Movement in the {model.drivers.mode} net-income bridge
            ({model.drivers.fromLabel} → {model.drivers.toLabel}).
            Source: posted ledger categories — not AI inference.
          </p>
          <div className="ov2-drawer-actions">
            <button type="button" onClick={() => setLens(driver.label.toLowerCase().includes("revenue") ? "revenue" : "netIncome")}>
              View trend
            </button>
            <Link href={`/dash/financials?client=${model.client.id}&month=${cur.periodId}`}>
              See detail
            </Link>
            <button type="button" onClick={() => { setQuery(`Explain ${driver.label} in ${cur.label}`); setCmdOpen(true); }}>
              Ask Hathorn
            </button>
          </div>
        </aside>
      )}

      {cmdOpen && (
        <div className="ov2-cmd" role="dialog" aria-modal="true" aria-label="Ask Hathorn">
          <button type="button" className="ov2-cmd-scrim" aria-label="Close" onClick={() => setCmdOpen(false)} />
          <div className="ov2-cmd-panel">
            <div className="ov2-eyebrow">✦ Ask Hathorn</div>
            <p className="ov2-fine" style={{ margin: "6px 0 0" }}>
              {model.client.name} · {cur.label} · {meta.label}
            </p>
            <h2>What do you want to understand?</h2>
            <form onSubmit={(e) => { e.preventDefault(); window.location.href = askHref; }}>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Why did ${meta.label.toLowerCase()} move in ${cur.label}?`}
              />
            </form>
            <div className="ov2-cmd-suggest">
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => setQuery(s)}>{s}</button>
              ))}
              <Link className="ov2-btn-primary" href={askHref}>Open Ask Hathorn</Link>
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

function Delta({ compare }: { compare: { delta: number | null; deltaPct: number | null; points: number | null } }) {
  if (compare.points != null) {
    const up = compare.points >= 0;
    return <span className={`ov2-delta ${up ? "up" : "down"}`}>{up ? "↑" : "↓"} {Math.abs(compare.points).toFixed(1)} pts</span>;
  }
  if (compare.deltaPct == null) return <span className="ov2-delta flat">—</span>;
  const up = compare.deltaPct >= 0;
  return <span className={`ov2-delta ${up ? "up" : "down"}`}>{up ? "↑" : "↓"} {Math.abs(compare.deltaPct).toFixed(1)}%</span>;
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}
