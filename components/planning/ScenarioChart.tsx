"use client";
import { useMemo } from "react";
import EChart, { baseChartOption } from "./EChart";

export type ScenarioSeries = {
  key: string;
  label: string;
  color: string;
  points: { label: string; value: number }[];
};

/** Compare Base / Upside / Downside (or any supplied series). */
export default function ScenarioChart({ series }: { series: ScenarioSeries[] }) {
  const option = useMemo(() => {
    if (!series.length || !series[0].points.length) return null;
    const labels = series[0].points.map((p) => p.label);
    return baseChartOption({
      legend: { data: series.map((s) => s.label) },
      xAxis: { type: "category", data: labels },
      series: series.map((s) => ({
        name: s.label, type: "line",
        data: s.points.map((p) => p.value),
        showSymbol: false,
        lineStyle: { width: 2, color: s.color },
        itemStyle: { color: s.color },
      })),
    });
  }, [series]);

  return (
    <EChart
      option={option}
      empty={!series.length}
      emptyLabel="Run Base, Upside, and Downside to compare."
    />
  );
}
