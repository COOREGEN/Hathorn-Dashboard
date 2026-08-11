"use client";
/**
 * Hathorn-styled Apache ECharts wrapper.
 * Owns disposal, resize, empty/loading states. Never use default BI chrome.
 */
import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart, BarChart } from "echarts/charts";
import {
  GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, TitleComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";

echarts.use([
  LineChart, BarChart, GridComponent, TooltipComponent,
  LegendComponent, MarkLineComponent, TitleComponent, CanvasRenderer,
]);

const HATHORN_TEXT = "#3A3530";
const HATHORN_MUTE = "#6E675B";
const HATHORN_HAIR = "#E8E5E0";

export default function EChart({
  option, height = 320, loading, empty, emptyLabel = "No data yet",
}: {
  option: EChartsCoreOption | null;
  height?: number;
  loading?: boolean;
  empty?: boolean;
  emptyLabel?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.EChartsType | null>(null);

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
    if (!chart.current) return;
    if (loading) {
      chart.current.showLoading("default", {
        text: "Calculating…", color: "#2C504D", textColor: HATHORN_MUTE,
        maskColor: "rgba(255,253,248,0.7)",
      });
      return;
    }
    chart.current.hideLoading();
    if (!option || empty) {
      chart.current.clear();
      return;
    }
    chart.current.setOption(option, { notMerge: true });
  }, [option, loading, empty]);

  if (empty && !loading) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center",
        borderTop: `1px solid ${HATHORN_HAIR}`, color: HATHORN_MUTE,
        fontFamily: "var(--editorial)", fontSize: 15 }}>
        {emptyLabel}
      </div>
    );
  }

  return <div ref={el} style={{ width: "100%", height }} role="img" aria-label="Financial chart" />;
}

export function baseChartOption(partial: EChartsCoreOption): EChartsCoreOption {
  return {
    animationDuration: 400,
    textStyle: { fontFamily: "Libre Franklin, sans-serif", color: HATHORN_TEXT },
    grid: { left: 48, right: 20, top: 36, bottom: 40 },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#FFFDF8",
      borderColor: HATHORN_HAIR,
      textStyle: { color: HATHORN_TEXT, fontSize: 12 },
    },
    legend: {
      top: 0, left: 0, icon: "roundRect", itemWidth: 12, itemHeight: 3,
      textStyle: { color: HATHORN_MUTE, fontSize: 11, fontFamily: "Libre Franklin, sans-serif" },
    },
    xAxis: {
      type: "category",
      axisLine: { lineStyle: { color: HATHORN_HAIR } },
      axisTick: { show: false },
      axisLabel: { color: HATHORN_MUTE, fontSize: 10 },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: HATHORN_HAIR, type: "dashed" } },
      axisLabel: {
        color: HATHORN_MUTE, fontSize: 10,
        formatter: (v: number) => (Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(1)}M` : `$${v}K`),
      },
    },
    ...partial,
  };
}
