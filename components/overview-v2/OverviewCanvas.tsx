"use client";
/**
 * 6-3-1 Client Intelligence — vitals, three answers, one recommendation.
 * Presentation only; ledger math stays in overview-v2/build.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OverviewLens, OverviewV2Model } from "@/lib/overview-v2/build";
import type { AudienceMode } from "@/lib/overview-v2/intelligence-config";
import HeroChart, { LENS_META, fmtMoney, fmtVal } from "./HeroChart";
import ExpenseDonut from "./ExpenseDonut";
import NumberInspect, { inspectFromLens, type InspectTarget } from "./NumberInspect";
import "./overview-v2.css";

export type { AudienceMode };

type DriverSel = { label: string; delta: number; kind: string } | null;
type CompareMode = "PRIOR_YEAR" | "PRIOR_MONTH" | "NONE";

const SOURCE_BADGE: Record<OverviewV2Model["recommendation"]["source"], string> = {
  advisor_note: "Advisor note",
  deterministic_signal: "Deterministic signal",
  plan_variance: "Plan variance",
};

export default function OverviewCanvas({ model }: { model: OverviewV2Model }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [lens, setLens] = useState<OverviewLens>("revenue");
  const [range, setRange] = useState<"6M" | "12M" | "24M" | "YTD" | "ALL">("12M");
  const [compareMode, setCompareMode] = useState<CompareMode>(
    model.intelligence.compareDefault === "PRIOR_MONTH" ? "PRIOR_MONTH" : "PRIOR_YEAR",
  );
  const [audience, setAudience] = useState<AudienceMode>("advisor");
  const [cmdOpen, setCmdOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [driver, setDriver] = useState<DriverSel>(null);
  const [inspect, setInspect] = useState<InspectTarget | null>(null);
  const [depthOpen, setDepthOpen] = useState(false);

  const cur = model.cur;
  const meta = LENS_META[lens];
  const heroValue = cur[lens];
  const isClient = audience === "client";

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
        setInspect(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const suggestions = useMemo(() => {
    const m = meta.label.toLowerCase();
    if (isClient) {
      return [
        `What changed in ${cur.label}?`,
        "What should I watch next month?",
        `How is cash looking in ${cur.label}?`,
      ];
    }
    return [
      `Why did ${m} move in ${cur.label}?`,
      "What should I discuss with the client?",
      `Explain cash in ${cur.label}`,
      "Where are the largest variances?",
    ];
  }, [meta.label, cur.label, isClient]);

  const compareLabel = compareMode === "PRIOR_YEAR"
    ? `vs ${model.priorYear?.label ?? "prior year"}`
    : compareMode === "PRIOR_MONTH" ? "vs prior month" : "";

  const openVital = (v: OverviewV2Model["vitals"][number]) => {
    if (v.lens) setLens(v.lens);
    setInspect({
      key: v.key,
      label: isClient ? v.clientLabel : v.label,
      formatted: v.formatted,
      value: v.value,
      unit: v.unit,
      lens: v.lens,
      delta: v.delta,
      tone: v.tone,
    });
  };

  const openHeroInspect = () => {
    const vital = model.vitals.find((v) => v.lens === lens);
    const label = vital
      ? (isClient ? vital.clientLabel : vital.label)
      : meta.label;
    setInspect({
      ...inspectFromLens(lens, model, label),
      delta: vital?.delta ?? null,
      tone: vital?.tone ?? "flat",
    });
  };

  const inspectCompare = inspect?.lens
    ? (compareMode === "PRIOR_MONTH"
      ? model.compare.priorMonth[inspect.lens]
      : compareMode === "PRIOR_YEAR"
        ? model.compare.priorYear[inspect.lens]
        : { delta: null, deltaPct: null, points: null })
    : { delta: null, deltaPct: null, points: null };

  const answerTitles = isClient
    ? {
        whatChanged: "What changed",
        needsAttention: "What to watch",
        happensNext: "What comes next",
      }
    : {
        whatChanged: model.answers.whatChanged.title,
        needsAttention: model.answers.needsAttention.title,
        happensNext: model.answers.happensNext.title,
      };

  const attentionItems = model.answers.needsAttention.items.map((item) => {
    if (!isClient || !model.agedAr) return item;
    if (item.label === model.agedAr.label) {
      return { ...item, label: "Collections", detail: model.agedAr.clientLabel };
    }
    return item;
  });

  const showBudgetCompare = model.plan.budgetAvailable || model.budget.available;

  return (
    <div className="ov2 ov2-paper">
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
              <span className="ov2-industry">{model.intelligence.industryLabel}</span>
            </div>
            <PeriodScrubber periods={model.periods} activeId={cur.periodId} onSelect={selectPeriod} />
          </div>
          <div className="ov2-period-tools">
            <div className="ov2-audience" role="group" aria-label="Audience">
              <button
                type="button"
                className={!isClient ? "on" : ""}
                onClick={() => setAudience("advisor")}
              >
                Advisor
              </button>
              <button
                type="button"
                className={isClient ? "on" : ""}
                onClick={() => setAudience("client")}
              >
                Client view
              </button>
            </div>
            <button type="button" aria-label="Previous period" onClick={() => stepPeriod(-1)} disabled={idx <= 0}>‹</button>
            <button type="button" className="ov2-period-current">{cur.label}</button>
            <button type="button" aria-label="Next period" onClick={() => stepPeriod(1)} disabled={idx >= model.periods.length - 1}>›</button>
            <select
              className="ov2-compare"
              value={compareMode}
              aria-label="Compare to"
              onChange={(e) => setCompareMode(e.target.value as CompareMode)}
            >
              <option value="PRIOR_YEAR" disabled={!model.priorYear}>Actual · Prior year</option>
              <option value="PRIOR_MONTH" disabled={!model.priorMonth}>Actual · Prior month</option>
              <option value="NONE">Actual only</option>
            </select>
            {showBudgetCompare && (
              <span className="ov2-budget-flag" title="Budget series available on revenue chart">
                Budget on chart
              </span>
            )}
          </div>
        </div>

        {/* 6 vitals */}
        <section className="ov2-vitals" aria-label="Six vitals">
          {model.vitals.map((v) => {
            const on = v.lens != null && v.lens === lens;
            return (
              <button
                key={v.key}
                type="button"
                className={`ov2-vital${on ? " on" : ""}`}
                onClick={() => openVital(v)}
              >
                <span className="ov2-eyebrow">{isClient ? v.clientLabel : v.label}</span>
                <span className="ov2-vital-v tnum">{v.formatted}</span>
                {v.delta && (
                  <span className={`ov2-vital-d is-${v.tone}`}>{v.delta}</span>
                )}
              </button>
            );
          })}
        </section>

        <div className="ov2-body ov2-body-single">
          <main className="ov2-canvas">
            {/* Primary story */}
            <section className="ov2-chart-block">
              <div className="ov2-chart-head">
                <div>
                  <div className="ov2-eyebrow">Primary story · {meta.label}</div>
                  <button
                    type="button"
                    className="ov2-hero-value tnum"
                    onClick={openHeroInspect}
                    aria-label={`Inspect ${meta.label}`}
                  >
                    {fmtVal(heroValue, meta.unit)}
                  </button>
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

              <HeroChart
                periods={model.periods}
                lens={lens}
                activePeriodId={cur.periodId}
                showPriorYear={compareMode === "PRIOR_YEAR"}
                showBudget={lens === "revenue" && showBudgetCompare}
                range={range}
              />
            </section>

            {/* 3 answers */}
            <section className="ov2-answers" aria-label="Three answers">
              <AnswerColumn
                title={answerTitles.whatChanged}
                body={isClient ? model.answers.whatChanged.body : model.answers.whatChanged.body}
                items={model.answers.whatChanged.items}
              />
              <AnswerColumn
                title={answerTitles.needsAttention}
                body={attentionItems[0]?.detail ?? model.answers.needsAttention.body}
                items={attentionItems}
              />
              <AnswerColumn
                title={answerTitles.happensNext}
                body={model.answers.happensNext.body}
                items={model.answers.happensNext.items}
              />
            </section>

            {/* 1 recommendation */}
            <section className="ov2-recommend" aria-label="Hathorn recommends">
              <div className="ov2-recommend-head">
                <div className="ov2-eyebrow">Hathorn recommends</div>
                <span className={`ov2-source-badge source-${model.recommendation.source}`}>
                  {SOURCE_BADGE[model.recommendation.source]}
                </span>
                {model.recommendation.readyForClient && (
                  <span className="ov2-source-badge source-ready">Ready for client</span>
                )}
              </div>
              <h2>{model.recommendation.headline}</h2>
              <p>{isClient && !model.recommendation.readyForClient
                ? "Your advisor is refining this recommendation for the monthly conversation."
                : model.recommendation.body}</p>
            </section>

            {/* Progressive depth */}
            <section className="ov2-depth">
              <button
                type="button"
                className="ov2-depth-toggle"
                aria-expanded={depthOpen}
                onClick={() => setDepthOpen((o) => !o)}
              >
                <span className="ov2-eyebrow">Progressive depth</span>
                <strong>{depthOpen ? "Hide drivers & mix" : "Show drivers, expense mix & plan"}</strong>
              </button>

              {depthOpen && (
                <div className="ov2-depth-body">
                  <div className="ov2-bottom-grid">
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
                  </div>

                  {(model.plan.budgetAvailable || model.plan.priorYearAvailable || model.plan.forecastHint) && (
                    <div className="ov2-plan-strip" aria-label="Plan vs reality">
                      <div className="ov2-eyebrow">Plan vs reality</div>
                      <div className="ov2-plan-grid">
                        {model.plan.budgetAvailable && model.plan.budgetRevenue != null && (
                          <div>
                            <span>Budget revenue</span>
                            <strong className="tnum">{fmtMoney(model.plan.budgetRevenue)}</strong>
                            {model.plan.budgetVariance != null && (
                              <em className={model.plan.budgetVariance >= 0 ? "is-up" : "is-down"}>
                                {model.plan.budgetVariance >= 0 ? "+" : "−"}
                                {fmtMoney(Math.abs(model.plan.budgetVariance))}
                                {model.plan.budgetVariancePct != null
                                  ? ` (${model.plan.budgetVariancePct >= 0 ? "+" : ""}${model.plan.budgetVariancePct.toFixed(1)}%)`
                                  : ""}
                              </em>
                            )}
                          </div>
                        )}
                        {model.plan.priorYearAvailable && model.priorYear && (
                          <div>
                            <span>Prior year · {model.priorYear.label}</span>
                            <strong className="tnum">{fmtMoney(model.priorYear.revenue)}</strong>
                            <em>Revenue basis</em>
                          </div>
                        )}
                        {model.plan.forecastHint && (
                          <div>
                            <span>Cash outlook</span>
                            <strong>{model.plan.forecastHint}</strong>
                            {model.plan.cashGoesNegative && model.plan.cashLowestWeek != null && (
                              <em className="is-down">Projected negative around week {model.plan.cashLowestWeek}</em>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          </main>
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

      {inspect && (
        <NumberInspect
          target={inspect}
          model={model}
          compare={inspectCompare}
          compareLabel={compareLabel}
          onClose={() => setInspect(null)}
          onSeeTrend={(l) => setLens(l)}
          onAsk={(prompt) => {
            setQuery(prompt);
            setInspect(null);
            setCmdOpen(true);
          }}
          onOpenDrivers={() => {
            setInspect(null);
            setDepthOpen(true);
            const first = model.drivers.netIncome.find((d) => d.kind === "down" || d.kind === "up");
            if (first) setDriver(first);
          }}
        />
      )}

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

function AnswerColumn({
  title, body, items,
}: {
  title: string;
  body: string;
  items: { label: string; detail: string; tone: "up" | "down" | "flat" }[];
}) {
  return (
    <article className="ov2-answer">
      <div className="ov2-eyebrow">{title}</div>
      <p className="ov2-answer-body">{body}</p>
      <ul>
        {items.map((it) => (
          <li key={`${it.label}-${it.detail.slice(0, 24)}`}>
            <span className={`ov2-tone-dot is-${it.tone}`} aria-hidden />
            <div>
              <strong>{it.label}</strong>
              <em>{it.detail}</em>
            </div>
          </li>
        ))}
      </ul>
    </article>
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
