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

export type ChartPointSelect = {
  index: number;
  periodId: string;
  label: string;
  value: number;
  pixel: { x: number; y: number };
};

export default function IntelligenceChart({
  periods,
  lens,
  activePeriodId,
  hoverIndex,
  focusIndex,
  highlightIndices,
  onHoverIndex,
  onSelectPoint,
  onBrushRange,
  onReset,
  range,
  seriesMode,
  showBand,
  showAnomalies,
  brushZoom,
  annotations,
}: {
  periods: CCPeriod[];
  lens: CCLens;
  activePeriodId: string;
  hoverIndex: number | null;
  focusIndex: number | null;
  highlightIndices: number[];
  onHoverIndex: (i: number | null) => void;
  onSelectPoint: (ev: ChartPointSelect) => void;
  onBrushRange: (range: [number, number] | null) => void;
  onReset: () => void;
  range: "6M" | "12M" | "24M" | "YTD" | "ALL";
  seriesMode: SeriesMode;
  showBand: boolean;
  showAnomalies: boolean;
  brushZoom: boolean;
  annotations: CCAnnotation[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.EChartsType | null>(null);
  const slicedRef = useRef<CCPeriod[]>([]);
  const actualRef = useRef<number[]>([]);
  const cb = useRef({ onHoverIndex, onSelectPoint, onBrushRange, onReset });
  cb.current = { onHoverIndex, onSelectPoint, onBrushRange, onReset };

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;

    const onMove = (params: unknown) => {
      const p = params as { axesInfo?: Array<{ value?: number }>; batch?: { dataIndex?: number }[]; dataIndex?: number };
      const idx = p.axesInfo?.[0]?.value ?? p.batch?.[0]?.dataIndex ?? p.dataIndex;
      cb.current.onHoverIndex(typeof idx === "number" ? idx : null);
    };
    const onOut = () => cb.current.onHoverIndex(null);
    const emitSelect = (i: number) => {
      const period = slicedRef.current[i];
      const value = actualRef.current[i];
      if (!period || value == null || !ref.current) return;
      const pixel = chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [i, value]) as number[];
      const host = ref.current.getBoundingClientRect();
      cb.current.onSelectPoint({
        index: i,
        periodId: period.id,
        label: period.label,
        value,
        pixel: { x: host.left + (pixel[0] ?? 0), y: host.top + (pixel[1] ?? 0) },
      });
    };

    const onClick = (params: unknown) => {
      const p = params as { componentType?: string; dataIndex?: number };
      if (typeof p.dataIndex === "number") {
        emitSelect(p.dataIndex);
        return;
      }
    };

    // Magnetic click: nearest category when clicking the plot (not only the symbol).
    const onZrClick = (e: { offsetX: number; offsetY: number }) => {
      try {
        const pointInPixel = [e.offsetX, e.offsetY];
        const raw = chart.convertFromPixel({ gridIndex: 0 }, pointInPixel);
        const x = Array.isArray(raw) ? Number(raw[0]) : Number(raw);
        if (Number.isNaN(x)) return;
        const i = Math.max(0, Math.min(slicedRef.current.length - 1, Math.round(x)));
        emitSelect(i);
      } catch {
        /* chart not ready */
      }
    };
    const onBrushEnd = (params: unknown) => {
      const p = params as { areas?: Array<{ coordRange?: number[] }> };
      const range = p.areas?.[0]?.coordRange;
      if (!range || range.length < 2) {
        cb.current.onBrushRange(null);
        return;
      }
      const a = Math.max(0, Math.round(Math.min(range[0], range[1])));
      const b = Math.min(slicedRef.current.length - 1, Math.round(Math.max(range[0], range[1])));
      cb.current.onBrushRange(a <= b ? [a, b] : null);
    };
    const onDbl = () => cb.current.onReset();

    chart.on("updateAxisPointer", onMove);
    chart.on("globalout", onOut);
    chart.on("click", onClick);
    chart.on("brushEnd", onBrushEnd);
    chart.getZr().on("click", onZrClick);
    ref.current.addEventListener("dblclick", onDbl);

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);

    return () => {
      ref.current?.removeEventListener("dblclick", onDbl);
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const host = ref.current;
    if (!chart || !host) return;

    const activeIdx = periods.findIndex((p) => p.id === activePeriodId);
    const sliced = slicePeriods(periods, activeIdx, range);
    slicedRef.current = sliced;
    const offset = periods.indexOf(sliced[0]!) >= 0 ? periods.indexOf(sliced[0]!) : 0;
    const labels = sliced.map((p) => p.label.replace(/ 20/, " ’"));
    const actual = seriesFor(sliced, lens);
    actualRef.current = actual;
    const prior = priorYearSeries(sliced, lens, sliced.length - 1);
    const budget = budgetSeries(sliced, lens);
    const band = forecastBand(actual);
    const anomalies = showAnomalies ? detectAnomalies(actual, labels) : [];
    const meta = LENS_META[lens];
    const brand = cssVar(host, "--brand") || "#0C9B74";
    const accent = cssVar(host, "--accent") || "#3D8FD1";
    const mute = cssVar(host, "--ink-mute") || "#5A6F66";
    const ink = cssVar(host, "--ink") || "#0D1B16";
    const paper = cssVar(host, "--paper") || "#F3F7F4";
    const hair = cssVar(host, "--hairline") || "#D7E4DC";
    const hiSet = new Set(highlightIndices);

    const markPoints: echarts.MarkPointComponentOption["data"] = [];

    if (showAnomalies) {
      for (const a of anomalies.slice(0, 3)) {
        markPoints.push({
          name: "anomaly",
          coord: [a.index, actual[a.index]],
          symbol: "diamond",
          symbolSize: 10,
          itemStyle: { color: accent },
          label: { show: false },
        });
      }
      for (const ann of annotations) {
        const i = sliced.findIndex((p) => p.id === ann.periodId);
        if (i < 0) continue;
        const glyph =
          ann.kind === "break" ? "▲" : ann.kind === "anomaly" ? "◆" : "○";
        const color = ann.kind === "break" ? accent : ann.kind === "anomaly" ? accent : brand;
        markPoints.push({
          name: ann.kind,
          coord: [i, actual[i]],
          symbol: "circle",
          symbolSize: 7,
          itemStyle: { color },
          label: {
            show: true,
            formatter: glyph,
            color,
            fontSize: 10,
            distance: 10,
            fontFamily: "Libre Franklin Variable, Libre Franklin, sans-serif",
          },
        });
      }
      // Budget miss markers (revenue only)
      if (lens === "revenue") {
        budget.forEach((b, i) => {
          if (b == null) return;
          const v = actual[i]!;
          if (v < b - 1) {
            markPoints.push({
              name: "budget_miss",
              coord: [i, v],
              symbol: "circle",
              symbolSize: 6,
              itemStyle: { color: accent },
              label: { show: true, formatter: "●", color: accent, fontSize: 9, distance: 8 },
            });
          }
        });
      }
    }

    const markArea: echarts.MarkAreaComponentOption | undefined =
      highlightIndices.length > 0
        ? {
            silent: true,
            itemStyle: { color: hexAlpha(brand, 0.07) },
            data: highlightIndices
              .filter((i) => i >= 0 && i < sliced.length)
              .map((i) => [{ xAxis: i - 0.42 }, { xAxis: i + 0.42 }] as [{ xAxis: number }, { xAxis: number }]),
          }
        : undefined;

    const series: echarts.SeriesOption[] = [];

    if (seriesMode === "actual" || seriesMode === "all") {
      series.push({
        id: "actual",
        name: "Actual",
        type: "line",
        data: actual,
        smooth: 0.28,
        symbol: "circle",
        symbolSize: (_: number, params: { dataIndex: number }) => {
          const i = params.dataIndex;
          if (focusIndex === i || hoverIndex === i) return 12;
          if (hiSet.has(i)) return 9;
          return 6;
        },
        lineStyle: { width: focusIndex != null || highlightIndices.length ? 2.8 : 2.4, color: brand },
        itemStyle: {
          color: (params: { dataIndex: number }) => {
            const i = params.dataIndex;
            if (focusIndex === i || hiSet.has(i)) return accent;
            return brand;
          },
          borderColor: paper,
          borderWidth: 2,
        },
        emphasis: {
          scale: false,
          itemStyle: { color: accent, borderWidth: 2, shadowBlur: 0 },
          lineStyle: { width: 3 },
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: hexAlpha(brand, 0.18) },
            { offset: 1, color: hexAlpha(brand, 0) },
          ]),
        },
        markPoint: markPoints.length ? { data: markPoints, animation: false } : undefined,
        markArea,
        markLine:
          focusIndex != null
            ? {
                symbol: "none",
                label: { show: false },
                lineStyle: { color: hexAlpha(accent, 0.55), type: "solid", width: 1 },
                data: [{ xAxis: focusIndex }],
              }
            : activeIdx - offset >= 0
              ? {
                  symbol: "none",
                  label: { show: false },
                  lineStyle: { color: hexAlpha(ink, 0.18), type: "dashed", width: 1 },
                  data: [{ xAxis: Math.min(sliced.length - 1, Math.max(0, activeIdx - offset)) }],
                }
              : undefined,
        universalTransition: { enabled: true, divideShape: "clone" },
        animationDuration: 340,
        animationDurationUpdate: 320,
        animationEasing: "cubicOut",
        animationEasingUpdate: "cubicOut",
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
        silent: true,
        lineStyle: { width: 1.4, type: "dashed", color: hexAlpha(mute, 0.85) },
        animationDuration: 340,
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
        silent: true,
        lineStyle: { width: 1.4, type: "dotted", color: accent },
        animationDuration: 340,
      });
    }

    if (showBand) {
      series.push({
        id: "band-lo",
        name: "Confidence lo",
        type: "line",
        data: band.lo,
        lineStyle: { opacity: 0 },
        stack: "band",
        symbol: "none",
        silent: true,
        tooltip: { show: false },
      });
      series.push({
        id: "band-hi",
        name: "Confidence",
        type: "line",
        data: band.hi.map((h, i) =>
          h != null && band.lo[i] != null ? h - (band.lo[i] as number) : null,
        ),
        lineStyle: { opacity: 0 },
        stack: "band",
        symbol: "none",
        silent: true,
        areaStyle: { color: hexAlpha(brand, 0.08) },
        tooltip: { show: false },
      });
    }

    chart.setOption(
      {
        animationDuration: 340,
        animationDurationUpdate: 320,
        animationEasing: "cubicOut",
        animationEasingUpdate: "cubicOut",
        axisPointer: {
          type: "cross",
          snap: true,
          label: {
            backgroundColor: ink,
            color: paper,
            fontFamily: "Libre Franklin Variable, Libre Franklin, sans-serif",
            fontSize: 10,
            borderRadius: 2,
            padding: [3, 6],
            formatter: (p: { value?: string | number; axisDimension?: string }) => {
              if (p.axisDimension === "y" && typeof p.value === "number") return fmtVal(p.value, meta.unit);
              return String(p.value ?? "");
            },
          },
          crossStyle: { color: hexAlpha(ink, 0.28), width: 1, type: "dashed" },
          lineStyle: { color: hexAlpha(brand, 0.4), width: 1, type: "dashed" },
        },
        brush: brushZoom
          ? {
              toolbox: ["lineX", "clear"],
              xAxisIndex: 0,
              brushStyle: { borderWidth: 1, color: hexAlpha(accent, 0.08), borderColor: accent },
              outOfBrush: { colorAlpha: 0.4 },
            }
          : undefined,
        toolbox: brushZoom
          ? {
              right: 8,
              top: 0,
              itemSize: 13,
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
              {
                type: "slider",
                height: 16,
                bottom: 2,
                borderColor: hair,
                fillerColor: hexAlpha(brand, 0.12),
                handleStyle: { color: brand },
              },
            ]
          : [{ type: "inside", xAxisIndex: 0, filterMode: "none", zoomOnMouseWheel: false, moveOnMouseMove: true }],
        grid: { left: 4, right: 8, top: 24, bottom: brushZoom ? 40 : 8, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "cross", snap: true },
          backgroundColor: paper,
          borderColor: hair,
          borderWidth: 1,
          textStyle: {
            color: ink,
            fontFamily: "EB Garamond Variable, EB Garamond, serif",
            fontSize: 13,
          },
          extraCssText: "border-radius:4px;box-shadow:0 8px 24px rgba(13,27,22,0.08);padding:10px 12px;",
          formatter: (params: unknown) => {
            const ps = params as { seriesName: string; value: number | null; marker: string; dataIndex: number }[];
            const head = labels[ps[0]?.dataIndex] ?? "";
            const rows = ps
              .filter((p) => p.seriesName !== "Confidence" && p.seriesName !== "Confidence lo" && p.value != null)
              .map((p) => `${p.marker} ${p.seriesName}: <b style="font-variant-numeric:tabular-nums">${fmtVal(Number(p.value), meta.unit)}</b>`)
              .join("<br/>");
            return `<div style="font-family:Libre Franklin,sans-serif;font-size:10px;letter-spacing:.1em;text-transform:uppercase;opacity:.55;margin-bottom:4px">${head}</div>${rows}`;
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
          scale: true,
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
    focusIndex,
    highlightIndices,
    range,
    seriesMode,
    showBand,
    showAnomalies,
    brushZoom,
    annotations,
  ]);

  return <div ref={ref} className="cc-chart-canvas" role="img" aria-label={`${LENS_META[lens].label} chart · double-click to reset`} />;
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

function cssVar(el: HTMLElement, name: string) {
  return getComputedStyle(el.closest(".cc-root") ?? el).getPropertyValue(name).trim();
}

function hexAlpha(hex: string, a: number) {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
