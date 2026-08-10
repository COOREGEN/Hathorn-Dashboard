"use client";
import { useMemo } from "react";
import EChart, { baseChartOption } from "./EChart";
import type { ActualPoint, ForecastPoint } from "@/lib/fpa/types";

/** Historical ACTUAL line then FORECAST — visually distinct. */
export default function ForecastChart({
  history, forecast, metric = "revenue",
}: {
  history: ActualPoint[];
  forecast: ForecastPoint[];
  metric?: "revenue" | "grossProfit" | "netIncome" | "opex";
}) {
  const option = useMemo(() => {
    if (!history.length && !forecast.length) return null;
    const labels = [
      ...history.map((p) => p.label),
      ...forecast.map((p) => p.label),
    ];
    const actualVals = history.map((p) => p[metric]);
    const forecastVals = [
      ...history.map(() => null as number | null),
      ...forecast.map((p) => p[metric]),
    ];
    // Bridge: last actual connects into forecast series start
    if (history.length && forecast.length) {
      forecastVals[history.length - 1] = history[history.length - 1][metric];
    }
    const actualSeries = [
      ...actualVals,
      ...forecast.map(() => null as number | null),
    ];

    return baseChartOption({
      legend: { data: ["Actual", "Forecast"] },
      xAxis: { type: "category", data: labels },
      series: [
        {
          name: "Actual", type: "line", data: actualSeries,
          showSymbol: true, symbolSize: 5,
          lineStyle: { width: 2.2, color: "#2C504D" },
          itemStyle: { color: "#2C504D" },
        },
        {
          name: "Forecast", type: "line", data: forecastVals,
          showSymbol: true, symbolSize: 5,
          lineStyle: { width: 2.2, type: "dashed", color: "#DB5928" },
          itemStyle: { color: "#DB5928" },
        },
      ],
    });
  }, [history, forecast, metric]);

  return (
    <EChart
      option={option}
      empty={!history.length && !forecast.length}
      emptyLabel="Run a forecast to see actuals flow into the projection."
    />
  );
}
