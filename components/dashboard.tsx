"use client";
/**
 * The monthly statement.
 *
 * Five sections, each answering one question. Hathorn's typography and rhythm are
 * constant for every client; the client's own brand enters as an accent layer —
 * their mark in the masthead, their colours on rules, charts and emphasis.
 *
 * The commentary is set as editorial prose rather than dashboard callouts, because
 * the explanation is the product. Anyone can draw the chart.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import type { PeriodMetrics } from "@/lib/metrics";
import { LineChart, GroupedBars, StackedH, BulletBar } from "./charts";
import CommentThread from "./comment-thread";
import { buildPalette, onDarkVariant, initialsFrom } from "@/lib/brand";
import type { YoY, BudgetVariance, BalanceSheet, CashOutlook, ActionItem } from "@/lib/advisory";
import { buildComparison, ytdSummary, type ComparisonMode } from "@/lib/comparison";
import type { ComparabilityResult } from "@/lib/comparability";
import type { Confidence } from "@/lib/confidence";
import { ComparabilityNotice, ConfidenceBadge, ConfidencePanel, PerDayStrip, BandIndicator } from "./confidence-ui";
import { PeriodControls, ComparisonTable, YtdStrip } from "./comparison";

export type ClientMeta = {
  name: string; template: string; brandPrimary: string; brandAccent: string;
  logoText: string; logoSub: string; logoUrl?: string | null;
  targetLaborLo: number; targetLaborHi: number;
  /** Accounting firm that prepares the statement (tenant branding). */
  firmName?: string;
  reportFooter?: string;
  showPlatformMark?: boolean;
  /** Vertical-specific wording frozen into the portal experience. */
  language?: {
    revenueLabel?: string;
    directCostLabel?: string;
    laborRatioLabel?: string;
    laborQuestion?: string;
    laborGuidance?: string;
  };
};
export type GoalRow = { id: string; title: string; target: string; current: string; progress: number };

const fmt = (n: number) => {
  const s = n < 0 ? "−" : "";
  const v = Math.abs(n);
  return v >= 1000 ? `${s}$${(v / 1000).toFixed(2)}M` : `${s}$${v.toFixed(1)}K`;
};
const pct = (n: number) => `${n.toFixed(1)}%`;

/* ── Commentary ─────────────────────────────────────────────────────────── */

function Note({ tone, heading, body, lead }: { tone: string; heading: string; body: string; lead?: boolean }) {
  return (
    <div className={`note note-${tone} ${lead ? "note-lead" : ""}`}>
      <div className="note-head">{heading}</div>
      <div className="note-body">{body}</div>
    </div>
  );
}

/* ── KPI ────────────────────────────────────────────────────────────────── */

