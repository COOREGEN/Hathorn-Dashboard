"use client";

/**
 * Hathorn Command Center — one connected financial intelligence canvas.
 * THE DATA IS THE INTERFACE. Chrome stays out of the way.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CornersOut,
  Crosshair,
  MagicWand,
  Path,
  Sparkle,
  X,
} from "@phosphor-icons/react";
import IntelligenceChart, { type ChartPointSelect } from "./IntelligenceChart";
import VarianceWaterfall from "./VarianceWaterfall";
import ContributionTable from "./ContributionTable";
import CommandPalette from "./CommandPalette";
import PaletteDock from "./PaletteDock";
import PointPopover, { type PointIntel } from "./PointPopover";
import FinancialTrace from "./FinancialTrace";
import { AnimatedNumber, MicroSpark } from "./MotionBits";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { CCDriver, CCLens, CommandCenterModel } from "@/lib/command-center/model";
import { LENS_META } from "@/lib/command-center/model";
import { askContext, deltaPct, fmtMoney, fmtVal, seriesFor } from "@/lib/command-center/intelligence";
import { CC_PALETTES, CC_PALETTE_STORAGE_KEY, type CCPaletteId } from "@/lib/command-center/palettes";
import { cn } from "@/lib/utils";
import "./command-center.css";

type Range = "6M" | "12M" | "24M" | "YTD" | "ALL";
type SeriesMode = "actual" | "prior" | "budget" | "all";

function readPalette(): CCPaletteId {
  if (typeof window === "undefined") return "jade";
  const raw = window.localStorage.getItem(CC_PALETTE_STORAGE_KEY);
  return CC_PALETTES.some((p) => p.id === raw) ? (raw as CCPaletteId) : "jade";
}

function pointIntelFrom(
  model: CommandCenterModel,
  lens: CCLens,
  sel: ChartPointSelect,
  driver: CCDriver | null,
): PointIntel {
  const ann = model.annotations.find((a) => a.periodId === sel.periodId);
  const meta = LENS_META[lens];
  const kind =
    ann?.kind === "anomaly"
      ? "anomaly"
      : ann?.kind === "break"
        ? "break"
        : sel.label.includes("Apr 2026")
          ? "opportunity"
          : null;
  const primary = driver?.label ?? model.contributions[0]?.driver ?? "Volume + mix";
  return {
    index: sel.index,
    periodId: sel.periodId,
    label: sel.label,
    value: sel.value,
    lens,
    what: ann?.detail ?? `${meta.label} closed at ${fmtVal(sel.value, meta.unit)} in ${sel.label}.`,
    why:
      driver?.detail ??
      ann?.label ??
      "Timing and operational mix both moved — rate held; volume did the rest.",
    impact: `${fmtVal(sel.value, meta.unit)} on the statement · ${meta.label.toLowerCase()} is the spine figure for this view.`,
    driver: primary,
    kind,
  };
}

/** Driver → related chart period indices in the sliced series. */
function driverHighlights(
  sliced: { id: string; label: string }[],
  driver: CCDriver | null,
  annotations: CommandCenterModel["annotations"],
): number[] {
  if (!driver) return [];
  if (driver.lens === "revenue" || driver.id === "rev") {
    return sliced
      .map((p, i) => (p.label.includes("Mar") || p.label.includes("Apr") ? i : -1))
      .filter((i) => i >= 0)
      .slice(-3);
  }
  if (driver.lens === "margin" || driver.id === "labor") {
    const breakIdx = sliced.findIndex((p) => annotations.some((a) => a.periodId === p.id && a.kind === "break"));
    const soft = sliced.findIndex((p) => annotations.some((a) => a.periodId === p.id && a.kind === "anomaly"));
    return [breakIdx, soft, sliced.length - 1].filter((i) => i >= 0);
  }
  return [Math.max(0, sliced.length - 2), sliced.length - 1].filter((i) => i >= 0);
}

