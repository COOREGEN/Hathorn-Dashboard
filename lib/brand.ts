/**
 * Client branding.
 *
 * The rule the whole system rests on: Hathorn's typography, spacing and hierarchy
 * are constant across every client — that craft is what a client cannot get from
 * a generic reporting tool. The client's own brand enters as an *accent layer*:
 * their mark in the masthead, their two colours on rules, charts and emphasis.
 * Never as a page fill, never as a background behind body text.
 *
 * A client will eventually pick a pale yellow or a near-white. That must not be
 * able to produce unreadable output, so every colour is checked for contrast and
 * darkened until it passes before it reaches the page.
 */

export type BrandInput = {
  brandPrimary: string;
  brandAccent: string;
  logoText: string;
  logoSub?: string | null;
  logoData?: string | null;
  template?: string;
};

/* ---------------------------------------------------------------- */
/* Colour maths                                                      */
/* ---------------------------------------------------------------- */

function parseHex(hex: string): [number, number, number] {
  let h = (hex || "").trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return [44, 80, 77]; // fall back to Hathorn green
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const toHex = (rgb: [number, number, number]) =>
  "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

/** Relative luminance per WCAG 2.1. */
function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(parseHex(a));
  const lb = luminance(parseHex(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const scale = (rgb: [number, number, number], f: number): [number, number, number] =>
  [rgb[0] * f, rgb[1] * f, rgb[2] * f];

/**
 * Darkens a colour step by step until it reaches the target contrast against the
 * page. Returns the original when it already passes, so a well-chosen brand colour
 * is never altered.
 */
function ensureContrast(hex: string, against: string, target: number): string {
  let rgb = parseHex(hex);
  let out = toHex(rgb);
  for (let i = 0; i < 24 && contrastRatio(out, against) < target; i++) {
    rgb = scale(rgb, 0.92);
    out = toHex(rgb);
  }
  return out;
}

const rgba = (hex: string, alpha: number) => {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/* ---------------------------------------------------------------- */
/* Palette                                                           */
/* ---------------------------------------------------------------- */

const PAPER: Record<string, string> = {
  editorial: "#FBF8F1",
  modern: "#FCFAF6",
  executive: "#FFFFFF",
};

export type BrandPalette = {
  vars: Record<string, string>;
  warnings: string[];
  adjusted: boolean;
};

/**
 * Turns a client's two colours into the CSS variables the dashboard consumes.
 *
 * WCAG sets two different bars, and conflating them mangles brand colours for no
 * accessibility gain: small text needs 4.5:1, but graphics and large text only need
 * 3:1. A chart bar is not body copy. Criterion's real orange sits at 3.62:1 on ivory —
 * perfectly legible as a bar, marginal as an 11px label.
 *
 * So each colour produces two values. The client's exact colour is used wherever it
 * appears as colour (fills, rules, borders, the 34px figures), and a darkened variant
 * is derived only for small text. The brand is preserved where anyone would notice,
 * and legible everywhere.
 */
export function buildPalette(input: BrandInput): BrandPalette {
  const paper = PAPER[input.template || "editorial"] || PAPER.editorial;
  const warnings: string[] = [];

  const rawBrand = input.brandPrimary || "#2C504D";
  const rawAccent = input.brandAccent || "#DB5928";

  // Graphics bar — only enforced if the colour would vanish into the page entirely.
  const brand = ensureContrast(rawBrand, paper, 3);
  const accent = ensureContrast(rawAccent, paper, 3);
  // Text bar — always derived, never shown as the client's colour.
  const brandText = ensureContrast(brand, paper, 4.5);
  const accentText = ensureContrast(accent, paper, 4.5);

  if (brand.toLowerCase() !== rawBrand.toLowerCase()) {
    warnings.push(
      `Primary ${rawBrand} was too light to see against this template's paper and was deepened to ${brand}.`,
    );
  }
  if (accent.toLowerCase() !== rawAccent.toLowerCase()) {
    warnings.push(
      `Accent ${rawAccent} was too light to see against this template's paper and was deepened to ${accent}.`,
    );
  }
  if (contrastRatio(rawBrand, rawAccent) < 1.6) {
    warnings.push(
      "The two colours are close together — charts that rely on both will be hard to read.",
    );
  }

  return {
    vars: {
      // Exactly what the client chose — fills, rules, borders, large figures.
      "--brand": brand,
      "--accent": accent,
      // Darkened only as far as small text requires.
      "--brand-text": brandText,
      "--accent-text": accentText,
      "--brand-deep": toHex(scale(parseHex(brand), 0.68)),
      "--accent-deep": toHex(scale(parseHex(accent), 0.72)),
      "--brand-tint": rgba(brand, 0.09),
      "--accent-tint": rgba(accent, 0.11),
      "--paper": paper,
    },
    warnings,
    adjusted: warnings.length > 0,
  };
}

/**
 * Chooses a legible colour for the client's wordmark against the dark masthead.
 * A brand colour tuned for white paper is usually too dark on ink, so it is
 * lightened rather than swapped out — the client still sees their colour.
 */
export function onDarkVariant(hex: string): string {
  let rgb = parseHex(hex);
  let out = toHex(rgb);
  for (let i = 0; i < 24 && contrastRatio(out, "#0C0B0A") < 4.5; i++) {
    rgb = [rgb[0] + (255 - rgb[0]) * 0.14, rgb[1] + (255 - rgb[1]) * 0.14, rgb[2] + (255 - rgb[2]) * 0.14];
    out = toHex(rgb);
  }
  return out;
}

/** Initials for the fallback mark when a client hasn't uploaded a logo. */
export function initialsFrom(name: string): string {
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "—";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
