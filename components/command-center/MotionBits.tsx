"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useSpring, useTransform } from "motion/react";

export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
}) {
  const spring = useSpring(value, { stiffness: 120, damping: 24, mass: 0.6 });
  const [text, setText] = useState(format(value));
  const prev = useRef(value);

  useEffect(() => {
    spring.set(value);
    prev.current = value;
  }, [value, spring]);

  useEffect(() => {
    const unsub = spring.on("change", (v) => setText(format(v)));
    return () => unsub();
  }, [spring, format]);

  return (
    <motion.span
      className={className}
      key={Math.round(value * 10)}
      initial={{ opacity: 0.72, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {text}
    </motion.span>
  );
}

export function MicroSpark({
  values,
  active,
  tone = "brand",
}: {
  values: number[];
  active?: boolean;
  tone?: "brand" | "up" | "down";
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 72;
  const h = 28;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  const stroke = tone === "down" ? "var(--accent)" : tone === "up" ? "var(--brand)" : "var(--brand)";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className={active ? "opacity-100" : "opacity-70"}>
      <polyline fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" points={pts} />
    </svg>
  );
}
