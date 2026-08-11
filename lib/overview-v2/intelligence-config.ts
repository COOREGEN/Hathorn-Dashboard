/**
 * Lightweight client-intelligence configuration.
 * Controls emphasis and presentation — never accounting truth.
 */

import type { VerticalKey, VerticalProfile } from "@/lib/verticals";

export type VitalKey =
  | "revenue"
  | "grossMarginPct"
  | "netIncome"
  | "cash"
  | "arTotal"
  | "laborPct"
  | "occupancy"
  | "adr";

export type AudienceMode = "advisor" | "client";

export type ClientIntelligenceConfig = {
  vertical: VerticalKey;
  industryLabel: string;
  primaryVitals: VitalKey[];
  operatingVitals: VitalKey[];
  compareDefault: "PRIOR_YEAR" | "PRIOR_MONTH";
  terminology: {
    revenue: string;
    labor: string;
    receivables: string;
    volume: string;
  };
  advisorFocus: string;
};

const BASE_FINANCIAL: VitalKey[] = ["revenue", "grossMarginPct", "netIncome", "cash", "arTotal"];

/** Resolve presentation config from an existing vertical profile. */
export function intelligenceConfigFor(
  profile: VerticalProfile,
  overrides?: Partial<ClientIntelligenceConfig>,
): ClientIntelligenceConfig {
  const operating: VitalKey[] = [];
  if (profile.bands.labor) operating.push("laborPct");
  if (profile.sections.occupancy) operating.push("occupancy");
  // ADR only when occupancy/volume is the operating story (rental / similar).
  if (profile.key === "short_term_rental") operating.push("adr");

  const vitals = [...BASE_FINANCIAL];
  // Swap AR out when receivables don't matter for the model (platform remittance).
  if (!profile.sections.receivables) {
    const i = vitals.indexOf("arTotal");
    if (i >= 0) vitals.splice(i, 1);
  }
  // Cap at 6: financial spine + up to 2 operating.
  const primary = [...vitals, ...operating].slice(0, 6) as VitalKey[];

  const base: ClientIntelligenceConfig = {
    vertical: profile.key,
    industryLabel: profile.label,
    primaryVitals: primary,
    operatingVitals: operating.slice(0, 2),
    compareDefault: "PRIOR_YEAR",
    terminology: {
      revenue: profile.language.revenueLabel,
      labor: profile.language.laborRatioLabel,
      receivables: profile.receivables.partyLabelPlural,
      volume: profile.volume.label,
    },
    advisorFocus:
      profile.key === "home_care"
        ? "Labor band and aged receivables"
        : profile.key === "short_term_rental"
          ? "Occupancy and cost per night"
          : profile.key === "childcare"
            ? "Enrolment and staffing ratio"
            : "Margin and cash cover",
  };

  return { ...base, ...overrides, terminology: { ...base.terminology, ...overrides?.terminology } };
}

export function vitalLabel(key: VitalKey, cfg: ClientIntelligenceConfig, audience: AudienceMode): string {
  const advisor: Record<VitalKey, string> = {
    revenue: cfg.terminology.revenue,
    grossMarginPct: "Gross margin",
    netIncome: "Net income",
    cash: "Cash",
    arTotal: "Receivables",
    laborPct: cfg.terminology.labor,
    occupancy: "Occupancy",
    adr: "ADR",
  };
  const client: Record<VitalKey, string> = {
    revenue: cfg.terminology.revenue,
    grossMarginPct: "Margin",
    netIncome: "Profit",
    cash: "Cash on hand",
    arTotal: "Money owed to you",
    laborPct: "Labor share of revenue",
    occupancy: "Rooms filled",
    adr: "Average nightly rate",
  };
  return (audience === "client" ? client : advisor)[key];
}
