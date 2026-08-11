"use client";

import { motion } from "motion/react";
import type { CCDriver } from "@/lib/command-center/model";
import { fmtMoney } from "@/lib/command-center/intelligence";
import { cn } from "@/lib/utils";

export default function VarianceWaterfall({
  drivers,
  activeId,
  onSelect,
}: {
  drivers: CCDriver[];
  activeId: string | null;
  onSelect: (d: CCDriver) => void;
}) {
  const movable = drivers.filter((d) => d.kind === "up" || d.kind === "down");
  const mag = Math.max(...movable.map((d) => Math.abs(d.delta)), 1);

  return (
    <ul className="cc-waterfall">
      {drivers.map((d) => {
        if (d.kind === "start" || d.kind === "end") {
          return (
            <li key={d.id} className="cc-waterfall-edge">
              <span>{d.label}</span>
              <strong className="tnum">{fmtMoney(d.delta)}</strong>
            </li>
          );
        }
        const w = Math.max(8, (Math.abs(d.delta) / mag) * 100);
        return (
          <li key={d.id}>
            <button
              type="button"
              className={cn("cc-waterfall-row", activeId === d.id && "on")}
              onClick={() => onSelect(d)}
            >
              <span>{d.label}</span>
              <span className="cc-bar-track">
                <motion.i
                  className={d.kind === "down" ? "down" : "up"}
                  initial={{ scaleX: 0.12 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  style={{ width: `${w}%`, transformOrigin: "left center" }}
                />
              </span>
              <strong className={cn("tnum", d.kind === "down" && "is-down")}>
                {d.delta >= 0 ? "+" : "−"}
                {fmtMoney(Math.abs(d.delta)).replace("$", "$")}
              </strong>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