export default function CommandCenter({ model }: { model: CommandCenterModel }) {
  const [, startTransition] = useTransition();
  const [palette, setPalette] = useState<CCPaletteId>("jade");
  const [periodId, setPeriodId] = useState(model.periodId);
  const [lens, setLens] = useState<CCLens>("revenue");
  const [range, setRange] = useState<Range>("12M");
  const [seriesMode, setSeriesMode] = useState<SeriesMode>("all");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [driver, setDriver] = useState<CCDriver | null>(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [askQ, setAskQ] = useState("");
  const [showBand, setShowBand] = useState(true);
  const [showAnomalies, setShowAnomalies] = useState(true);
  const [brushZoom, setBrushZoom] = useState(false);
  const [focus, setFocus] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [point, setPoint] = useState<PointIntel | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);
  const [brushRange, setBrushRange] = useState<[number, number] | null>(null);

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

  const highlightIndices = useMemo(() => {
    if (brushRange) {
      const out: number[] = [];
      for (let i = brushRange[0]; i <= brushRange[1]; i++) out.push(i);
      return out;
    }
    return driverHighlights(sliced, driver, model.annotations);
  }, [brushRange, sliced, driver, model.annotations]);

  const priorYear = model.periods.find((p) => p.month === cur.month && p.year === cur.year - 1);
  const priorMonth = idx > 0 ? model.periods[idx - 1] : null;
  const compareBasis = priorYear ?? priorMonth;
  const compareLabel = priorYear ? "vs prior year" : priorMonth ? "vs prior month" : null;
  const priorVal = compareBasis ? Number(compareBasis[meta.key]) : null;
  const dPct = deltaPct(heroValue, priorVal);

  const suggestions = useMemo(
    () => askContext(model, lens, point?.label ?? cur.label, point?.value ?? heroValue),
    [model, lens, cur.label, heroValue, point],
  );

  const support: CCLens[] = ["margin", "ni", "cash", "ar"];

  const smartInsight = useMemo(() => {
    if (driver) {
      return {
        headline: driver.label,
        body: driver.detail,
        signal: `Impact ${driver.delta >= 0 ? "+" : "−"}${fmtMoney(Math.abs(driver.delta)).replace("$", "$")}`,
      };
    }
    if (point) {
      return {
        headline: `${LENS_META[point.lens].label} · ${point.label}`,
        body: point.what,
        signal: point.driver,
      };
    }
    const ann = model.annotations.find((a) => a.periodId === periodId) ?? model.annotations[model.annotations.length - 1];
    return {
      headline: model.narrative.headline,
      body: model.narrative.body,
      signal: ann ? `${ann.label} — ${ann.detail}` : model.narrative.signal,
    };
  }, [driver, point, model, periodId]);

  const applyPalette = useCallback((id: CCPaletteId) => {
    setPalette(id);
    try {
      window.localStorage.setItem(CC_PALETTE_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    applyPalette(readPalette());
  }, [applyPalette]);

  const selectPeriod = useCallback(
    (id: string) => {
      startTransition(() => {
        if (typeof document !== "undefined" && "startViewTransition" in document) {
          (document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(() =>
            setPeriodId(id),
          );
        } else setPeriodId(id);
      });
    },
    [startTransition],
  );

  const resetCanvas = useCallback(() => {
    setFocusIndex(null);
    setPoint(null);
    setAnchor(null);
    setDriver(null);
    setBrushRange(null);
    setTraceOpen(false);
    setHoverIndex(null);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(true);
      }
      if (e.key === "Escape") {
        setCmdOpen(false);
        setAskOpen(false);
        resetCanvas();
        setFocus(false);
        setToolsOpen(false);
      }
      if (e.key === "ArrowLeft") selectPeriod(model.periods[Math.max(0, idx - 1)]?.id ?? periodId);
      if (e.key === "ArrowRight")
        selectPeriod(model.periods[Math.min(model.periods.length - 1, idx + 1)]?.id ?? periodId);
      if (/^[1-6]$/.test(e.key) && tag !== "INPUT") {
        setLens((Object.keys(LENS_META) as CCLens[])[+e.key - 1]);
      }
      if (e.key.toLowerCase() === "f" && tag !== "INPUT") setFocus((v) => !v);
      if (e.key.toLowerCase() === "\\") setDrawerOpen((v) => !v);
      if (e.key.toLowerCase() === "t" && tag !== "INPUT" && point) setTraceOpen(true);
      if (e.key.toLowerCase() === "p" && tag !== "INPUT") {
        const i = CC_PALETTES.findIndex((p) => p.id === palette);
        applyPalette(CC_PALETTES[(i + 1) % CC_PALETTES.length].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, model.periods, periodId, selectPeriod, palette, applyPalette, resetCanvas, point]);

  const hoverLabel = hoverIndex != null ? sliced[hoverIndex]?.label : null;
  const hoverValue = hoverIndex != null ? Number(sliced[hoverIndex]?.[meta.key]) : null;
  const displayValue = hoverValue ?? point?.value ?? heroValue;

  const openAsk = (q: string) => {
    setAskQ(q);
    setAskOpen(true);
  };

  const filteredDrivers = useMemo(() => {
    if (!driver) return model.drivers;
    return model.drivers.map((d) =>
      d.id === driver.id || d.kind === "start" || d.kind === "end" ? d : { ...d, detail: d.detail },
    );
  }, [model.drivers, driver]);

  return (
    <div
      className={cn("cc-root cc-canvas-mode", focus && "is-focus", !drawerOpen && "drawer-collapsed")}
      data-palette={palette}
    >
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
          <Link href="/clients" className="on">
            Clients
          </Link>
          <Link href="/close">Work</Link>
          <button type="button" onClick={() => setCmdOpen(true)}>
            Ask
          </button>
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
        <header className="cc-top cc-top-slim">
          <div className="cc-crumbs">
            <strong>{model.clientName}</strong>
            <span className="cc-sep">·</span>
            <span>{cur.label}</span>
            {model.demo ? <em className="cc-demo">Demo</em> : null}
          </div>
          <div className="cc-top-actions">
            <PaletteDock value={palette} onChange={applyPalette} />
            <Button variant="hairline" onClick={() => setCmdOpen(true)} className="cc-ask-trigger">
              <Sparkle size={14} weight="bold" />
              Ask
              <kbd>⌘K</kbd>
            </Button>
            <Button variant="ghost" size="icon" aria-label="Focus" onClick={() => setFocus((v) => !v)}>
              <CornersOut size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Toggle intelligence"
              onClick={() => setDrawerOpen((v) => !v)}
            >
              <MagicWand size={16} />
            </Button>
          </div>
        </header>

        <div className="cc-stage">
          <main className={cn("cc-canvas", focus && "focus")}>
            <section className="cc-hero cc-hero-canvas" data-highlighted={hoverIndex != null || focusIndex != null}>
              <div className="cc-hero-copy">
                <div className="cc-eyebrow">{meta.label}</div>
                <button
                  type="button"
                  className="cc-hero-value tnum cc-traceable"
                  title="Click to Financial Trace"
                  onClick={() => {
                    const sel: ChartPointSelect = {
                      index: sliced.length - 1,
                      periodId: cur.id,
                      label: cur.label,
                      value: heroValue,
                      pixel: { x: 120, y: 160 },
                    };
                    const intel = pointIntelFrom(model, lens, sel, driver);
                    setPoint(intel);
                    setFocusIndex(sliced.length - 1);
                    setTraceOpen(true);
                    setDrawerOpen(true);
                  }}
                >
                  <AnimatedNumber value={displayValue} format={(n) => fmtVal(n, meta.unit)} />
                </button>
                <div className={cn("cc-hero-delta", dPct != null && dPct < 0 && "down")}>
                  {dPct == null || !compareLabel
                    ? "No compare basis"
                    : `${dPct >= 0 ? "+" : "−"}${Math.abs(dPct).toFixed(1)}% ${compareLabel}`}
                  {hoverLabel ? <span className="cc-hover-chip">Scrubbing {hoverLabel}</span> : null}
                  {driver ? <span className="cc-hover-chip">Driver · {driver.label}</span> : null}
                </div>
              </div>

              <div
                className="cc-chart-shell"
                onMouseEnter={() => setToolsOpen(true)}
                onMouseLeave={() => setToolsOpen(false)}
              >
                <AnimatePresence>
                  {toolsOpen || brushZoom ? (
                    <motion.div
                      className="cc-chart-toolbar"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.14 }}
                      aria-label="Chart tools"
                    >
                      <div className="cc-seg ghost">
                        {(["6M", "12M", "YTD", "ALL"] as Range[]).map((r) => (
                          <button key={r} type="button" className={cn(range === r && "on")} onClick={() => setRange(r)}>
                            {r}
                          </button>
                        ))}
                      </div>
                      <div className="cc-seg ghost">
                        <button
                          type="button"
                          className={cn(seriesMode === "all" && "on")}
                          onClick={() => setSeriesMode("all")}
                        >
                          All
                        </button>
                        <button
                          type="button"
                          className={cn(seriesMode === "actual" && "on")}
                          onClick={() => setSeriesMode("actual")}
                        >
                          Actual
                        </button>
                        <button
                          type="button"
                          className={cn(showBand && "on")}
                          onClick={() => setShowBand((v) => !v)}
                        >
                          Band
                        </button>
                        <button
                          type="button"
                          className={cn(showAnomalies && "on")}
                          onClick={() => setShowAnomalies((v) => !v)}
                        >
                          Marks
                        </button>
                        <button
                          type="button"
                          className={cn(brushZoom && "on")}
                          onClick={() => setBrushZoom((v) => !v)}
                          title="Drag across periods"
                        >
                          <Crosshair size={12} />
                        </button>
                      </div>
                      <button type="button" className="cc-toolbar-reset" onClick={resetCanvas}>
                        Reset
                      </button>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <div className="cc-lenses cc-lenses-slim" role="tablist" aria-label="Lens">
                  {(Object.keys(LENS_META) as CCLens[]).map((l) => (
                    <button
                      key={l}
                      type="button"
                      role="tab"
                      className={cn(lens === l && "on")}
                      onClick={() => {
                        startTransition(() => setLens(l));
                        setFocusIndex(null);
                        setPoint(null);
                        setAnchor(null);
                      }}
                    >
                      {LENS_META[l].label}
                    </button>
                  ))}
                </div>

                <IntelligenceChart
                  key={palette}
                  periods={model.periods}
                  lens={lens}
                  activePeriodId={periodId}
                  hoverIndex={hoverIndex}
                  focusIndex={focusIndex}
                  highlightIndices={highlightIndices}
                  onHoverIndex={setHoverIndex}
                  onSelectPoint={(ev) => {
                    selectPeriod(ev.periodId);
                    setFocusIndex(ev.index);
                    const intel = pointIntelFrom(model, lens, ev, driver);
                    setPoint(intel);
                    setAnchor(ev.pixel);
                    setDrawerOpen(true);
                  }}
                  onBrushRange={setBrushRange}
                  onReset={resetCanvas}
                  range={range}
                  seriesMode={seriesMode}
                  showBand={showBand}
                  showAnomalies={showAnomalies}
                  brushZoom={brushZoom}
                  annotations={model.annotations}
                />
              </div>
            </section>

            <section className="cc-metrics" aria-label="Supporting metrics">
              {support.map((l) => {
                const m = LENS_META[l];
                const v = Number(cur[m.key]);
                const py = compareBasis ? Number(compareBasis[m.key]) : null;
                const d = deltaPct(v, py);
                const spark = seriesFor(model.periods.slice(Math.max(0, idx - 5), idx + 1), l);
                return (
                  <button
                    key={l}
                    type="button"
                    className={cn("cc-metric", lens === l && "on", driver?.lens === l && "is-linked")}
                    onClick={() => setLens(l)}
                  >
                    <div className="cc-metric-top">
                      <span className="cc-eyebrow">{m.label}</span>
                      <MicroSpark values={spark} active={lens === l} tone={d != null && d < 0 ? "down" : "up"} />
                    </div>
                    <div
                      className="cc-metric-v tnum cc-traceable"
                      onClick={(e) => {
                        e.stopPropagation();
                        const sel: ChartPointSelect = {
                          index: sliced.length - 1,
                          periodId: cur.id,
                          label: cur.label,
                          value: v,
                          pixel: { x: 200, y: 280 },
                        };
                        setLens(l);
                        const intel = pointIntelFrom(model, l, sel, driver);
                        setPoint(intel);
                        setTraceOpen(true);
                      }}
                    >
                      {fmtVal(v, m.unit)}
                    </div>
                    <div className={cn("cc-metric-d", d != null && d < 0 && "down")}>
                      {d == null ? "—" : `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}%`}
                    </div>
                  </button>
                );
              })}
            </section>

            <section className="cc-bottom">
              <div className={cn(driver && "is-isolated")}>
                <div className="cc-eyebrow">Why it changed</div>
                <h2>Variance</h2>
                <VarianceWaterfall
                  drivers={filteredDrivers}
                  activeId={driver?.id ?? null}
                  onSelect={(d) => {
                    setDriver(d);
                    if (d.lens) setLens(d.lens);
                    setPoint(null);
                    setAnchor(null);
                    setDrawerOpen(true);
                    setBrushRange(null);
                  }}
                />
                <p className="cc-fine">Click a driver — chart periods, insight, and metric stay in sync.</p>
              </div>
              <div>
                <div className="cc-eyebrow">Contribution</div>
                <h2>What moved it</h2>
                <ContributionTable rows={model.contributions} />
              </div>
            </section>
          </main>

          <AnimatePresence>
            {drawerOpen ? (
              <motion.aside
                className="cc-intel"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                aria-label="Intelligence drawer"
              >
                <div className="cc-intel-head">
                  <div className="cc-eyebrow">What Hathorn sees</div>
                  <Button variant="ghost" size="icon" aria-label="Close drawer" onClick={() => setDrawerOpen(false)}>
                    <X size={14} />
                  </Button>
                </div>
                <h2>{smartInsight.headline}</h2>
                <p>{smartInsight.body}</p>
                {smartInsight.signal ? <div className="cc-signal">{smartInsight.signal}</div> : null}

                {point ? (
                  <div className="cc-explain">
                    <div className="cc-eyebrow">Selected point</div>
                    <strong className="tnum">
                      {fmtVal(point.value, LENS_META[point.lens].unit)} · {point.label}
                    </strong>
                    <p>{point.why}</p>
                    <div className="cc-explain-actions">
                      <Button variant="hairline" size="sm" onClick={() => setTraceOpen(true)}>
                        <Path size={13} /> Trace
                      </Button>
                      <Button
                        variant="brand"
                        size="sm"
                        onClick={() => openAsk(`Explain ${LENS_META[point.lens].label} in ${point.label}`)}
                      >
                        Ask Hathorn
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="cc-eyebrow" style={{ marginTop: 22 }}>
                  Surfaced
                </div>
                <ul className="cc-takes">
                  {model.insights.map((ins) => (
                    <li key={ins.label} className={cn(driver && ins.tone === "down" && driver.id === "opex" && "is-linked")}>
                      <span>{ins.label}</span>
                      <strong className={cn("tnum", ins.tone === "down" && "is-down")}>{ins.value}</strong>
                      <em>{ins.detail}</em>
                    </li>
                  ))}
                </ul>

                <div className="cc-eyebrow" style={{ marginTop: 22 }}>
                  Ask Hathorn
                </div>
                <div className="cc-ask-list">
                  {suggestions.map((s) => (
                    <button key={s} type="button" onClick={() => openAsk(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </motion.aside>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <PointPopover
        point={point}
        anchor={anchor}
        onClose={() => {
          setPoint(null);
          setAnchor(null);
          setFocusIndex(null);
        }}
        onAsk={openAsk}
        onTrace={() => setTraceOpen(true)}
      />

      <FinancialTrace open={traceOpen} point={point} onClose={() => setTraceOpen(false)} onAsk={openAsk} />

      <CommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        suggestions={suggestions}
        onAsk={openAsk}
        onLens={setLens}
        onToggle={(k) => {
          if (k === "band") setShowBand((v) => !v);
          if (k === "anomalies") setShowAnomalies((v) => !v);
          if (k === "brush") setBrushZoom((v) => !v);
          if (k === "focus") setFocus((v) => !v);
          if (k === "palette") {
            const i = CC_PALETTES.findIndex((p) => p.id === palette);
            applyPalette(CC_PALETTES[(i + 1) % CC_PALETTES.length].id);
          }
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
          Routes to Ask with {model.clientName} · {point?.label ?? cur.label} · {meta.label} context.
        </p>
        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <Button
            variant="brand"
            onClick={() => {
              window.location.href = `/ask?q=${encodeURIComponent(askQ)}`;
            }}
          >
            Open Ask
          </Button>
          <Button variant="hairline" onClick={() => setAskOpen(false)}>
            Stay here
          </Button>
        </div>
      </Modal>
    </div>
  );
}
