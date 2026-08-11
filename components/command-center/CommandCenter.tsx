"use client";

/**
 * Hathorn Command Center — premium financial intelligence surface.
 * Hathorn palette only. Data should feel alive.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  CornersOut,
  Crosshair,
  MagicWand,
  Question,
  Sparkle,
  ChartLine,
  X,
} from "@phosphor-icons/react";
import IntelligenceChart from "./IntelligenceChart";
import VarianceWaterfall from "./VarianceWaterfall";
import ContributionTable from "./ContributionTable";
import CommandPalette from "./CommandPalette";
import { AnimatedNumber, MicroSpark } from "./MotionBits";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { CCDriver, CCLens, CommandCenterModel } from "@/lib/command-center/model";
import { LENS_META } from "@/lib/command-center/model";
import { askContext, deltaPct, fmtMoney, fmtVal, seriesFor } from "@/lib/command-center/intelligence";
import { cn } from "@/lib/utils";
import "./command-center.css";

type Range = "6M" | "12M" | "24M" | "YTD" | "ALL";
type SeriesMode = "actual" | "prior" | "budget" | "all";

export default function CommandCenter({ model }: { model: CommandCenterModel }) {
  const [, startTransition] = useTransition();
  const [periodId, setPeriodId] = useState(model.periodId);
  const [lens, setLens] = useState<CCLens>("revenue");
  const [range, setRange] = useState<Range>("12M");
  const [seriesMode, setSeriesMode] = useState<SeriesMode>("all");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [driver, setDriver] = useState<CCDriver | null>(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [askQ, setAskQ] = useState("");
  const [showBand, setShowBand] = useState(true);
  const [showAnomalies, setShowAnomalies] = useState(true);
  const [brushZoom, setBrushZoom] = useState(false);
  const [focus, setFocus] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [explainPoint, setExplainPoint] = useState<string | null>(null);

  const idx = model.periods.findIndex((p) => p.id === periodId);
  const cur = model.periods[idx] ?? model.periods[model.periods.length - 1];
  const meta = LENS_META[lens];
  const heroValue = Number(cur[meta.key]);

  const sliced = useMemo(() => {
    const end = idx + 1;
    if (range === "ALL") return model.periods.slice(0, end);
    if (range === "YTD") return model.periods.filter((p, i) => p.year === cur.year && i <= idx);
    const n = range === "6M" ? 6 : range === "24M" ? 24 : 12;
    return model.periods.slice(Math.max(0, end - n), end);
  }, [model.periods, idx, range, cur.year]);

  const priorYear = model.periods.find((p) => p.month === cur.month && p.year === cur.year - 1);
  const priorVal = priorYear ? Number(priorYear[meta.key]) : null;
  const dPct = deltaPct(heroValue, priorVal);

  const suggestions = useMemo(
    () => askContext(model, lens, cur.label, heroValue),
    [model, lens, cur.label, heroValue],
  );

  const support: CCLens[] = ["margin", "ni", "cash", "ar"];

  const selectPeriod = useCallback((id: string) => {
    startTransition(() => {
      if (typeof document !== "undefined" && "startViewTransition" in document) {
        (document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(() => setPeriodId(id));
      } else setPeriodId(id);
    });
  }, [startTransition]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(true);
      }
      if (e.key === "Escape") {
        setCmdOpen(false);
        setAskOpen(false);
        setDriver(null);
        setExplainPoint(null);
        setFocus(false);
      }
      if (e.key === "ArrowLeft") selectPeriod(model.periods[Math.max(0, idx - 1)]?.id ?? periodId);
      if (e.key === "ArrowRight") selectPeriod(model.periods[Math.min(model.periods.length - 1, idx + 1)]?.id ?? periodId);
      if (/^[1-6]$/.test(e.key) && (e.target as HTMLElement).tagName !== "INPUT") {
        setLens((Object.keys(LENS_META) as CCLens[])[+e.key - 1]);
      }
      if (e.key.toLowerCase() === "f" && (e.target as HTMLElement).tagName !== "INPUT") setFocus((v) => !v);
      if (e.key.toLowerCase() === "\\") setDrawerOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, model.periods, periodId, selectPeriod]);

  const hoverLabel = hoverIndex != null ? sliced[hoverIndex]?.label : null;
  const hoverValue = hoverIndex != null ? Number(sliced[hoverIndex]?.[meta.key]) : null;

  return (
    <div className={cn("cc-root", focus && "is-focus", !drawerOpen && "drawer-collapsed")}>
      <aside className="cc-rail" aria-label="Firm">
        <div className="cc-brand">
          <div className="cc-mark">H</div>
          <div>
            <div className="cc-brand-name">Hathorn</div>
            <div className="cc-brand-sub">Intelligence</div>
          </div>
        </div>
        <nav className="cc-nav">
          <Link href="/today">Today</Link>
          <Link href="/clients" className="on">Clients</Link>
          <Link href="/close">Work</Link>
          <Link href="/dash/reports">Reports</Link>
          <button type="button" onClick={() => setCmdOpen(true)}>Ask</button>
        </nav>
        <div className="cc-rail-foot">
          <div className="cc-user">
            <span>{model.userName.slice(0, 1)}</span>
            <div>
              <div>{model.userName}</div>
              <small>{model.userRole === "ADMIN" ? "Managing Partner" : model.userRole}</small>
            </div>
          </div>
        </div>
      </aside>

      <div className="cc-workspace">
        <header className="cc-top">
          <div className="cc-crumbs">
            <span>Clients</span>
            <span>/</span>
            <strong>{model.clientName}</strong>
            {model.demo ? <em className="cc-demo">Demo fixture</em> : null}
          </div>
          <div className="cc-top-actions">
            <Button variant="hairline" onClick={() => setCmdOpen(true)} className="cc-ask-trigger">
              <Sparkle size={14} weight="bold" />
              Ask Hathorn
              <kbd>⌘K</kbd>
            </Button>
            <Button variant="ghost" size="icon" aria-label="Focus" onClick={() => setFocus((v) => !v)}>
              <CornersOut size={16} />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Toggle intelligence" onClick={() => setDrawerOpen((v) => !v)}>
              <MagicWand size={16} />
            </Button>
          </div>
        </header>

        <div className="cc-title">
          <div>
            <h1 style={{ viewTransitionName: "cc-client" }}>{model.clientName}</h1>
            <div className="cc-meta">
              <span>{cur.label}</span>
              <span className="ok">Books tied</span>
              <span className="ok">Gate clear</span>
            </div>
            <div className="cc-scrub" role="tablist" aria-label="Period">
              {model.periods.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={p.id === periodId}
                  className={cn(p.id === periodId && "on")}
                  onClick={() => selectPeriod(p.id)}
                >
                  <span>{String(p.year).slice(2)}</span>
                  {p.label.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>
          <div className="cc-period-tools">
            <Button variant="hairline" size="icon" aria-label="Previous" onClick={() => selectPeriod(model.periods[Math.max(0, idx - 1)].id)}>
              <ArrowLeft size={14} />
            </Button>
            <div className="cc-period-now">{cur.label}</div>
            <Button variant="hairline" size="icon" aria-label="Next" onClick={() => selectPeriod(model.periods[Math.min(model.periods.length - 1, idx + 1)].id)}>
              <ArrowRight size={14} />
            </Button>
          </div>
        </div>

        <div className="cc-stage">
          <main className={cn("cc-canvas", focus && "focus")}>
            <section className="cc-hero" data-highlighted={hoverIndex != null}>
              <div className="cc-hero-copy">
                <div className="cc-eyebrow">{meta.label}</div>
                <div className="cc-hero-value tnum">
                  <AnimatedNumber value={hoverValue ?? heroValue} format={(n) => fmtVal(n, meta.unit)} />
                </div>
                <div className={cn("cc-hero-delta", dPct != null && dPct < 0 && "down")}>
                  {dPct == null ? "No prior year" : `${dPct >= 0 ? "+" : "−"}${Math.abs(dPct).toFixed(1)}% vs prior year`}
                  {hoverLabel ? <span className="cc-hover-chip">Scrubbing {hoverLabel}</span> : null}
                </div>
              </div>

              <div className="cc-floating" aria-label="Chart controls">
                <div className="cc-seg">
                  {(["6M", "12M", "24M", "YTD", "ALL"] as Range[]).map((r) => (
                    <button key={r} type="button" className={cn(range === r && "on")} onClick={() => setRange(r)}>{r}</button>
                  ))}
                </div>
                <div className="cc-seg">
                  {([
                    ["actual", "Actual"],
                    ["prior", "Prior"],
                    ["budget", "Budget"],
                    ["all", "All"],
                  ] as const).map(([k, label]) => (
                    <button key={k} type="button" className={cn(seriesMode === k && "on")} onClick={() => setSeriesMode(k)}>{label}</button>
                  ))}
                </div>
                <div className="cc-seg ghost">
                  <button type="button" className={cn(showBand && "on")} onClick={() => setShowBand((v) => !v)} title="Confidence band">Band</button>
                  <button type="button" className={cn(showAnomalies && "on")} onClick={() => setShowAnomalies((v) => !v)} title="Anomalies">Δ</button>
                  <button type="button" className={cn(brushZoom && "on")} onClick={() => setBrushZoom((v) => !v)} title="Brush zoom">
                    <Crosshair size={12} />
                  </button>
                </div>
              </div>

              <div className="cc-lenses" role="tablist" aria-label="Lens">
                {(Object.keys(LENS_META) as CCLens[]).map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="tab"
                    className={cn(lens === l && "on")}
                    onClick={() => setLens(l)}
                  >
                    {LENS_META[l].label}
                  </button>
                ))}
              </div>

              <div className="cc-chart-shell">
                <IntelligenceChart
                  periods={model.periods}
                  lens={lens}
                  activePeriodId={periodId}
                  hoverIndex={hoverIndex}
                  onHoverIndex={setHoverIndex}
                  onSelectIndex={(i) => {
                    const p = sliced[i];
                    if (p) {
                      selectPeriod(p.id);
                      setExplainPoint(`${LENS_META[lens].label} · ${p.label}`);
                      setDrawerOpen(true);
                    }
                  }}
                  range={range}
                  seriesMode={seriesMode}
                  showBand={showBand}
                  showAnomalies={showAnomalies}
                  brushZoom={brushZoom}
                  annotations={model.annotations}
                  highlighted={hoverIndex != null}
                />
                <div className="cc-chart-actions">
                  <Button
                    variant="hairline"
                    size="sm"
                    onClick={() => {
                      setExplainPoint(`${meta.label} · ${hoverLabel ?? cur.label}`);
                      setAskQ(`Explain this point: ${meta.label} in ${hoverLabel ?? cur.label}`);
                      setAskOpen(true);
                    }}
                  >
                    <Question size={13} /> Explain this point
                  </Button>
                  <Button
                    variant="hairline"
                    size="sm"
                    onClick={() => {
                      setAskQ(`Why did ${meta.label.toLowerCase()} change in ${cur.label}?`);
                      setAskOpen(true);
                    }}
                  >
                    <ChartLine size={13} /> Why did this change?
                  </Button>
                </div>
              </div>
            </section>

            <section className="cc-metrics" aria-label="Supporting metrics">
              {support.map((l) => {
                const m = LENS_META[l];
                const v = Number(cur[m.key]);
                const py = priorYear ? Number(priorYear[m.key]) : null;
                const d = deltaPct(v, py);
                const spark = seriesFor(model.periods.slice(Math.max(0, idx - 5), idx + 1), l);
                return (
                  <button
                    key={l}
                    type="button"
                    className={cn("cc-metric", lens === l && "on")}
                    onClick={() => setLens(l)}
                    onMouseEnter={() => setHoverIndex(sliced.length - 1)}
                    onMouseLeave={() => setHoverIndex(null)}
                  >
                    <div className="cc-metric-top">
                      <span className="cc-eyebrow">{m.label}</span>
                      <MicroSpark values={spark} active={lens === l} tone={d != null && d < 0 ? "down" : "up"} />
                    </div>
                    <div className="cc-metric-v tnum">{fmtVal(v, m.unit)}</div>
                    <div className={cn("cc-metric-d", d != null && d < 0 && "down")}>
                      {d == null ? "—" : `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}%`}
                    </div>
                  </button>
                );
              })}
            </section>

            <section className="cc-bottom">
              <div>
                <div className="cc-eyebrow">Why it changed</div>
                <h2>Variance waterfall</h2>
                <VarianceWaterfall
                  drivers={model.drivers}
                  activeId={driver?.id ?? null}
                  onSelect={(d) => {
                    setDriver(d);
                    if (d.lens) setLens(d.lens);
                    setDrawerOpen(true);
                  }}
                />
                <p className="cc-fine">Click a driver for attribution · chart lens follows.</p>
              </div>
              <div>
                <div className="cc-eyebrow">Contribution analysis</div>
                <h2>What moved the number</h2>
                <ContributionTable rows={model.contributions} />
              </div>
            </section>
          </main>

          <AnimatePresence>
            {drawerOpen ? (
              <motion.aside
                className="cc-intel"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                aria-label="Intelligence drawer"
              >
                <div className="cc-intel-head">
                  <div className="cc-eyebrow">What Hathorn sees</div>
                  <Button variant="ghost" size="icon" aria-label="Close drawer" onClick={() => setDrawerOpen(false)}>
                    <X size={14} />
                  </Button>
                </div>
                <h2>{model.narrative.headline}</h2>
                <p>{model.narrative.body}</p>
                {model.narrative.signal ? <div className="cc-signal">{model.narrative.signal}</div> : null}

                {explainPoint ? (
                  <div className="cc-explain">
                    <div className="cc-eyebrow">Selected point</div>
                    <strong>{explainPoint}</strong>
                    <p>Interrogate this figure — scrub the series, then ask Hathorn for the advisory read.</p>
                    <Button variant="brand" size="sm" onClick={() => { setAskQ(`Explain ${explainPoint}`); setAskOpen(true); }}>
                      Ask Hathorn about this
                    </Button>
                  </div>
                ) : null}

                {driver ? (
                  <div className="cc-explain">
                    <div className="cc-eyebrow">Driver attribution</div>
                    <strong>{driver.label}</strong>
                    <p>{driver.detail}</p>
                    <p className="cc-fine tnum">Impact {driver.delta >= 0 ? "+" : "−"}{fmtMoney(Math.abs(driver.delta)).slice(1)}</p>
                  </div>
                ) : null}

                <div className="cc-eyebrow" style={{ marginTop: 22 }}>Key takeaways</div>
                <ul className="cc-takes">
                  {model.insights.map((ins) => (
                    <li key={ins.label}>
                      <span>{ins.label}</span>
                      <strong className={cn("tnum", ins.tone === "down" && "is-down")}>{ins.value}</strong>
                      <em>{ins.detail}</em>
                    </li>
                  ))}
                </ul>

                <div className="cc-eyebrow" style={{ marginTop: 22 }}>Ask Hathorn</div>
                <div className="cc-ask-list">
                  {suggestions.map((s) => (
                    <button key={s} type="button" onClick={() => { setAskQ(s); setAskOpen(true); }}>{s}</button>
                  ))}
                </div>
              </motion.aside>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <CommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        suggestions={suggestions}
        onAsk={(q) => { setAskQ(q); setAskOpen(true); }}
        onLens={setLens}
        onToggle={(k) => {
          if (k === "band") setShowBand((v) => !v);
          if (k === "anomalies") setShowAnomalies((v) => !v);
          if (k === "brush") setBrushZoom((v) => !v);
          if (k === "focus") setFocus((v) => !v);
        }}
      />

      <Modal open={askOpen} onOpenChange={setAskOpen} title="Ask Hathorn">
        <input
          className="cc-ask-input"
          value={askQ}
          onChange={(e) => setAskQ(e.target.value)}
          placeholder="What should I open with?"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              window.location.href = `/ask?q=${encodeURIComponent(askQ)}`;
            }
          }}
        />
        <p className="cc-fine" style={{ marginTop: 12 }}>
          Routes to Ask with {model.clientName} · {cur.label} · {meta.label} context.
        </p>
        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <Button variant="brand" onClick={() => { window.location.href = `/ask?q=${encodeURIComponent(askQ)}`; }}>
            Open Ask
          </Button>
          <Button variant="hairline" onClick={() => setAskOpen(false)}>Stay here</Button>
        </div>
      </Modal>
    </div>
  );
}
