"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CaretRight, Sparkle, X } from "@phosphor-icons/react";
import type { PointIntel } from "./PointPopover";
import { fmtVal } from "@/lib/command-center/intelligence";
import { LENS_META } from "@/lib/command-center/model";

type Step = { id: string; label: string; detail: string };

function buildSteps(point: PointIntel): Step[] {
  const meta = LENS_META[point.lens];
  const figure = fmtVal(point.value, meta.unit);
  return [
    { id: "figure", label: `${figure} ${meta.label}`, detail: `${point.label} · consolidated statement figure` },
    { id: "entity", label: "Entity · Home care", detail: "78% of consolidated movement this month" },
    { id: "line", label: "Business line · Direct care", detail: "Core attendant + skilled hours" },
    { id: "period", label: `Period · ${point.label}`, detail: "Published close · gate clear" },
    { id: "payer", label: "Payer mix · Medicaid + private", detail: "Largest lift from rate mix, not census alone" },
    { id: "source", label: "Source · Claims / payroll register", detail: "Demo fixture — live path ties to QBO + payroll CSV" },
    { id: "driver", label: `Variance · ${point.driver}`, detail: point.why },
    { id: "ask", label: "Hathorn explanation", detail: point.what },
  ];
}

export default function FinancialTrace({
  open,
  point,
  onClose,
  onAsk,
}: {
  open: boolean;
  point: PointIntel | null;
  onClose: () => void;
  onAsk: (q: string) => void;
}) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
  }, [point?.periodId, point?.lens, open]);
  if (!open || !point) return null;
  const steps = buildSteps(point);
  const visible = steps.slice(0, step + 1);

  return (
    <AnimatePresence>
      <motion.aside
        className="cc-trace"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 16 }}
        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
        aria-label="Financial Trace"
      >
        <div className="cc-trace-head">
          <div>
            <div className="cc-eyebrow">Financial Trace</div>
            <h2>Where this number came from</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close trace"><X size={14} /></button>
        </div>
        <ol className="cc-trace-steps">
          {visible.map((s, i) => (
            <motion.li
              key={s.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: i * 0.03 }}
              className={i === step ? "on" : ""}
            >
              <span className="n">{i + 1}</span>
              <div>
                <strong>{s.label}</strong>
                <p>{s.detail}</p>
              </div>
            </motion.li>
          ))}
        </ol>
        <div className="cc-trace-actions">
          {step < steps.length - 1 ? (
            <button type="button" className="primary" onClick={() => setStep((s) => s + 1)}>
              Next <CaretRight size={13} />
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={() => onAsk(`Trace ${LENS_META[point.lens].label} in ${point.label} — explain the chain`)}
            >
              <Sparkle size={13} /> Ask Hathorn about this chain
            </button>
          )}
          {step > 0 ? (
            <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))}>Back</button>
          ) : null}
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
