/** Play / studio palettes — UX structure stays fixed; tokens swap. */

export type CCPaletteId = "hathorn" | "northbridge" | "jade" | "navy" | "ink";

export type CCPalette = {
  id: CCPaletteId;
  name: string;
  brand: string;
  accent: string;
};

export const CC_PALETTES: CCPalette[] = [
  { id: "hathorn", name: "Hathorn", brand: "#2C504D", accent: "#DB5928" },
  { id: "northbridge", name: "Northbridge", brand: "#C45C26", accent: "#2C504D" },
  { id: "jade", name: "Jade", brand: "#0C9B74", accent: "#3D8FD1" },
  { id: "navy", name: "Navy", brand: "#1D3557", accent: "#E07A3D" },
  { id: "ink", name: "Ink", brand: "#1F2933", accent: "#C4A35A" },
];

export const CC_PALETTE_STORAGE_KEY = "hathorn-cc-palette";
