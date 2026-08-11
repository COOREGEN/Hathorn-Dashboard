"use client";
/**
 * Dominant financial canvas — restrained institutional styling.
 * Minimal glow; inspection tooltip; Actual / Prior / Budget.
 */
import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import type { OverviewLens, OverviewV2Period } from "@/lib/overview-v2/build";

echarts.use([
  LineChart, GridComponent, TooltipComponent, LegendComponent,
  DataZoomComponent, CanvasRenderer,
]);

/** Soft neutrals that read on ivory paper; CSS vars on `.ov2-paper` override when present. */
function chartToken(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    || getComputedStyle(document.querySelector(".ov2") || document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function chartPalette() {
  return {
    mute: chartToken("--chart-mute", "#7A7468"),
    hair: chartToken("--chart-hair", "rgba(44, 80, 77, 0.10)"),
    actual: chartToken("--chart-actual", "#2C504D"),
    prior: chartToken("--chart-prior", "#9A9284"),
    budget: chartToken("--chart-budget", "#4A6B8A"),
    paper: chartToken("--chart-paper", "#1A1A18"),
    mark: chartToken("--chart-mark", "#DB5928"),
    tooltipBg: chartToken("--chart-tooltip-bg", "#FFFCF7"),
    tooltipBorder: chartToken("--chart-tooltip-border", "rgba(44, 80, 77, 0.16)"),
    area0: chartToken("--chart-area-0", "rgba(44, 80, 77, 0.12)"),
    area1: chartToken("--chart-area-1", "rgba(44, 80, 77, 0.00)"),
    pointer: chartToken("--chart-pointer", "rgba(219, 89, 40, 0.45)"),
    symbolBorder: chartToken("--chart-symbol-border", "#FBF8F1"),
  };
}

export const LENS_META: Record<OverviewLens, { label: string; unit: "money" | "pct" }> = {
  revenue: { label: "Revenue", unit: "money" },
  grossProfit: { label: "Gross profit", unit: "money" },
  grossMarginPct: { label: "Gross margin", unit: "pct" },
  netIncome: { label: "Net income", unit: "money" },
  cash: { label: "Cash", unit: "money" },
  arTotal: { label: "Receivables", unit: "money" },
};

/** Higher is generally favourable for these lenses (margin/revenue/etc.). */
export function lensFavorableUp(lens: OverviewLens): boolean {
  return true; // all current lenses: higher is better; expenses are not lenses here
}

export function fmtMoney(n: number) {
  const s = n < 0 ? "−" : "";
  const v = Math.abs(n);
  return v >= 1000 ? `${s}$${(v / 1000).toFixed(2)}M` : `${s}$${v.toFixed(1)}K`;
}

export function fmtVal(n: number, unit: "money" | "pct") {
  return unit === "pct" ? `${n.toFixed(1)}%` : fmtMoney(n);
}

export default function HeroChart({
  periods,
  lens,
  activePeriodId,
  showPriorYear,
  showBudget,
  range,
}: {
  periods: OverviewV2Period[];
  lens: OverviewLens;
  activePeriodId: string;
  showPriorYear: boolean;
  showBudget: boolean;
  range: "6M" | "12M" | "24M" | "YTD" | "ALL";
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.EChartsType | null>(null);
  const meta = LENS_META[lens];
  const reduceMotion = typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const sliced = useMemo(() => {
    if (range === "ALL") return periods;
    if (range === "YTD") {
      const active = periods.find((p) => p.periodId === activePeriodId);
      if (!active) return periods;
      return periods.filter((p) => p.year === active.year && p.month <= active.month);
    }
    const n = range === "6M" ? 6 : range === "12M" ? 12 : 24;
    return periods.slice(Math.max(0, periods.length - n));
  }, [periods, range, activePeriodId]);

  const option = useMemo((): EChartsCoreOption => {
    const pal = chartPalette();
    const labels = sliced.map((p) => p.label.replace(/ 20/, " '"));
    const actual = sliced.map((p) => p[lens]);
    const activeIdx = Math.max(0, sliced.findIndex((p) => p.periodId === activePeriodId));

    const priorSeries: (number | null)[] = sliced.map((p) => {
      if (!showPriorYear) return null;
      const py = periods.find((x) => x.year === p.year - 1 && x.month === p.month);
      return py ? py[lens] : null;
    });
    const hasPrior = showPriorYear && priorSeries.some((v) => v != null);

    const budgetSeries: (number | null)[] = sliced.map((p) => {
      if (!showBudget || lens !== "revenue") return null;
      return p.budgetRevenue;
    });
    const hasBudget = showBudget && lens === "revenue" && budgetSeries.some((v) => v != null);

    return {
      backgroundColor: "transparent",
      animationDuration: reduceMotion ? 0 : 360,
      animationEasing: "cubicOut",
      textStyle: { fontFamily: "Libre Franklin, sans-serif", color: pal.mute },
      grid: { left: 52, right: 16, top: 32, bottom: 28 },
      legend: {
        show: hasPrior || hasBudget,
        top: 0, right: 0, icon: "roundRect", itemWidth: 12, itemHeight: 2,
        textStyle: { color: pal.mute, fontSize: 10, fontFamily: "Libre Franklin, sans-serif" },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "line",
          lineStyle: { color: pal.pointer, width: 1 },
          label: { show: false },
        },
        backgroundColor: pal.tooltipBg,
        borderColor: pal.tooltipBorder,
        borderWidth: 1,
        padding: [16, 18],
        extraCssText: "box-shadow:0 12px 32px rgba(26,26,24,0.10);border-radius:4px;",
        textStyle: { color: pal.paper, fontSize: 12 },
        formatter: (params: any) => {
          const list = Array.isArray(params) ? params : [params];
          const idx = list[0]?.dataIndex ?? 0;
          const p = sliced[idx];
          if (!p) return "";
          const actualVal = p[lens];
          let html = `<div style="font-family:Libre Franklin,sans-serif;letter-spacing:.14em;font-size:9px;text-transform:uppercase;color:${pal.mute};margin-bottom:12px">${p.label.toUpperCase()}</div>`;
          html += `<div style="font-family:Cormorant Garamond,Georgia,serif;font-size:26px;font-weight:300;margin-bottom:4px;font-variant-numeric:tabular-nums">${fmtVal(actualVal, meta.unit)}</div>`;
          html += `<div style="font-family:Libre Franklin,sans-serif;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${pal.mute};margin-bottom:12px">${meta.label}</div>`;

          const prior = list.find((x: any) => x.seriesName === "Prior year");
          if (prior?.value != null) {
            const dPct = meta.unit === "pct" ? null : ((actualVal - prior.value) / Math.abs(prior.value)) * 100;
            const dPts = meta.unit === "pct" ? actualVal - prior.value : null;
            const dAmt = meta.unit === "money" ? actualVal - prior.value : null;
            html += row("Prior year", fmtVal(prior.value, meta.unit));
            html += row(
              "YoY",
              dPts != null
                ? `${dPts >= 0 ? "+" : ""}${dPts.toFixed(1)} pts`
                : `${dPct! >= 0 ? "+" : ""}${dPct!.toFixed(1)}%${dAmt != null ? ` · ${dAmt >= 0 ? "+" : ""}${fmtMoney(dAmt)}` : ""}`,
            );
          }
          const bud = list.find((x: any) => x.seriesName === "Budget");
          if (bud?.value != null && meta.unit === "money") {
            const dPct = ((actualVal - bud.value) / Math.abs(bud.value)) * 100;
            const dAmt = actualVal - bud.value;
            html += row("Budget", fmtMoney(bud.value));
            html += row("vs Budget", `${dPct >= 0 ? "+" : ""}${dPct.toFixed(1)}% · ${dAmt >= 0 ? "+" : ""}${fmtMoney(dAmt)}`);
          }
          return html;

          function row(k: string, v: string) {
            return `<div style="display:flex;justify-content:space-between;gap:28px;margin-top:5px;font-size:12px"><span style="color:${pal.mute}">${k}</span><span style="font-variant-numeric:tabular-nums">${v}</span></div>`;
          }
        },
      },
      xAxis: {
        type: "category", data: labels, boundaryGap: false,
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: pal.mute, fontSize: 10, fontFamily: "Libre Franklin, sans-serif" },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: pal.hair, width: 1 } },
        axisLabel: {
          color: pal.mute, fontSize: 10, fontFamily: "Libre Franklin, sans-serif",
          formatter: (v: number) => (meta.unit === "pct" ? `${v}%` : fmtMoney(v)),
        },
      },
      series: [
        {
          name: "Actual",
          type: "line",
          data: actual,
          smooth: 0.32,
          symbol: "circle",
          symbolSize: (_: number, params: any) => (params.dataIndex === activeIdx ? 9 : 0),
          showSymbol: true,
          lineStyle: { width: 2.25, color: pal.actual },
          itemStyle: { color: pal.mark, borderColor: pal.symbolBorder, borderWidth: 2 },
          areaStyle: {
            color: {
              type: "linear", x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: pal.area0 },
                { offset: 1, color: pal.area1 },
              ],
            },
          },
        },
        ...(hasPrior ? [{
          name: "Prior year",
          type: "line" as const,
          data: priorSeries,
          smooth: 0.3,
          symbol: "none",
          lineStyle: { width: 1.4, color: pal.prior, type: "dashed" as const },
        }] : []),
        ...(hasBudget ? [{
          name: "Budget",
          type: "line" as const,
          data: budgetSeries,
          smooth: 0.15,
          symbol: "none",
          lineStyle: { width: 1.4, color: pal.budget, type: "dotted" as const },
        }] : []),
      ],
    };
  }, [sliced, periods, lens, activePeriodId, showPriorYear, showBudget, meta.unit, meta.label, reduceMotion]);

  useEffect(() => {
    if (!el.current) return;
    chart.current = echarts.init(el.current, undefined, { renderer: "canvas" });
    const onResize = () => chart.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.current?.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);

  return (
    <div
      className="ov2-chart"
      ref={el}
      role="img"
      aria-label={`${meta.label} trend across ${sliced.map((p) => p.label).join(", ")}`}
    />
  );
}
