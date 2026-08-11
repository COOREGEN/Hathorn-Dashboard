"use client";

import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { PieChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { fmtMoney } from "./HeroChart";

echarts.use([PieChart, TooltipComponent, CanvasRenderer]);

const COLORS = ["#2C504D", "#4A6B8A", "#DB5928", "#B54A28", "#7A7468", "#2F6B4F"];

export default function ExpenseDonut({
  slices, total,
}: {
  slices: { label: string; amount: number; share: number }[];
  total: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.EChartsType | null>(null);

  const option = useMemo(() => ({
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item" as const,
      backgroundColor: "#FFFCF7",
      borderColor: "rgba(44, 80, 77, 0.16)",
      textStyle: { color: "#1A1A18", fontSize: 12 },
      formatter: (p: any) =>
        `${p.name}<br/><b>${fmtMoney(p.value)}</b> · ${p.percent?.toFixed?.(1) ?? p.data?.share}%`,
    },
    series: [{
      type: "pie" as const,
      radius: ["58%", "78%"],
      center: ["50%", "50%"],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: "#FBF8F1", borderWidth: 3 },
      label: { show: false },
      data: slices.map((s, i) => ({
        name: s.label,
        value: s.amount,
        share: s.share,
        itemStyle: { color: COLORS[i % COLORS.length] },
      })),
    }],
  }), [slices]);

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

  if (!slices.length) {
    return <div className="ov2-donut-empty">No expense composition for this period.</div>;
  }

  return (
    <div className="ov2-donut-wrap">
      <div className="ov2-donut" ref={el} role="img" aria-label="Expense breakdown" />
      <div className="ov2-donut-center">
        <span className="ov2-eyebrow">Expenses</span>
        <strong className="tnum">{fmtMoney(total)}</strong>
      </div>
      <ul className="ov2-donut-legend">
        {slices.map((s, i) => (
          <li key={s.label}>
            <i style={{ background: COLORS[i % COLORS.length] }} />
            <span>{s.label}</span>
            <em className="tnum">{s.share.toFixed(1)}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}
