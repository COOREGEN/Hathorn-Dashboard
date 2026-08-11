"use client";

import { useEffect, useMemo, useState } from "react";
import { MagnifyingGlass, ArrowRight } from "@phosphor-icons/react";
import { Modal } from "@/components/ui/modal";
import type { CCLens } from "@/lib/command-center/model";
import { LENS_META } from "@/lib/command-center/model";

type Item = { id: string; label: string; hint?: string; run: () => void };

export default function CommandPalette({
  open,
  onOpenChange,
  suggestions,
  onAsk,
  onLens,
  onToggle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  suggestions: string[];
  onAsk: (q: string) => void;
  onLens: (l: CCLens) => void;
  onToggle: (key: "band" | "anomalies" | "brush" | "focus") => void;
}) {
  const [q, setQ] = useState("");

  useEffect(() => {
    if (open) setQ("");
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const base: Item[] = [
      ...suggestions.map((s, i) => ({ id: `ask-${i}`, label: s, hint: "Ask Hathorn", run: () => onAsk(s) })),
      ...(Object.keys(LENS_META) as CCLens[]).map((l) => ({
        id: `lens-${l}`,
        label: `Focus ${LENS_META[l].label}`,
        hint: "Lens",
        run: () => onLens(l),
      })),
      { id: "band", label: "Toggle forecast confidence band", hint: "Chart", run: () => onToggle("band") },
      { id: "anom", label: "Toggle anomaly markers", hint: "Chart", run: () => onToggle("anomalies") },
      { id: "brush", label: "Toggle brush / semantic zoom", hint: "Chart", run: () => onToggle("brush") },
      { id: "focus", label: "Toggle fullscreen focus", hint: "View", run: () => onToggle("focus") },
    ];
    const query = q.trim().toLowerCase();
    if (!query) return base;
    return base.filter((i) => i.label.toLowerCase().includes(query));
  }, [q, suggestions, onAsk, onLens, onToggle]);

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Command">
      <div className="cc-cmd">
        <div className="cc-cmd-input">
          <MagnifyingGlass size={18} weight="bold" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ask Hathorn or jump to a control…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && items[0]) {
                items[0].run();
                onOpenChange(false);
              }
            }}
          />
        </div>
        <ul className="cc-cmd-list">
          {items.slice(0, 8).map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  item.run();
                  onOpenChange(false);
                }}
              >
                <span>{item.label}</span>
                <em>
                  {item.hint}
                  <ArrowRight size={12} />
                </em>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
