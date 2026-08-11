"use client";

import { AnimatePresence, motion } from "motion/react";
import { Sparkle, Path, X } from "@phosphor-icons/react";
import { fmtVal } from "@/lib/command-center/intelligence";
import type { CCLens } from "@/lib/command-center/model";
import { LENS_META } from "@/lib/command-center/model";

export type PointIntel = {
  index: number;
  periodId: string;
  label: string;
  value: number;
  lens: CCLens;
  what: string;
  why: string;
  impact: string;
  driver: string;
  kind?: "anomaly" | "break" | "budget" | "driver" | "risk" | "opportunity" | "milestone" | null;
};

export default function PointPopover({
  point,
  anchor,
  onClose,
  onAsk,
  onTrace,
}: {
  point: PointIntel | null;
  anchor: { x: number; y: number } | null;
  onClose: () => void;
  onAsk: (q: string) => void;
  onTrace: () => void;
}) {
  if (!point || !anchor) return null;
  const meta = LENS_META[point.lens];

  return (
    <AnimatePresence>
      <motion.div
        className="cc-point-pop"
        style={{ left: Math.min(anchor.x, typeof window !== "undefined" ? window.innerWidth - 320 : anchor.x), top: Math.max(12, anchor.y - 8) }}
        initial={{ opacity: 0, y: 6, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 4, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        role="dialog"
        aria-label="Point intelligence"
      >
        <button type="button" className="cc-point-x" onClick={onClose} aria-label="Close">
          <X size={12} />
        </button>
        <div className="cc-eyebrow">{meta.label} · {point.label}</div>
        <div className="cc-point-val tnum">{fmtVal(point.value, meta.unit)}</div>
        {point.kind ? <div className={`cc-point-kind is-${point.kind}`}>{point.kind}</div> : null}
        <dl className="cc-point-dl">
          <div><dt>What</dt><dd>{point.what}</dd></div>
          <div><dt>Why</dt><dd>{point.why}</dd></div>
          <div><dt>Impact</dt><dd>{point.impact}</dd></div>
          <div><dt>Driver</dt><dd>{point.driver}</dd></div>
        </dl>
        <div className="cc-point-actions">
          <button type="button" onClick={onTrace}><Path size={13} /> Trace</button>
          <button
            type="button"
            className="primary"
            onClick={() => onAsk(`Explain ${meta.label.toLowerCase()} in ${point.label}`)}
          >
            <Sparkle size={13} /> Ask Hathorn
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
