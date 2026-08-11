"use client";
import { useMemo } from "react";
import EChart, { baseChartOption } from "./EChart";

export type VarianceRow = {
  label: string;
  dollar: number;
  pct: number | null;
};

/** Dollar variance bars; percentage in tooltip. */
export default function VarianceChart({ rows, title }: { rows: VarianceRow[]; title?: string }) {
  const option = useMemo(() => {
    if (!rows.length) return null;
    return baseChartOption({
      title: title ? {
        text: title, left: 0, top: 0,
        textStyle: { fontSize: 12, fontWeight: 500, color: "#6E675B",
          fontFamily: "Libre Franklin, sans-serif" },
      } : undefined,
      grid: { left: 48, right: 20, top: title ? 40 : 24, bottom: 40 },
      xAxis: { type: "category", data: rows.map((r) => r.label) },
      tooltip: {
        trigger: "axis",
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          const row = rows[p.dataIndex];
          const pct = row?.pct == null ? "" : ` (${row.pct >= 0 ? "+" : ""}${row.pct.toFixed(1)} pts)`;
          return `${row.label}<br/>${row.dollar >= 0 ? "+" : ""}$${row.dollar.toFixed(1)}K${pct}`;
        },
      },
      series: [{
        type: "bar",
        data: rows.map((r) => ({
          value: r.dollar,
          itemStyle: { color: r.dollar >= 0 ? "#2C504D" : "#9E401D" },
        })),
        barMaxWidth: 36,
      }],
    });
  }, [rows, title]);

  return (
    <EChart option={option} empty={!rows.length} emptyLabel="No variance to show yet." />
  );
}
