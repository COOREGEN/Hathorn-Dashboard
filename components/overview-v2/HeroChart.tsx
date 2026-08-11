"use client";
/**
 * Dominant financial visualization — dark Intelligence OS.
 * Atmospheric canvas; cyan glow marks; rich compare tooltip.
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

const MUTE = "#9A9488";
const HAIR = "rgba(255,255,255,0.06)";
const MINT = "#5EE4A8";
const CYAN = "#6EC8FF";
const PRIOR = "#8A8478";
const BUDGET = "#7B8CFF";
const PAPER = "#F4EFE3";

export const LENS_META: Record<OverviewLens, { label: string; unit: "money" | "pct" }> = {
  revenue: { label: "Revenue", unit: "money" },
  grossProfit: { label: "Gross profit", unit: "money" },
  grossMarginPct: { label: "Gross margin", unit: "pct" },
  netIncome: { label: "Net income", unit: "money" },
  cash: { label: "Cash", unit: "money" },
  arTotal: { label: "Receivables", unit: "money" },
};

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
      animationDuration: 480,
      animationEasing: "cubicOut",
      textStyle: { fontFamily: "Libre Franklin, sans-serif", color: MUTE },
      grid: { left: 52, right: 18, top: 36, bottom: 28 },
      legend: {
        show: hasPrior || hasBudget,
        top: 0,
        right: 0,
        icon: "roundRect",
        itemWidth: 14,
        itemHeight: 2,
        textStyle: { color: MUTE, fontSize: 10, fontFamily: "Libre Franklin, sans-serif" },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "line",
          lineStyle: { color: "rgba(110,200,255,0.55)", width: 1.25 },
          label: { show: false },
        },
        backgroundColor: "rgba(14,16,22,0.96)",
        borderColor: "rgba(110,200,255,0.22)",
        borderWidth: 1,
        padding: [16, 18],
        extraCssText: "backdrop-filter:blur(18px);box-shadow:0 24px 70px rgba(0,0,0,0.55);border-radius:16px;",
        textStyle: { color: PAPER, fontSize: 12 },
        formatter: (params: any) => {
          const list = Array.isArray(params) ? params : [params];
          const idx = list[0]?.dataIndex ?? 0;
          const p = sliced[idx];
          if (!p) return "";
          const actualVal = p[lens];
          let html = `<div style="font-family:Libre Franklin,sans-serif;letter-spacing:.16em;font-size:9px;text-transform:uppercase;color:${MUTE};margin-bottom:12px">${p.label.toUpperCase()}</div>`;
          html += `<div style="display:flex;justify-content:space-between;gap:36px;margin-bottom:8px"><span style="color:${MINT}">Actual</span><span style="font-variant-numeric:tabular-nums;font-size:15px">${fmtVal(actualVal, meta.unit)}</span></div>`;

          const prior = list.find((x: any) => x.seriesName === "Prior year");
          if (prior?.value != null) {
            const dPct = meta.unit === "pct" ? null : ((actualVal - prior.value) / Math.abs(prior.value)) * 100;
            const dPts = meta.unit === "pct" ? actualVal - prior.value : null;
            const dAmt = meta.unit === "money" ? actualVal - prior.value : null;
            html += `<div style="display:flex;justify-content:space-between;gap:36px;margin-bottom:4px;color:${MUTE}"><span>Prior year</span><span style="color:${PAPER};font-variant-numeric:tabular-nums">${fmtVal(prior.value, meta.unit)}</span></div>`;
            html += `<div style="display:flex;justify-content:space-between;gap:36px;margin-bottom:8px;color:${MUTE}"><span>vs Prior year</span><span style="color:${PAPER};font-variant-numeric:tabular-nums">${
              dPts != null ? `${dPts >= 0 ? "+" : ""}${dPts.toFixed(1)} pts`
                : `${dPct! >= 0 ? "+" : ""}${dPct!.toFixed(1)}%${dAmt != null ? ` · ${dAmt >= 0 ? "+" : ""}${fmtMoney(dAmt)}` : ""}`
            }</span></div>`;
          }

          const bud = list.find((x: any) => x.seriesName === "Budget");
          if (bud?.value != null && meta.unit === "money") {
            const dPct = ((actualVal - bud.value) / Math.abs(bud.value)) * 100;
            const dAmt = actualVal - bud.value;
            html += `<div style="display:flex;justify-content:space-between;gap:36px;margin-bottom:4px;color:${MUTE}"><span>Budget</span><span style="color:${PAPER};font-variant-numeric:tabular-nums">${fmtMoney(bud.value)}</span></div>`;
            html += `<div style="display:flex;justify-content:space-between;gap:36px;color:${MUTE}"><span>vs Budget</span><span style="color:${PAPER};font-variant-numeric:tabular-nums">${dPct >= 0 ? "+" : ""}${dPct.toFixed(1)}% · ${dAmt >= 0 ? "+" : ""}${fmtMoney(dAmt)}</span></div>`;
          }
          return html;
        },
      },
      xAxis: {
        type: "category",
        data: labels,
        boundaryGap: false,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: MUTE, fontSize: 10, fontFamily: "Libre Franklin, sans-serif" },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: HAIR, width: 1 } },
        axisLabel: {
          color: MUTE, fontSize: 10, fontFamily: "Libre Franklin, sans-serif",
          formatter: (v: number) => (meta.unit === "pct" ? `${v}%` : fmtMoney(v)),
        },
      },
      series: [
        {
          name: "Actual",
          type: "line",
          data: actual,
          smooth: 0.4,
          symbol: "circle",
          symbolSize: (_: number, params: any) => (params.dataIndex === activeIdx ? 12 : 7),
          showSymbol: true,
          lineStyle: {
            width: 2.8,
            color: {
              type: "linear", x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [
                { offset: 0, color: MINT },
                { offset: 1, color: CYAN },
              ],
            },
            shadowColor: "rgba(110,200,255,0.45)",
            shadowBlur: 18,
          },
          itemStyle: {
            color: CYAN,
            borderColor: "#0B1220",
            borderWidth: 2,
            shadowColor: "rgba(110,200,255,0.8)",
            shadowBlur: 12,
          },
          areaStyle: {
            color: {
              type: "linear", x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(94,228,168,0.20)" },
                { offset: 0.55, color: "rgba(110,200,255,0.06)" },
                { offset: 1, color: "rgba(110,200,255,0.00)" },
              ],
            },
          },
        },
        ...(hasPrior ? [{
          name: "Prior year",
          type: "line" as const,
          data: priorSeries,
          smooth: 0.35,
          symbol: "none",
          lineStyle: { width: 1.5, color: PRIOR, type: "dashed" as const },
        }] : []),
        ...(hasBudget ? [{
          name: "Budget",
          type: "line" as const,
          data: budgetSeries,
          smooth: 0.2,
          symbol: "none",
          lineStyle: { width: 1.5, color: BUDGET, type: "dotted" as const },
        }] : []),
      ],
    };
  }, [sliced, periods, lens, activePeriodId, showPriorYear, showBudget, meta.unit]);

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

  return <div className="ov2-chart" ref={el} role="img" aria-label={`${meta.label} trend`} />;
}
