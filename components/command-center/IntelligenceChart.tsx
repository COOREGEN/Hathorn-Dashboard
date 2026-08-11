"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { CCLens, CCPeriod, CCAnnotation } from "@/lib/command-center/model";
import { LENS_META } from "@/lib/command-center/model";
import {
  budgetSeries,
  detectAnomalies,
  forecastBand,
  fmtVal,
  priorYearSeries,
  seriesFor,
} from "@/lib/command-center/intelligence";

type SeriesMode = "actual" | "prior" | "budget" | "all";

export default function IntelligenceChart({
  periods,
  lens,
  activePeriodId,
  hoverIndex,
  onHoverIndex,
  onSelectIndex,
  range,
  seriesMode,
  showBand,
  showAnomalies,
  brushZoom,
  annotations,
  highlighted,
}: {
  periods: CCPeriod[];
  lens: CCLens;
  activePeriodId: string;
  hoverIndex: number | null;
  onHoverIndex: (i: number | null) => void;
  onSelectIndex: (i: number) => void;
  range: "6M" | "12M" | "24M" | "YTD" | "ALL";
  seriesMode: SeriesMode;
  showBand: boolean;
  showAnomalies: boolean;
  brushZoom: boolean;
  annotations: CCAnnotation[];
  highlighted: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.EChartsType | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;

    const onMove = (params: unknown) => {
      const p = params as { batch?: { dataIndex?: number }[]; dataIndex?: number };
      const idx = p.batch?.[0]?.dataIndex ?? p.dataIndex;
      if (typeof idx === "number") onHoverIndex(idx);
    };
    const onOut = () => onHoverIndex(null);
    const onClick = (params: unknown) => {
      const p = params as { dataIndex?: number };
      if (typeof p.dataIndex === "number") onSelectIndex(p.dataIndex);
    };

    chart.on("updateAxisPointer", onMove);
    chart.on("globalout", onOut);
    chart.on("click", onClick);

    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.off("updateAxisPointer", onMove);
      chart.off("globalout", onOut);
      chart.off("click", onClick);
      chart.dispose();
      chartRef.current = null;
    };
  }, [onHoverIndex, onSelectIndex]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const activeIdx = periods.findIndex((p) => p.id === activePeriodId);
    const sliced = slicePeriods(periods, activeIdx, range);
    const offset = periods.length - sliced.length;
    const labels = sliced.map((p) => p.label.replace(/ 20/, " ’"));
    const actual = seriesFor(sliced, lens);
    const prior = priorYearSeries(sliced, lens, sliced.length - 1);
    const budget = budgetSeries(sliced, lens);
    const band = forecastBand(actual);
    const anomalies = showAnomalies ? detectAnomalies(actual, labels) : [];
    const meta = LENS_META[lens];
    const brand = cssVar("--brand") || "#2C504D";
    const accent = cssVar("--accent") || "#DB5928";
    const mute = cssVar("--ink-mute") || "#6E675B";
    const ink = cssVar("--ink") || "#0C0B0A";
    const paper = cssVar("--paper") || "#FBF8F1";
    const hair = cssVar("--hairline") || "#E4DCC9";

    const markPoints = [
      ...anomalies.map((a) => ({
        name: "Anomaly",
        coord: [a.index, actual[a.index]],
        value: a.label,
        itemStyle: { color: accent },
        label: { formatter: "!", color: paper, fontSize: 10, fontWeight: 700 },
        symbolSize: 18,
      })),
      ...annotations
        .map((ann) => {
          const i = sliced.findIndex((p) => p.id === ann.periodId);
          if (i < 0) return null;
          return {
            name: ann.kind,
            coord: [i, actual[i]],
            value: ann.label,
            itemStyle: { color: ann.kind === "break" ? accent : brand },
            label: { formatter: ann.kind === "break" ? "↺" : "·", color: paper, fontSize: 10 },
            symbolSize: 16,
          };
        })
        .filter(Boolean),
    ];

    const series: echarts.SeriesOption[] = [];

    if (seriesMode === "actual" || seriesMode === "all") {
      series.push({
        id: "actual",
        name: "Actual",
        type: "line",
        data: actual,
        smooth: 0.28,
        symbol: "circle",
        symbolSize: 8,
        lineStyle: { width: highlighted ? 3.2 : 2.4, color: brand },
        itemStyle: {
          color: brand,
          borderColor: paper,
          borderWidth: 2,
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: hexAlpha(brand, 0.22) },
            { offset: 1, color: hexAlpha(brand, 0) },
          ]),
        },
        markPoint: markPoints.length ? { data: markPoints as echarts.MarkPointComponentOption["data"] } : undefined,
        markLine:
          activeIdx - offset >= 0
            ? {
                symbol: "none",
                label: { show: false },
                lineStyle: { color: hexAlpha(ink, 0.2), type: "dashed", width: 1 },
                data: [{ xAxis: activeIdx - offset }],
              }
            : undefined,
        universalTransition: { enabled: true, divideShape: "clone" },
        animationDuration: 350,
        animationEasing: "cubicOut",
      });
    }

    if (seriesMode === "prior" || seriesMode === "all") {
      series.push({
        id: "prior",
        name: "Prior year",
        type: "line",
        data: prior,
        smooth: 0.28,
        symbol: "none",
        lineStyle: { width: 1.6, type: "dashed", color: hexAlpha(mute, 0.85) },
        animationDuration: 350,
      });
    }

    if ((seriesMode === "budget" || seriesMode === "all") && lens === "revenue") {
      series.push({
        id: "budget",
        name: "Budget",
        type: "line",
        data: budget,
        smooth: 0.2,
        symbol: "none",
        lineStyle: { width: 1.5, type: "dotted", color: accent },
        animationDuration: 350,
      });
    }

    if (showBand) {
      series.push({
        id: "band-hi",
        name: "Confidence",
        type: "line",
        data: band.hi,
        lineStyle: { opacity: 0 },
        stack: "band",
        symbol: "none",
        areaStyle: { color: hexAlpha(brand, 0.08) },
        tooltip: { show: false },
      });
      series.push({
        id: "band-lo",
        name: "Confidence lo",
        type: "line",
        data: band.lo.map((v, i) => (v != null && band.hi[i] != null ? band.hi[i]! - v : null)),
        lineStyle: { opacity: 0 },
        stack: "band",
        symbol: "none",
        areaStyle: { color: hexAlpha(brand, 0.1) },
        tooltip: { show: false },
      });
    }

    chart.setOption(
      {
        animationDuration: 350,
        animationEasing: "cubicOut",
        axisPointer: {
          type: "cross",
          snap: true,
          label: {
            backgroundColor: ink,
            color: paper,
            fontFamily: "Libre Franklin Variable, Libre Franklin, sans-serif",
            fontSize: 11,
            formatter: (p: { value?: string | number; axisDimension?: string }) => {
              if (p.axisDimension === "y" && typeof p.value === "number") return fmtVal(p.value, meta.unit);
              return String(p.value ?? "");
            },
          },
          crossStyle: { color: hexAlpha(ink, 0.25), width: 1 },
          lineStyle: { color: hexAlpha(brand, 0.45), width: 1 },
        },
        brush: brushZoom
          ? {
              toolbox: ["lineX", "clear"],
              xAxisIndex: 0,
              brushStyle: { borderWidth: 1, color: hexAlpha(brand, 0.08), borderColor: brand },
            }
          : undefined,
        toolbox: brushZoom
          ? {
              right: 8,
              top: 0,
              itemSize: 14,
              feature: {
                brush: { type: ["lineX", "clear"] },
                dataZoom: { yAxisIndex: "none" },
                restore: {},
              },
              iconStyle: { borderColor: mute },
            }
          : undefined,
        dataZoom: brushZoom
          ? [
              { type: "inside", xAxisIndex: 0, filterMode: "none" },
              { type: "slider", height: 18, bottom: 0, borderColor: hair, fillerColor: hexAlpha(brand, 0.12), handleStyle: { color: brand } },
            ]
          : [{ type: "inside", xAxisIndex: 0, filterMode: "none" }],
        grid: { left: 8, right: 12, top: 28, bottom: brushZoom ? 42 : 12, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "cross" },
          backgroundColor: paper,
          borderColor: hair,
          textStyle: { color: ink, fontFamily: "Libre Franklin Variable, Libre Franklin, sans-serif", fontSize: 12 },
          extraCssText: "border-radius:12px;box-shadow:0 12px 28px rgba(12,11,10,0.08);padding:10px 12px;",
          formatter: (params: unknown) => {
            const ps = params as { seriesName: string; value: number | null; marker: string; dataIndex: number }[];
            const head = labels[ps[0]?.dataIndex] ?? "";
            const rows = ps
              .filter((p) => p.seriesName !== "Confidence" && p.seriesName !== "Confidence lo" && p.value != null)
              .map((p) => `${p.marker} ${p.seriesName}: <b>${fmtVal(Number(p.value), meta.unit)}</b>`)
              .join("<br/>");
            return `<div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;opacity:.55;margin-bottom:4px">${head}</div>${rows}`;
          },
        },
        xAxis: {
          type: "category",
          data: labels,
          boundaryGap: false,
          axisTick: { show: false },
          axisLine: { lineStyle: { color: hair } },
          axisLabel: {
            color: mute,
            fontFamily: "Libre Franklin Variable, Libre Franklin, sans-serif",
            fontSize: 10,
            fontWeight: 600,
          },
        },
        yAxis: {
          type: "value",
          splitLine: { lineStyle: { color: hexAlpha(ink, 0.06), type: "dashed" } },
          axisLabel: {
            color: mute,
            fontFamily: "Libre Franklin Variable, Libre Franklin, sans-serif",
            fontSize: 10,
            formatter: (v: number) => (meta.unit === "pct" ? `${v}%` : `$${v}K`),
          },
        },
        series,
      },
      { replaceMerge: ["series"] },
    );

    if (hoverIndex != null) {
      chart.dispatchAction({ type: "showTip", seriesIndex: 0, dataIndex: hoverIndex });
    }
  }, [
    periods,
    lens,
    activePeriodId,
    hoverIndex,
    range,
    seriesMode,
    showBand,
    showAnomalies,
    brushZoom,
    annotations,
    highlighted,
  ]);

  return <div ref={ref} className="cc-chart-canvas" role="img" aria-label={`${LENS_META[lens].label} chart`} />;
}

function slicePeriods(periods: CCPeriod[], activeIdx: number, range: string) {
  const end = activeIdx + 1;
  if (range === "ALL") return periods.slice(0, end);
  if (range === "YTD") {
    const y = periods[activeIdx]?.year;
    return periods.filter((p, i) => p.year === y && i <= activeIdx);
  }
  const n = range === "6M" ? 6 : range === "24M" ? 24 : 12;
  return periods.slice(Math.max(0, end - n), end);
}

function cssVar(name: string) {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function hexAlpha(hex: string, a: number) {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
