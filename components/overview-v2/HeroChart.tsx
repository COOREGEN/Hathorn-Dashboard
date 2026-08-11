"use client";
/**
 * Dominant financial visualization for Overview V2.
 * Chart is the interface — not a card ornament.
 */
import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkPointComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import type { OverviewLens, OverviewV2Period } from "@/lib/overview-v2/build";

echarts.use([
  LineChart, GridComponent, TooltipComponent, LegendComponent,
  DataZoomComponent, MarkPointComponent, CanvasRenderer,
]);

const INK = "#0C0B0A";
const MUTE = "#6E675B";
const HAIR = "rgba(12,11,10,0.10)";
const BRAND = "#2C504D";
const GOLD = "#9A7B1E";

export const LENS_META: Record<OverviewLens, { label: string; unit: "money" | "pct" }> = {
  revenue: { label: "Revenue", unit: "money" },
  grossProfit: { label: "Gross profit", unit: "money" },
  grossMarginPct: { label: "Gross margin", unit: "pct" },
  netIncome: { label: "Net income", unit: "money" },
  cash: { label: "Cash", unit: "money" },
  arTotal: { label: "Receivables", unit: "money" },
};

function fmtMoney(n: number) {
  const s = n < 0 ? "−" : "";
  const v = Math.abs(n);
  return v >= 1000 ? `${s}$${(v / 1000).toFixed(2)}M` : `${s}$${v.toFixed(1)}K`;
}

function fmtVal(n: number, unit: "money" | "pct") {
  return unit === "pct" ? `${n.toFixed(1)}%` : fmtMoney(n);
}