function KPI({ label, value, sub, tone = "n", detail }: {
  label: string; value: string; sub: string; tone?: "n" | "ok" | "bad" | "warn";
  detail?: { label: string; value: string }[];
}) {
  const [open, setOpen] = useState(false);
  // 34px figures clear the large-text bar, so they carry the client's exact colour.
  const color = tone === "ok" ? "var(--brand)"
    : tone === "bad" ? "var(--accent-deep)"
    : tone === "warn" ? "var(--accent-text)" : "var(--ink)";
  return (
    <div className={`kpi ${detail ? "kpi-tap" : ""}`}
      onClick={() => detail && setOpen(!open)}
      role={detail ? "button" : undefined}
      tabIndex={detail ? 0 : undefined}
      onKeyDown={(e) => detail && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOpen(!open))}
      aria-expanded={detail ? open : undefined}>
      <div className="eyebrow flex justify-between items-center">
        <span>{label}</span>
        {detail && <span style={{ color: "var(--ink-mute)", fontSize: 8 }}>{open ? "▲" : "▼"}</span>}
      </div>
      <div className="kpi-value" style={{ color }}>{value}</div>
      <div className="kpi-sub">{sub}</div>
      {open && detail && (
        <div className="kpi-drill">
          {detail.map((d, i) => (
            <div key={i} className="kpi-drill-row">
              <span style={{ color: "var(--ink-mute)" }}>{d.label}</span>
              <span style={{ fontWeight: 600 }} className="tnum">{d.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Panel({ title, sub, children, white }: {
  title?: string; sub?: string; children: React.ReactNode; white?: boolean;
}) {
  return (
    <div className={white ? "panel-white" : "panel"}>
      {title && <div className="panel-title">{title}</div>}
      {sub && <div className="panel-sub" style={{ marginBottom: 14 }}>{sub}</div>}
      {!sub && title && <div style={{ height: 14 }} />}
      {children}
    </div>
  );
}

function Section({ num, title, question, children }: {
  num: string; title: string; question: string; children: React.ReactNode;
}) {
  return (
    <section className="section">
      <div className="section-head">
        <span className="section-num">{num}</span>
        <h2 className="section-title">{title}</h2>
      </div>
      <p className="section-q">{question}</p>
      {children}
    </section>
  );
}

/* ── Main ───────────────────────────────────────────────────────────────── */

export type Advisory = {
  yoy: YoY; budget: BudgetVariance; balance: BalanceSheet;
  cash: CashOutlook; openActions: ActionItem[]; closedActions: ActionItem[];
  priorYearSeries: number[] | null;
};

export default function Dashboard({ client, periods, goals, selectedId, userRole = "CLIENT",
  allComments = [], advisoryByPeriod = {},
  comparabilityByPair = {}, confidenceByPeriod = {}, perDayByPeriod = {} }:
  { client: ClientMeta; periods: PeriodMetrics[]; goals: GoalRow[]; selectedId?: string;
    userRole?: string; allComments?: any[]; advisoryByPeriod?: Record<string, Advisory>;
    comparabilityByPair?: Record<string, ComparabilityResult>;
    confidenceByPeriod?: Record<string, Confidence>;
    perDayByPeriod?: Record<string, { days: number; revenuePerDay: number; hoursPerDay: number } | null> }) {
  const [periodId, setPeriodId] = useState(selectedId || periods[periods.length - 1]?.periodId);
  const [entityId, setEntityId] = useState<string>("ALL");
  const [mode, setMode] = useState<ComparisonMode>("PRIOR_MONTH");
  const [showConfidence, setShowConfidence] = useState(false);

  const idx = Math.max(periods.findIndex((p) => p.periodId === periodId), 0);
  const cur = periods[idx];
  const prev = idx > 0 ? periods[idx - 1] : null;
  const upTo = periods.slice(0, idx + 1);

  const advisory = advisoryByPeriod[periodId];

  const palette = useMemo(() => buildPalette(client), [client]);
  const markColor = useMemo(() => onDarkVariant(client.brandPrimary), [client.brandPrimary]);

  const view = useMemo(() => {
    if (entityId === "ALL" || !cur) return cur;
    const e = cur.entities.find((x) => x.id === entityId);
    if (!e) return cur;
    return { ...cur, revenue: e.revenue, directCost: e.directCost, grossProfit: e.grossProfit,
      grossMarginPct: e.grossMarginPct, opex: e.opex, netIncome: e.netIncome,
      netMarginPct: e.netMarginPct, laborPct: e.laborPct };
  }, [cur, entityId]);

  const budgetBasis = useMemo(() => {
    const b = advisory?.budget;
    if (!b?.available) return null;
    const find = (label: string) => b.lines.find((l) => l.label === label)?.budget ?? 0;
    return { revenue: find("Revenue"), directCost: find("Direct labor"),
             opex: find("Overhead"), netIncome: find("Net income") };
  }, [advisory]);

  const comparison = useMemo(
    () => (cur ? buildComparison(cur, periods, mode, budgetBasis, {
      laborTarget: { lo: client.targetLaborLo, hi: client.targetLaborHi },
      // The gate ran on the server, where period context is readable; the client looks
      // the verdict up rather than recomputing it.
      checkPair: (a, b, m) => comparabilityByPair[`${a.periodId}::${b.periodId}::${m}`]
        ?? { comparable: true, issues: [], reliability: 1 },
    }) : null),
    [cur, periods, mode, budgetBasis, comparabilityByPair, client.targetLaborLo, client.targetLaborHi]);

  const confidence = cur ? confidenceByPeriod[cur.periodId] : undefined;
  const perDay = cur ? perDayByPeriod[cur.periodId] : undefined;
  const basisPeriod = useMemo(() => {
    if (!cur) return null;
    if (mode === "PRIOR_MONTH") {
      const i = periods.findIndex((p) => p.periodId === cur.periodId);
      return i > 0 ? periods[i - 1] : null;
    }
    if (mode === "PRIOR_YEAR") {
      return periods.find((p) => p.year === cur.year - 1 && p.month === cur.month) ?? null;
    }
    return null;
  }, [cur, periods, mode]);
  const basisPerDay = basisPeriod ? perDayByPeriod[basisPeriod.periodId] : undefined;

  const ytd = useMemo(() => (cur ? ytdSummary(cur, periods) : null), [cur, periods]);

  // Which comparisons have a basis, so the picker can say so rather than failing silently.
  const availableModes = useMemo(() => {
    if (!cur) return {} as Record<ComparisonMode, boolean>;
    const idx = periods.findIndex((p) => p.periodId === cur.periodId);
    return {
      PRIOR_MONTH: idx > 0,
      PRIOR_YEAR: periods.some((p) => p.year === cur.year - 1 && p.month === cur.month),
      YTD: periods.some((p) => p.year === cur.year - 1 && p.month <= cur.month),
      BUDGET: Boolean(budgetBasis),
      NONE: true,
    } as Record<ComparisonMode, boolean>;
  }, [cur, periods, budgetBasis]);

  if (!cur) {
    return (
      <div className="sheet" style={{ paddingTop: 90, textAlign: "center" }}>
        <p className="display-l" style={{ color: "var(--ink-mute)" }}>No statements yet</p>
        <p className="caption" style={{ marginTop: 10 }}>
          Your first monthly statement will appear here once your advisor publishes it.
        </p>
      </div>
    );
  }

  const revSeries = upTo.map((p) =>
    entityId === "ALL" ? p.revenue : (p.entities.find((e) => e.id === entityId)?.revenue ?? 0));
  const labels = upTo.map((p) => p.label.split(" ")[0]);
  const revDelta = prev && prev.revenue ? ((cur.revenue - prev.revenue) / prev.revenue) * 100 : 0;
  const revLine = comparison?.available ? comparison.lines.find((l) => l.label === "Revenue") : null;

  const whatChanged = cur.notes.filter((n) => n.slot === "WHAT_CHANGED");
  const actions = cur.notes.filter((n) => n.slot === "ACTION");
  const activeEntities = cur.entities.filter((e) => e.status === "ACTIVE");
  const past90 = cur.ar.reduce((s, a) => s + a.b90p, 0);
  const current30 = cur.ar.reduce((s, a) => s + a.b0_30, 0);
  const threads = (slot: string) =>
    allComments.filter((c) => c.period_id === cur.periodId && c.metric_slot === slot);

  return (
    <div className={`tpl-${client.template}`} style={palette.vars as any}>
      {/* ── Masthead: client's mark, Hathorn's craft ─────────────────────── */}
      <header className="masthead">
        <div className="masthead-inner">
          <Link href={userRole === "CLIENT" ? "/portal" : "/"} aria-label="Home"
            className="flex items-center gap-4" style={{ textDecoration: "none", color: "inherit" }}>
            {client.logoUrl ? (
              <img src={client.logoUrl} alt="" width={150} height={38}
                style={{ height: 38, maxWidth: 150, objectFit: "contain" }} />
            ) : (
              <div style={{
                width: 38, height: 38, border: `1px solid ${markColor}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--display)", fontSize: 15, letterSpacing: ".04em", color: markColor,
              }}>{initialsFrom(client.logoText || client.name)}</div>
            )}
            <div>
              <div className="wordmark" style={{ color: markColor }}>{client.logoText}</div>
              {client.logoSub && <div className="wordmark-sub">{client.logoSub}</div>}
            </div>
          </Link>

          <div className="ml-auto flex items-center gap-3 flex-wrap">
            <div className="prepared-by hidden xl:block">
              {client.reportFooter || `Prepared by ${client.firmName || "your advisory firm"}`}
            </div>
            <div className="no-print flex items-center gap-3 flex-wrap">
              <ConfidenceBadge confidence={confidence} onOpen={() => setShowConfidence((v) => !v)} />
              <PeriodControls
                periods={periods} periodId={periodId} onPeriod={setPeriodId}
                mode={mode} onMode={setMode}
                entities={cur.entities.map((e) => ({ id: e.id, name: e.name }))}
                entityId={entityId} onEntity={setEntityId}
                availableModes={availableModes} />
              <a className="tag" style={{ cursor: "pointer", textDecoration: "none" }}
                href={`/api/portal/pdf?periodId=${encodeURIComponent(periodId)}`}
                title="Download the published release as PDF">
                Download PDF
              </a>
              <button type="button" className="tag" style={{ cursor: "pointer" }}
                onClick={() => window.print()} title="Print this page">
                Print
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="sheet">
        {/* ── Title block ────────────────────────────────────────────────── */}
        <div style={{ paddingTop: 52, paddingBottom: 30 }}>
          <div className="eyebrow" style={{ color: "var(--gold-label)" }}>
            {cur.status === "PUBLISHED" ? "Monthly Statement" : "Draft — not yet published"}
          </div>
          <h1 className="display-xl enter" style={{ marginTop: 10 }}>{cur.label}</h1>
          <p className="prose" style={{ marginTop: 10, maxWidth: 520 }}>
            {client.name}
            {activeEntities.length > 1 && ` · ${activeEntities.length} operating businesses`}
          </p>
          <hr className="rule-accent" style={{ marginTop: 22 }} />
          <ConfidencePanel confidence={confidence} open={showConfidence}
            onClose={() => setShowConfidence(false)} />
        </div>

        {/* ── Goals ──────────────────────────────────────────────────────── */}
        {goals.length > 0 && (
          <div className="grid sm:grid-cols-3 gap-x-8 gap-y-5">
            {goals.map((g) => (
              <div key={g.id} className="goal">
                <div className="eyebrow">{g.title}</div>
                <div className="flex justify-between items-baseline" style={{ marginTop: 8 }}>
                  <span className="tnum" style={{ fontFamily: "var(--display)", fontSize: 19 }}>{g.current}</span>
                  <span className="caption">target {g.target}</span>
                </div>
                <div className="goal-track"><div className="goal-fill" style={{ width: `${g.progress}%` }} /></div>
              </div>
            ))}
          </div>
        )}

        {/* ── 01 Overview ────────────────────────────────────────────────── */}
        <Section num="01" title="Overview" question="What happened this month, and why?">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4 enter enter-1">
            <KPI label="Cash on hand" value={fmt(cur.cash.total)}
              sub={`${fmt(cur.cash.operating)} operating · ${fmt(cur.cash.reserve)} reserve`}
              detail={[{ label: "Operating", value: fmt(cur.cash.operating) },
                       { label: "Reserve", value: fmt(cur.cash.reserve) }]} />
            <KPI label="Net income" value={fmt(view.netIncome)} sub={`${pct(view.netMarginPct)} net margin`}
              tone={view.netIncome >= 0 ? "ok" : "bad"}
              detail={[{ label: "Gross profit", value: fmt(view.grossProfit) },
                       { label: "Overhead", value: fmt(view.opex) },
                       { label: "Net", value: fmt(view.netIncome) }]} />
            <KPI label={client.language?.laborRatioLabel || "Labor ratio"} value={pct(view.laborPct)}
              sub={`Healthy band ${client.targetLaborLo}–${client.targetLaborHi}%`}
              // Both sides of the band are wrong. Below it usually means hours were not
              // delivered as billed, or costs are landing in the wrong account.
              tone={view.laborPct > client.targetLaborHi || view.laborPct < client.targetLaborLo ? "bad" : "ok"}
              detail={[{ label: "Direct labor", value: fmt(view.directCost) },
                       { label: "Revenue", value: fmt(view.revenue) },
                       { label: "Healthy band", value: `${client.targetLaborLo}–${client.targetLaborHi}%` }]} />
            <KPI label={client.language?.revenueLabel || "Revenue"} value={fmt(view.revenue)}
              sub={revLine ? `${revLine.deltaPct !== null && revLine.deltaPct >= 0 ? "▲" : "▼"} ${
                     revLine.deltaPct === null ? "—" : Math.abs(revLine.deltaPct).toFixed(1) + "%"
                   } vs ${comparison!.basisLabel}`
                 : "No comparison selected"}
              tone={!revLine ? "n"
                : revLine.deltaPct === null ? "n"
                : revLine.deltaPct < -10 ? "bad" : revLine.deltaPct > 0 ? "ok" : "n"}
              detail={[
                ...cur.entities.map((e) => ({ label: e.name, value: fmt(e.revenue) })),
                ...(revLine ? [{ label: comparison!.basisLabel, value: fmt(revLine.basis) }] : []),
              ]} />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 no-print" style={{ marginTop: 6 }}>
            {["CASH", "NET_INCOME", "LABOR_RATIO", "REVENUE"].map((slot) => (
              <CommentThread key={slot} periodId={cur.periodId} metricSlot={slot}
                initialComments={threads(slot)} userRole={userRole} />
            ))}
          </div>

          {/* Commentary leads — it is the reason the statement exists. */}
          {whatChanged.length > 0 && (
            <div className="enter-late" style={{ marginTop: 40, maxWidth: 700 }}>
              <div className="eyebrow" style={{ marginBottom: 14 }}>What changed</div>
              {whatChanged.map((n, i) => <Note key={n.id} {...n} lead={i === 0} />)}
            </div>
          )}

          <div style={{ marginTop: 36 }}>
            <Panel title="Revenue trend"
              sub={entityId === "ALL" ? "All businesses · monthly"
                : cur.entities.find((e) => e.id === entityId)?.name}>
              <LineChart points={revSeries} labels={labels} accentLast={prev ? revDelta < -10 : false}
                compare={advisory?.priorYearSeries
                  ? { points: advisory.priorYearSeries, label: `${cur.year - 1}` } : undefined} />
              {advisory?.priorYearSeries && (
                <div className="flex flex-wrap gap-x-5 gap-y-1" style={{ marginTop: 10 }}>
                  <span className="caption inline-flex items-center gap-2">
                    <i style={{ width: 14, height: 2, display: "inline-block", background: "var(--brand)" }} />
                    {cur.year}
                  </span>
                  <span className="caption inline-flex items-center gap-2">
                    <i style={{ width: 14, height: 0, borderTop: "1.5px dashed var(--ink-mute)", display: "inline-block" }} />
                    {cur.year - 1}
                  </span>
                </div>
              )}
            </Panel>
          </div>

          {entityId === "ALL" && (
            <div className="grid md:grid-cols-3 gap-x-8 gap-y-5" style={{ marginTop: 32 }}>
              {cur.entities.map((e) => (
                <div key={e.id} style={{ borderTop: "1px solid var(--hairline)", paddingTop: 14 }}>
                  <div className="flex justify-between items-start" style={{ marginBottom: 12 }}>
                    <span style={{ fontFamily: "var(--display)", fontSize: 17 }}>{e.name}</span>
                    <span className="tag" style={{
                      color: e.status === "ACTIVE" ? "var(--brand-text)" : "var(--accent-text)",
                    }}>{e.status === "ACTIVE" ? "Active" : "Startup"}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[["Revenue", fmt(e.revenue)],
                      ["Net", fmt(e.netIncome)],
                      ["Labor", e.revenue ? pct(e.laborPct) : "—"]].map(([k, v], i) => (
                      <div key={k}>
                        <div className="eyebrow" style={{ fontSize: 8.5 }}>{k}</div>
                        <div className="tnum" style={{
                          fontFamily: "var(--utility)", fontSize: 13, fontWeight: 600, marginTop: 3,
                          color: (i === 1 && e.netIncome < 0) ||
                                 (i === 2 && e.revenue > 0 && e.laborPct > client.targetLaborHi)
                            ? "var(--accent-text)" : "var(--ink)",
                        }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── Comparison ─────────────────────────────────────────────────── */}
        {mode !== "NONE" && comparison && (
          <Section num="02" title="Compared"
            question={`How does ${comparison.currentLabel} read against ${comparison.basisLabel || "the chosen basis"}?`}>
            <ComparabilityNotice result={comparison.comparability} suppressed={!comparison.available} />
            <ComparisonTable comparison={comparison} />
            {comparison.available && (
              <>
                <p className="caption" style={{ marginTop: 14, maxWidth: 640 }}>
                  Green is the direction you want, which is not always up: overhead falling is
                  favourable, revenue falling is not, and a labor ratio has a floor as well as a
                  ceiling. Movements too small to matter are shown as flat rather than dressed
                  up. Percentage lines move in points.
                </p>
                {comparison.issues.some((i) => i.code.startsWith("period_length")) && (
                  <PerDayStrip
                    perDay={perDay}
                    basisPerDay={basisPerDay}
                    basisLabel={comparison.basisLabel} />
                )}
              </>
            )}
          </Section>
        )}

        {/* ── Year to date ───────────────────────────────────────────────── */}
        {ytd?.available && ytd.monthCount > 1 && (
          <Section num="03" title="Year to Date"
            question={`Where does ${cur.year} stand ${ytd.monthCount} months in?`}>
            <YtdStrip ytd={ytd} year={cur.year} />
          </Section>
        )}

        {/* ── Plan ───────────────────────────────────────────────────────── */}
        {advisory?.budget.available && (
          <Section num="04" title="Against Plan" question="You agreed a number. Did you hit it?">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>{cur.label}</th>
                  <th>Actual</th><th>Budget</th><th>Variance</th><th>%</th>
                </tr>
              </thead>
              <tbody>
                {advisory.budget.lines.map((l) => (
                  <tr key={l.label}>
                    <td>{l.label}</td>
                    <td>{fmt(l.actual)}</td>
                    <td style={{ color: "var(--ink-mute)" }}>{fmt(l.budget)}</td>
                    <td style={{ color: l.favourable ? "var(--brand-text)" : "var(--accent-text)" }}>
                      {l.variance >= 0 ? "+" : ""}{fmt(l.variance)}
                    </td>
                    <td style={{ color: l.favourable ? "var(--brand-text)" : "var(--accent-text)" }}>
                      {l.variancePct === null ? "—" : `${l.variancePct >= 0 ? "+" : ""}${l.variancePct.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {advisory.budget.ytd.length > 0 && (
              <>
                <div className="eyebrow" style={{ marginTop: 30, marginBottom: 10 }}>Year to date</div>
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Through {cur.label}</th>
                      <th>Actual</th><th>Budget</th><th>Variance</th><th>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {advisory.budget.ytd.map((l) => (
                      <tr key={l.label}>
                        <td>{l.label}</td>
                        <td>{fmt(l.actual)}</td>
                        <td style={{ color: "var(--ink-mute)" }}>{fmt(l.budget)}</td>
                        <td style={{ color: l.favourable ? "var(--brand-text)" : "var(--accent-text)" }}>
                          {l.variance >= 0 ? "+" : ""}{fmt(l.variance)}
                        </td>
                        <td style={{ color: l.favourable ? "var(--brand-text)" : "var(--accent-text)" }}>
                          {l.variancePct === null ? "—" : `${l.variancePct >= 0 ? "+" : ""}${l.variancePct.toFixed(1)}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </Section>
        )}

        {/* ── Payroll & Labor ─────────────────────────────────────────────── */}
        <Section num={advisory?.budget.available ? "05" : "04"}
          title={client.language?.directCostLabel || "Payroll & Labor"}
          question={client.language?.laborQuestion || "You buy hours at one price and sell them at another. How wide is the gap?"}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4">
            <KPI label="Total payroll" value={fmt(cur.totalPayroll)} sub={`${pct(cur.laborPct)} of revenue`} />
            <KPI label="Overtime premium" value={fmt(cur.otPremium)} sub="The quiet leak"
              tone={cur.otPremium > 0 ? "warn" : "n"} />
            <KPI label="Gross profit" value={fmt(view.grossProfit)} sub={`${pct(view.grossMarginPct)} gross margin`} tone="ok" />
            <KPI label="Overhead" value={fmt(view.opex)} sub="Below the line" />
          </div>
          <div className="grid lg:grid-cols-2 gap-6" style={{ marginTop: 32 }}>
            <Panel title="Labor ratio vs healthy band"
              sub="Both sides of the band are a problem, for different reasons">
              {activeEntities.filter((e) => e.revenue > 0).map((e) => (
                <BulletBar key={e.id} label={e.name} value={e.laborPct}
                  bandLo={client.targetLaborLo} bandHi={client.targetLaborHi} />
              ))}
            </Panel>
            <Panel title="Where payroll goes" sub={`${cur.label} composition`}>
              <StackedH
                rows={[{ label: "Payroll", sub: `${fmt(cur.totalPayroll)} total`,
                  values: [
                    cur.entities.reduce((s, e) => s + e.payroll.wages, 0),
                    cur.entities.reduce((s, e) => s + e.payroll.otPremium, 0),
                    cur.entities.reduce((s, e) => s + e.payroll.taxes, 0),
                    cur.entities.reduce((s, e) => s + e.payroll.workersComp, 0),
                    cur.entities.reduce((s, e) => s + e.payroll.processing, 0),
                  ] }]}
                colors={["var(--brand)", "var(--accent)", "var(--brand-deep)", "#A89F92", "#CFC8BC"]}
                legend={["Wages", "Overtime premium", "Employer taxes", "Workers' comp", "Processing"]} />
            </Panel>
          </div>
        </Section>

        {/* ── 03 Volume ──────────────────────────────────────────────────── */}
        <Section num={advisory?.budget.available ? "06" : "05"} title="Volume Drivers" question="What actually moved the revenue line?">
          <div className="grid lg:grid-cols-2 gap-6">
            <Panel title="Revenue by business" sub="$K by month">
              <GroupedBars
                series={activeEntities.map((e) => upTo.map((p) => p.entities.find((x) => x.id === e.id)?.revenue ?? 0))}
                labels={labels} colors={["var(--brand)", "var(--accent)", "#A89F92"]} />
              <div className="flex flex-wrap gap-x-5 gap-y-1" style={{ marginTop: 10 }}>
                {activeEntities.map((e, i) => (
                  <span key={e.id} className="caption inline-flex items-center gap-2">
                    <i style={{ width: 9, height: 9, display: "inline-block",
                      background: ["var(--brand)", "var(--accent)", "#A89F92"][i] }} />
                    {e.name}
                  </span>
                ))}
              </div>
            </Panel>
            <Panel title="Hours delivered" sub="From the payroll register">
              <GroupedBars
                series={[upTo.map((p) => p.entities.reduce((s, e) => s + e.payroll.hoursPaid, 0))]}
                labels={labels} colors={["var(--brand)"]} prefix="" />
            </Panel>
          </div>
        </Section>

        {/* ── 04 Cash & Collections ──────────────────────────────────────── */}
        <Section num={advisory?.budget.available ? "07" : "06"} title="Cash &amp; Collections" question="Where is the money, and who still owes you?">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4">
            <KPI label="Bank balance" value={fmt(cur.cash.total)} sub="Operating plus reserve" />
            <KPI label="Receivables" value={fmt(cur.arTotal)} sub={`${cur.ar.length} payer groups`} />
            <KPI label="Past 90 days" value={fmt(past90)} sub="Work these first"
              tone={past90 > 0 ? "warn" : "ok"} />
            <KPI label="Current to 30" value={fmt(current30)} sub="Healthy bucket" tone="ok" />
          </div>
          <div style={{ marginTop: 32 }}>
            <Panel title="Receivables by payer" sub="Current–30 · 31–60 · 61–90 · 90+ days">
              <StackedH
                rows={cur.ar.map((a) => ({ label: a.payer, sub: `${fmt(a.total)} outstanding`,
                  values: [a.b0_30, a.b31_60, a.b61_90, a.b90p] }))}
                colors={["var(--brand)", "var(--brand-deep)", "var(--accent)", "var(--accent-deep)"]}
                legend={["Current–30", "31–60", "61–90", "90+"]} />
            </Panel>
          </div>
          {advisory?.cash && (
            <div style={{ marginTop: 32 }}>
              <Panel title="Thirteen-week cash outlook"
                sub="Projected from collections by ageing bucket against payroll and overhead">
                <div className="grid grid-cols-3 gap-x-8" style={{ marginBottom: 18 }}>
                  <div>
                    <div className="eyebrow">Weeks of cover</div>
                    <div className="kpi-value tnum" style={{ fontSize: 24 }}>
                      {advisory.cash.weeksOfCover?.toFixed(1) ?? "—"}
                    </div>
                  </div>
                  <div>
                    <div className="eyebrow">Lowest point</div>
                    <div className="kpi-value tnum" style={{ fontSize: 24,
                      color: advisory.cash.goesNegative ? "var(--accent-text)" : "var(--ink)" }}>
                      {fmt(advisory.cash.lowestBalance)}
                    </div>
                    <div className="kpi-sub">week {advisory.cash.lowestWeek}</div>
                  </div>
                  <div>
                    <div className="eyebrow">Outlook</div>
                    <div className="kpi-value" style={{ fontSize: 18,
                      color: advisory.cash.goesNegative ? "var(--accent-text)" : "var(--brand-text)" }}>
                      {advisory.cash.goesNegative ? "Shortfall projected" : "Stays positive"}
                    </div>
                  </div>
                </div>
                <LineChart
                  points={advisory.cash.weeks.map((w) => w.balance)}
                  labels={advisory.cash.weeks.map((w) => w.label)}
                  accentLast={advisory.cash.goesNegative} height={190} />
                <p className="caption" style={{ marginTop: 12 }}>
                  A projection, not a forecast of certainty. Collections assume 92% of current
                  balances land within four weeks and 40% of balances past ninety days are
                  recovered at all.
                </p>
              </Panel>
            </div>
          )}

          {actions.length > 0 && (
            <div style={{ marginTop: 40, maxWidth: 700 }}>
              <div className="eyebrow" style={{ marginBottom: 14 }}>What to do before next month</div>
              {actions.map((n) => <Note key={n.id} {...n} />)}
            </div>
          )}
        </Section>

        {/* ── Balance sheet ──────────────────────────────────────────────── */}
        {advisory?.balance.available && (
          <Section num={advisory?.budget.available ? "08" : "07"} title="Position"
            question="What do you own, what do you owe, and can you service it?">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4">
              <KPI label="Working capital" value={fmt(advisory.balance.workingCapital)}
                sub="Current assets less current liabilities"
                tone={advisory.balance.workingCapital >= 0 ? "ok" : "bad"} />
              <KPI label="Current ratio"
                value={advisory.balance.currentRatio?.toFixed(2) ?? "—"}
                sub="Healthy above 1.50"
                tone={(advisory.balance.currentRatio ?? 0) >= 1.5 ? "ok"
                  : (advisory.balance.currentRatio ?? 0) >= 1 ? "warn" : "bad"} />
              <KPI label="Debt to equity"
                value={advisory.balance.debtToEquity?.toFixed(2) ?? "—"}
                sub="Lower is less leveraged"
                tone={(advisory.balance.debtToEquity ?? 0) <= 2 ? "ok" : "warn"} />
              <KPI label="Debt service coverage"
                value={advisory.balance.debtServiceCoverage?.toFixed(2) ?? "—"}
                sub="Lenders look for 1.25 or better"
                tone={advisory.balance.debtServiceCoverage === null ? "n"
                  : advisory.balance.debtServiceCoverage >= 1.25 ? "ok" : "bad"} />
            </div>
            <div style={{ marginTop: 30 }}>
              <table className="ledger-table">
                <thead>
                  <tr><th style={{ textAlign: "left" }}>Balance sheet</th><th>{cur.label}</th></tr>
                </thead>
                <tbody>
                  {([
                    ["Current assets", advisory.balance.currentAssets],
                    ["Fixed assets", advisory.balance.fixedAssets],
                    ["Total assets", advisory.balance.totalAssets],
                    ["Current liabilities", advisory.balance.currentLiabilities],
                    ["Long-term liabilities", advisory.balance.longTermLiabilities],
                    ["Total liabilities", advisory.balance.totalLiabilities],
                    ["Equity", advisory.balance.equity],
                  ] as [string, number][]).map(([label, v]) => (
                    <tr key={label}><td>{label}</td><td>{fmt(v)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* ── Open commitments ───────────────────────────────────────────── */}
        {(advisory?.openActions.length || advisory?.closedActions.length) ? (
          <Section num={advisory?.budget.available ? "09" : "08"} title="Open Commitments"
            question="What did we agree to last time, and where does it stand?">
            {advisory.openActions.length > 0 ? (
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Action</th>
                    <th>Owner</th><th>Raised</th><th>Open</th><th>Est. impact</th>
                  </tr>
                </thead>
                <tbody>
                  {advisory.openActions.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <span style={{ color: "var(--ink)", fontFamily: "var(--editorial)" }}>{a.title}</span>
                        {a.detail && <div className="caption" style={{ marginTop: 3 }}>{a.detail}</div>}
                      </td>
                      <td>{a.owner || "—"}</td>
                      <td>{a.openedLabel}</td>
                      <td style={{ color: a.monthsOpen >= 3 ? "var(--accent-text)" : "var(--ink)" }}>
                        {a.monthsOpen === 0 ? "New" : `${a.monthsOpen} mo`}
                      </td>
                      <td>{a.impact ? fmt(a.impact) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="prose">Nothing outstanding from previous months.</p>
            )}
            {advisory.closedActions.length > 0 && (
              <div style={{ marginTop: 26 }}>
                <div className="eyebrow" style={{ marginBottom: 10 }}>Closed this month</div>
                {advisory.closedActions.map((a) => (
                  <div key={a.id} className="note note-info">
                    <div className="note-head">{a.title}</div>
                    <div className="note-body">Raised {a.openedLabel}. {a.detail}</div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        ) : null}

        {/* ── 05 Businesses ──────────────────────────────────────────────── */}
        <Section num={advisory?.budget.available ? "10" : "09"} title="Businesses" question="Which business is carrying which?">
          <table className="ledger-table">
            <thead>
              <tr>
                <th />
                {cur.entities.map((e) => <th key={e.id}>{e.name}</th>)}
                <th>Consolidated</th>
              </tr>
            </thead>
            <tbody>
              {([
                ["Revenue", (e: any) => fmt(e.revenue), fmt(cur.revenue)],
                ["Gross margin", (e: any) => e.revenue ? pct(e.grossMarginPct) : "—", pct(cur.grossMarginPct)],
                ["Net margin", (e: any) => e.revenue ? pct(e.netMarginPct) : "—", pct(cur.netMarginPct)],
                ["Labor ratio", (e: any) => e.revenue ? pct(e.laborPct) : "—", pct(cur.laborPct)],
                ["Net income", (e: any) => fmt(e.netIncome), fmt(cur.netIncome)],
              ] as any[]).map(([label, f, cons]) => (
                <tr key={label}>
                  <td>{label}</td>
                  {cur.entities.map((e) => <td key={e.id}>{f(e)}</td>)}
                  <td>{cons}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <footer style={{ marginTop: 72, paddingTop: 22, borderTop: "1px solid var(--hairline)" }}>
          <div className="flex justify-between items-baseline flex-wrap gap-3" style={{ marginBottom: 16 }}>
            <span className="eyebrow">{client.firmName || "Advisory firm"}</span>
            <span className="caption">{client.name} · {cur.label}</span>
          </div>
          <p className="caption" style={{ maxWidth: 640, lineHeight: 1.6 }}>
            Prepared from records provided by management. These statements are management-prepared
            and have not been audited, reviewed or compiled by {client.firmName || "your advisory firm"}, and no
            assurance is expressed on them. Figures are stated in thousands unless noted.
            The thirteen-week cash outlook is a projection based on stated assumptions and
            actual results will differ.
            {client.showPlatformMark !== false && (
              <> Powered by Hathorn Dashboard.</>
            )}
          </p>
        </footer>
      </main>
    </div>
  );
}
