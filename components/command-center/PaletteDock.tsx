"use client";

import { CC_PALETTES, type CCPaletteId } from "@/lib/command-center/palettes";
import { cn } from "@/lib/utils";

export default function PaletteDock({
  value,
  onChange,
}: {
  value: CCPaletteId;
  onChange: (id: CCPaletteId) => void;
}) {
  return (
    <div className="cc-palette-dock" title="Colors are tokens — UX stays the same">
      <span className="cc-palette-label">Palette</span>
      <div className="cc-swatches" role="radiogroup" aria-label="Color palette">
        {CC_PALETTES.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={value === p.id}
            aria-label={p.name}
            title={p.name}
            className={cn("cc-swatch", value === p.id && "on")}
            onClick={() => onChange(p.id)}
          >
            <i style={{ background: p.brand, ["--s2" as string]: p.accent }} />
          </button>
        ))}
      </div>
      <em className="cc-palette-name">{CC_PALETTES.find((p) => p.id === value)?.name}</em>
    </div>
  );
}