export default function HeroChart({
  periods,
  lens,
  activePeriodId,
  showPriorYear,
  range,
  onPeriodHover,
}: {
  periods: OverviewV2Period[];
  lens: OverviewLens;
  activePeriodId: string;
  showPriorYear: boolean;
  range: "6M" | "12M" | "ALL";
  onPeriodHover?: (periodId: string | null) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.EChartsType | null>(null);
  const meta = LENS_META[lens];

  const sliced = useMemo(() => {
    if (range === "ALL") return periods;
    const n = range === "6M" ? 6 : 12;
    return periods.slice(Math.max(0, periods.length - n));
  }, [periods, range]);

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

    return {
      animationDuration: 520,
      animationEasing: "cubicOut",
      textStyle: { fontFamily: "Libre Franklin, sans-serif", color: MUTE },
      grid: { left: 56, right: 28, top: 28, bottom: sliced.length > 14 ? 56 : 36 },
      legend: {
        show: hasPrior,
        top: 0,
        right: 0,
        icon: "roundRect",
        itemWidth: 14,
        itemHeight: 2,
        textStyle: { color: MUTE, fontSize: 10, fontFamily: "Libre Franklin, sans-serif", letterSpacing: 0.08 },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "cross",
          crossStyle: { color: "rgba(44,80,77,0.35)" },
          lineStyle: { color: BRAND, width: 1, type: "solid" },
          label: { backgroundColor: INK, color: "#FBF8F1", fontSize: 10 },
        },
        backgroundColor: "rgba(251,248,241,0.94)",
        borderColor: "rgba(12,11,10,0.08)",
        borderWidth: 1,
        padding: [14, 16],
        extraCssText: "backdrop-filter: blur(14px); box-shadow: 0 18px 50px rgba(12,11,10,0.14); border-radius: 14px;",
        textStyle: { color: INK, fontSize: 12 },
        formatter: (params: any) => {
          const list = Array.isArray(params) ? params : [params];
          const idx = list[0]?.dataIndex ?? 0;
          const p = sliced[idx];
          if (!p) return "";
          let html = `<div style="font-family:Libre Franklin,sans-serif;letter-spacing:.14em;font-size:9px;text-transform:uppercase;color:${MUTE};margin-bottom:8px">${p.label}</div>`;
          html += `<div style="font-family:Cormorant Garamond,Georgia,serif;font-size:28px;font-weight:300;line-height:1;margin-bottom:4px">${fmtVal(p[lens], meta.unit)}</div>`;
          html += `<div style="font-family:Libre Franklin,sans-serif;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${MUTE};margin-bottom:10px">${meta.label}</div>`;
          for (const item of list) {
            if (item.seriesName === "Prior year" && item.value != null) {
              const deltaPct = meta.unit === "pct"
                ? null
                : (p[lens] - item.value) / Math.abs(item.value) * 100;
              const pts = meta.unit === "pct" ? (p[lens] - item.value) : null;
              html += `<div style="display:flex;justify-content:space-between;gap:24px;font-size:12px;margin-top:4px"><span style="color:${MUTE}">Prior year</span><span class="tnum">${fmtVal(item.value, meta.unit)}</span></div>`;
              if (deltaPct != null) {
                html += `<div style="display:flex;justify-content:space-between;gap:24px;font-size:12px;margin-top:2px"><span style="color:${MUTE}">Change</span><span class="tnum">${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%</span></div>`;
              }
              if (pts != null) {
                html += `<div style="display:flex;justify-content:space-between;gap:24px;font-size:12px;margin-top:2px"><span style="color:${MUTE}">Change</span><span class="tnum">${pts >= 0 ? "+" : ""}${pts.toFixed(1)} pts</span></div>`;
              }
            }
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
        axisLabel: {
          color: MUTE,
          fontSize: 10,
          fontFamily: "Libre Franklin, sans-serif",
          interval: sliced.length > 10 ? 1 : 0,
        },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: HAIR, type: "solid", width: 1 } },
        axisLabel: {
          color: MUTE,
          fontSize: 10,
          fontFamily: "Libre Franklin, sans-serif",
          formatter: (v: number) => (meta.unit === "pct" ? `${v}%` : fmtMoney(v)),
        },
      },
      dataZoom: sliced.length > 14 ? [{
        type: "inside",
        start: 0,
        end: 100,
      }, {
        type: "slider",
        height: 18,
        bottom: 4,
        borderColor: "transparent",
        backgroundColor: "rgba(12,11,10,0.03)",
        fillerColor: "rgba(44,80,77,0.12)",
        handleStyle: { color: BRAND },
        textStyle: { color: MUTE, fontSize: 9 },
      }] : [],
      series: [
        {
          name: "Actual",
          type: "line",
          data: actual,
          smooth: 0.35,
          symbol: "circle",
          symbolSize: (_: number, params: any) => (params.dataIndex === activeIdx ? 10 : 5),
          showSymbol: true,
          lineStyle: { width: 2.5, color: BRAND },
          itemStyle: { color: BRAND, borderColor: "#FBF8F1", borderWidth: 2 },
          areaStyle: {
            color: {
              type: "linear", x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(44,80,77,0.22)" },
                { offset: 1, color: "rgba(44,80,77,0.00)" },
              ],
            },
          },
          markPoint: {
            symbol: "circle",
            symbolSize: 12,
            data: [{ coord: [labels[activeIdx], actual[activeIdx]], itemStyle: { color: BRAND } }],
            label: { show: false },
          },
        },
        ...(hasPrior ? [{
          name: "Prior year",
          type: "line" as const,
          data: priorSeries,
          smooth: 0.35,
          symbol: "none",
          lineStyle: { width: 1.5, color: GOLD, type: "dashed" as const },
        }] : []),
      ],
    };
  }, [sliced, periods, lens, activePeriodId, showPriorYear, meta.unit, meta.label]);

  useEffect(() => {
    if (!el.current) return;
    chart.current = echarts.init(el.current, undefined, { renderer: "canvas" });
    const onResize = () => chart.current?.resize();
    window.addEventListener("resize", onResize);

    chart.current.on("updateAxisPointer", (e: any) => {
      const idx = e?.axesInfo?.[0]?.value;
      if (typeof idx === "number" && sliced[idx]) onPeriodHover?.(sliced[idx].periodId);
    });
    chart.current.on("globalout", () => onPeriodHover?.(null));

    return () => {
      window.removeEventListener("resize", onResize);
      chart.current?.dispose();
      chart.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);

  return (
    <div
      className="ov2-chart"
      ref={el}
      role="img"
      aria-label={`${meta.label} trend for ${sliced.map((p) => p.label).join(", ")}`}
    />
  );
}

export { fmtMoney, fmtVal };
