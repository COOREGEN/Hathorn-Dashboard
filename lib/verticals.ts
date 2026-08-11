/**
 * Verticals.
 *
 * The platform was built from one home-care client, which made three things
 * accidentally universal that are not: direct cost equals payroll, volume is hours,
 * and receivables are owed by "payers". A restaurant's direct cost is food plus labour.
 * A short-term rental operator has no payroll at all in the direct line. An athlete has
 * no receivables ageing worth the name.
 *
 * This file is where an industry's knowledge lives: what to measure, what healthy looks
 * like, what has to tie before anything is published, what a unit of volume is, and how
 * fast money actually arrives.
 *
 * The bands are the valuable part. A configurable labour ratio with no default is just a
 * form field — it hands the judgement back to the user, which is the work they are paying
 * the firm for. Every number below is a stated assumption, and every one is overridable
 * per client, but the default carries the opinion.
 */

export type VerticalKey =
  | "home_care"
  | "childcare"
  | "short_term_rental"
  | "property_management"
  | "nil_athlete"
  | "professional_services"
  | "restaurant"
  | "contractor"
  | "retail"
  | "generic";

/** How direct cost is composed. This is what the gate checks against. */
export type DirectCostModel =
  | "payroll_only"      // direct cost is labour and nothing else
  | "payroll_plus_cogs" // labour plus materials or food
  | "cogs_only"         // no direct labour line at all
  | "property_costs"    // cleaning, supplies, platform fees, per-property
  | "management_basis"  // gross flow less pass-through; the manager keeps a fee
  | "none";             // no direct cost concept (an individual)

export type TieOutRule =
  | "labor_ties_payroll"        // direct cost equals payroll composition
  | "labor_within_direct_cost"  // payroll is a component of direct cost, not all of it
  | "cash_ties_balance_sheet"
  | "balance_sheet_balances"
  | "revenue_present"
  | "all_entities_reported"
  | "margin_sanity"
  | "ar_present"
  | "cash_present"
  | "occupancy_sane"            // rental nights sold cannot exceed nights available
  | "enrollment_sane"           // childcare enrolment cannot exceed licensed capacity
  | "distributions_tracked"     // an athlete's draws are recorded
  | "management_bridge_closes"  // gross − pass-through − expense = management NOI
  | "passthrough_declared"      // tax and owner money identified, never called revenue
  | "fee_recovery_tracked";     // fees billed vs collected vs cost

export type MetricBand = { lo: number; hi: number };

export type VerticalProfile = {
  key: VerticalKey;
  label: string;
  /** One line an advisor can read to know whether they picked the right profile. */
  description: string;
  directCostModel: DirectCostModel;
  tieOutRules: TieOutRule[];

  /** Ratios that carry an opinion. Absent means the metric is not scored for this vertical. */
  bands: {
    labor?: MetricBand;
    grossMargin?: MetricBand;
    /** Restaurants and similar: food plus labour as a share of revenue. */
    primeCost?: MetricBand;
    occupancy?: MetricBand;
    currentRatio?: MetricBand;
  };

  volume: {
    /** What a unit of activity is called on screen. */
    unit: string;
    unitPlural: string;
    /** Column heading for the volume section. */
    label: string;
    /** Revenue divided by units — the number the owner actually manages. */
    rateLabel: string;
    /** Some verticals count capacity as well as delivery. */
    capacityLabel?: string;
  };

  receivables: {
    /** "payer" for Medicaid, "guest" for rentals, "client" for services. */
    partyLabel: string;
    partyLabelPlural: string;
    /** Whether ageing is a meaningful concept at all. */
    ageingMatters: boolean;
    /**
     * Share of each ageing bucket expected to collect, and roughly when. These drive the
     * thirteen-week cash projection and are the most vertical-specific numbers here:
     * Medicaid pays slowly and partially, Airbnb pays in days, a contractor holds
     * retainage for months.
     */
    collection: { rate: number; startWeek: number; spread: number }[];
    /** Portion of revenue collected close to delivery, before ageing applies. */
    immediateShare: number;
  };

  /** Sections that do not apply are hidden rather than shown empty. */
  sections: {
    volumeDrivers: boolean;
    receivables: boolean;
    payrollDetail: boolean;
    balanceSheet: boolean;
    occupancy: boolean;
    /** An individual's view: income, tax reserve, savings rate. */
    personalFinance: boolean;
  };

  /** Wording that changes per vertical, so the copy never reads generic. */
  language: {
    revenueLabel: string;
    directCostLabel: string;
    laborRatioLabel: string;
    /** The question the payroll section answers. */
    laborQuestion: string;
    laborGuidance: string;
  };
};

/* ------------------------------------------------------------------ */

const BASE_SECTIONS = {
  volumeDrivers: true, receivables: true, payrollDetail: true,
  balanceSheet: true, occupancy: false, personalFinance: false,
};

export const VERTICALS: Record<VerticalKey, VerticalProfile> = {
  /* ---------------- Home care ---------------- */
  home_care: {
    key: "home_care",
    label: "Home Health Care",
    description: "In-home personal care, consumer-directed services, private duty nursing.",
    directCostModel: "payroll_only",
    tieOutRules: ["revenue_present", "all_entities_reported", "labor_ties_payroll",
      "cash_present", "ar_present", "balance_sheet_balances", "cash_ties_balance_sheet", "margin_sanity"],
    bands: { labor: { lo: 65, hi: 72 }, grossMargin: { lo: 28, hi: 40 }, currentRatio: { lo: 1.5, hi: 3.0 } },
    volume: { unit: "hour", unitPlural: "hours", label: "Hours delivered",
      rateLabel: "Revenue per hour", capacityLabel: "Scheduled hours" },
    receivables: {
      partyLabel: "payer", partyLabelPlural: "payers", ageingMatters: true,
      // Medicaid and MCOs pay on a lag and deny a real share of aged claims.
      collection: [
        { rate: 0.92, startWeek: 1, spread: 4 },
        { rate: 0.85, startWeek: 2, spread: 5 },
        { rate: 0.70, startWeek: 4, spread: 6 },
        { rate: 0.40, startWeek: 6, spread: 8 },
      ],
      immediateShare: 0.55,
    },
    sections: { ...BASE_SECTIONS },
    language: {
      revenueLabel: "Revenue", directCostLabel: "Direct care labor", laborRatioLabel: "Labor ratio",
      laborQuestion: "You buy hours at one price and sell them at another. How wide is the gap?",
      laborGuidance: "Above the band, margin is going to labor. Below it, check that billed hours were actually delivered and that costs are posting to the right account.",
    },
  },

  /* ---------------- Childcare ---------------- */
  childcare: {
    key: "childcare",
    label: "Childcare & Preschool",
    description: "Daycare centres, preschools, after-school programmes, adult day care.",
    directCostModel: "payroll_only",
    tieOutRules: ["revenue_present", "all_entities_reported", "labor_ties_payroll",
      "cash_present", "balance_sheet_balances", "cash_ties_balance_sheet",
      "enrollment_sane", "margin_sanity"],
    // Ratio-driven staffing puts a hard floor under labour: you cannot legally run
    // a room under ratio, so a low labour percentage usually means under-enrolment
    // rather than efficiency.
    bands: { labor: { lo: 45, hi: 55 }, grossMargin: { lo: 45, hi: 58 },
      occupancy: { lo: 85, hi: 98 }, currentRatio: { lo: 1.5, hi: 3.0 } },
    volume: { unit: "enrolled child", unitPlural: "enrolled children", label: "Enrolment",
      rateLabel: "Revenue per child", capacityLabel: "Licensed capacity" },
    receivables: {
      partyLabel: "family or agency", partyLabelPlural: "families and agencies", ageingMatters: true,
      // Tuition is largely collected in advance; subsidy programmes lag.
      collection: [
        { rate: 0.95, startWeek: 1, spread: 3 },
        { rate: 0.88, startWeek: 2, spread: 4 },
        { rate: 0.75, startWeek: 3, spread: 5 },
        { rate: 0.50, startWeek: 5, spread: 8 },
      ],
      immediateShare: 0.80,
    },
    sections: { ...BASE_SECTIONS, occupancy: true },
    language: {
      revenueLabel: "Tuition and fees", directCostLabel: "Teaching staff", laborRatioLabel: "Labor ratio",
      laborQuestion: "Ratio requirements set a floor under staffing. Is enrolment carrying it?",
      laborGuidance: "Above the band, rooms are staffed beyond what enrolment supports. Below it, you may be under ratio — a licensing risk, not a saving.",
    },
  },

  /* ---------------- Short-term rental ---------------- */
  short_term_rental: {
    key: "short_term_rental",
    label: "Short-Term Rental",
    description: "Airbnb, VRBO, and direct-booked properties; single or portfolio.",
    // No payroll in the direct line: cleaning, supplies and platform fees are the cost
    // of delivering a night. The old gate would have blocked every one of these.
    directCostModel: "property_costs",
    tieOutRules: ["revenue_present", "all_entities_reported", "labor_within_direct_cost",
      "cash_present", "balance_sheet_balances", "cash_ties_balance_sheet",
      "occupancy_sane", "margin_sanity"],
    bands: { grossMargin: { lo: 55, hi: 72 }, occupancy: { lo: 60, hi: 80 },
      currentRatio: { lo: 1.2, hi: 3.0 } },
    volume: { unit: "night", unitPlural: "nights booked", label: "Nights booked",
      rateLabel: "Average daily rate", capacityLabel: "Nights available" },
    receivables: {
      partyLabel: "channel", partyLabelPlural: "channels", ageingMatters: false,
      // Platforms remit within days of check-in; ageing is close to meaningless.
      collection: [
        { rate: 0.99, startWeek: 1, spread: 2 },
        { rate: 0.97, startWeek: 1, spread: 2 },
        { rate: 0.90, startWeek: 2, spread: 3 },
        { rate: 0.70, startWeek: 3, spread: 4 },
      ],
      immediateShare: 0.92,
    },
    sections: { ...BASE_SECTIONS, occupancy: true, payrollDetail: false, receivables: false },
    language: {
      revenueLabel: "Booking revenue", directCostLabel: "Property operating costs",
      laborRatioLabel: "Operating cost ratio",
      laborQuestion: "Every night sold costs something to deliver. What is left?",
      laborGuidance: "Cleaning, supplies, platform fees and utilities against booking revenue. Rising cost per night with flat rates is the margin leak.",
    },
  },

  /* ---------------- Property management ---------------- */
  property_management: {
    key: "property_management",
    label: "Property Management",
    description: "Third-party management of short-term or residential rentals for owners.",
    // The defining difference from an owner-operator: gross bookings flow through the
    // account but are not revenue. Tax goes to the state, the balance goes to owners,
    // and the manager keeps a fee. Book revenue can be ten times management revenue.
    directCostModel: "management_basis",
    tieOutRules: ["revenue_present", "all_entities_reported", "passthrough_declared",
      "management_bridge_closes", "fee_recovery_tracked", "cash_present",
      "balance_sheet_balances", "cash_ties_balance_sheet", "occupancy_sane"],
    // Margins are on the management fee, not on gross bookings — a 55% margin band read
    // against gross flow would be nonsense.
    bands: { grossMargin: { lo: 22, hi: 40 }, occupancy: { lo: 60, hi: 80 },
      currentRatio: { lo: 1.2, hi: 2.5 } },
    volume: { unit: "night", unitPlural: "nights managed", label: "Nights managed",
      rateLabel: "Management fee per night", capacityLabel: "Nights available" },
    receivables: {
      partyLabel: "owner or channel", partyLabelPlural: "owners and channels", ageingMatters: true,
      // Platforms remit fast; owner receivables and unrecovered fees are the slow part.
      collection: [
        { rate: 0.96, startWeek: 1, spread: 3 },
        { rate: 0.88, startWeek: 2, spread: 4 },
        { rate: 0.72, startWeek: 4, spread: 5 },
        { rate: 0.45, startWeek: 6, spread: 8 },
      ],
      immediateShare: 0.78,
    },
    sections: { ...BASE_SECTIONS, occupancy: true },
    language: {
      revenueLabel: "Management revenue", directCostLabel: "Operating expense",
      laborRatioLabel: "Operating expense ratio",
      laborQuestion: "Gross bookings are not yours. What did managing them actually earn?",
      laborGuidance: "Measured against management revenue, not gross bookings. Comparing expense to gross flow makes every management company look flawless.",
    },
  },

  /* ---------------- NIL athlete ---------------- */
  nil_athlete: {
    key: "nil_athlete",
    label: "NIL Athlete",
    // An individual, not a business: no direct labour, no receivables ageing that means
    // anything, and the questions are tax reserve and savings rate rather than margin.
    description: "Name, image and likeness earnings for an individual athlete.",
    directCostModel: "none",
    tieOutRules: ["revenue_present", "cash_present", "distributions_tracked"],
    bands: {},
    volume: { unit: "deal", unitPlural: "deals", label: "Active deals",
      rateLabel: "Average deal value" },
    receivables: {
      partyLabel: "brand or collective", partyLabelPlural: "brands and collectives", ageingMatters: true,
      // Brand deals pay on invoice terms; collectives are usually monthly and reliable.
      collection: [
        { rate: 0.90, startWeek: 2, spread: 4 },
        { rate: 0.82, startWeek: 3, spread: 5 },
        { rate: 0.65, startWeek: 5, spread: 6 },
        { rate: 0.35, startWeek: 8, spread: 10 },
      ],
      immediateShare: 0.40,
    },
    sections: { volumeDrivers: true, receivables: true, payrollDetail: false,
      balanceSheet: false, occupancy: false, personalFinance: true },
    language: {
      revenueLabel: "NIL earnings", directCostLabel: "Agent and representation fees",
      laborRatioLabel: "Representation cost",
      laborQuestion: "What reaches you after fees, and what is already owed in tax?",
      laborGuidance: "Agent, legal and management fees against gross earnings.",
    },
  },

  /* ---------------- Professional services ---------------- */
  professional_services: {
    key: "professional_services",
    label: "Professional Services",
    description: "Agencies, consultancies, law and accounting firms, staffing.",
    directCostModel: "payroll_only",
    tieOutRules: ["revenue_present", "all_entities_reported", "labor_ties_payroll",
      "cash_present", "ar_present", "balance_sheet_balances", "cash_ties_balance_sheet", "margin_sanity"],
    bands: { labor: { lo: 35, hi: 50 }, grossMargin: { lo: 50, hi: 65 }, currentRatio: { lo: 1.5, hi: 3.0 } },
    volume: { unit: "billable hour", unitPlural: "billable hours", label: "Billable hours",
      rateLabel: "Effective rate", capacityLabel: "Available hours" },
    receivables: {
      partyLabel: "client", partyLabelPlural: "clients", ageingMatters: true,
      collection: [
        { rate: 0.94, startWeek: 2, spread: 4 },
        { rate: 0.88, startWeek: 3, spread: 5 },
        { rate: 0.72, startWeek: 5, spread: 6 },
        { rate: 0.45, startWeek: 7, spread: 8 },
      ],
      immediateShare: 0.35,
    },
    sections: { ...BASE_SECTIONS },
    language: {
      revenueLabel: "Fee revenue", directCostLabel: "Delivery labor", laborRatioLabel: "Delivery cost ratio",
      laborQuestion: "You sell time. How much of the fee survives delivering it?",
      laborGuidance: "Above the band, work is being delivered by people too senior for it or scoped too thin. Below it, check that time is being captured at all.",
    },
  },

  /* ---------------- Restaurant ---------------- */
  restaurant: {
    key: "restaurant",
    label: "Restaurant & Food Service",
    description: "Full service, quick service, catering, food trucks.",
    directCostModel: "payroll_plus_cogs",
    tieOutRules: ["revenue_present", "all_entities_reported", "labor_within_direct_cost",
      "cash_present", "balance_sheet_balances", "cash_ties_balance_sheet", "margin_sanity"],
    // Prime cost is the number operators actually manage: food plus labour together.
    bands: { labor: { lo: 28, hi: 35 }, primeCost: { lo: 55, hi: 65 },
      grossMargin: { lo: 62, hi: 72 }, currentRatio: { lo: 0.8, hi: 2.0 } },
    volume: { unit: "cover", unitPlural: "covers", label: "Covers served",
      rateLabel: "Average check", capacityLabel: "Seats available" },
    receivables: {
      partyLabel: "account", partyLabelPlural: "accounts", ageingMatters: false,
      collection: [
        { rate: 0.99, startWeek: 1, spread: 1 },
        { rate: 0.95, startWeek: 1, spread: 2 },
        { rate: 0.85, startWeek: 2, spread: 3 },
        { rate: 0.60, startWeek: 3, spread: 4 },
      ],
      immediateShare: 0.97,
    },
    sections: { ...BASE_SECTIONS, receivables: false },
    language: {
      revenueLabel: "Sales", directCostLabel: "Food and labor", laborRatioLabel: "Labor cost",
      laborQuestion: "Prime cost is the number you manage. Where does it sit?",
      laborGuidance: "Food and labour together should sit inside the prime cost band. Labour alone below the band on a busy service usually means the schedule is too thin, not efficient.",
    },
  },

  /* ---------------- Contractor ---------------- */
  contractor: {
    key: "contractor",
    label: "Construction & Trades",
    description: "General contractors, specialty trades, remodellers.",
    directCostModel: "payroll_plus_cogs",
    tieOutRules: ["revenue_present", "all_entities_reported", "labor_within_direct_cost",
      "cash_present", "ar_present", "balance_sheet_balances", "cash_ties_balance_sheet", "margin_sanity"],
    bands: { grossMargin: { lo: 18, hi: 32 }, currentRatio: { lo: 1.3, hi: 2.5 } },
    volume: { unit: "job", unitPlural: "jobs", label: "Jobs completed",
      rateLabel: "Average job value", capacityLabel: "Jobs in progress" },
    receivables: {
      partyLabel: "customer", partyLabelPlural: "customers", ageingMatters: true,
      // Progress billing plus retainage: a real share is held back for months by design.
      collection: [
        { rate: 0.88, startWeek: 3, spread: 5 },
        { rate: 0.82, startWeek: 4, spread: 6 },
        { rate: 0.70, startWeek: 6, spread: 8 },
        { rate: 0.50, startWeek: 9, spread: 12 },
      ],
      immediateShare: 0.25,
    },
    sections: { ...BASE_SECTIONS },
    language: {
      revenueLabel: "Contract revenue", directCostLabel: "Job costs", laborRatioLabel: "Job cost ratio",
      laborQuestion: "Every job either made money or did not. Which were which?",
      laborGuidance: "Labour, materials and subcontractors against contract revenue. Watch retainage separately — it is earned but not collected.",
    },
  },

  /* ---------------- Retail ---------------- */
  retail: {
    key: "retail",
    label: "Retail & E-commerce",
    description: "Storefronts, online sellers, wholesale.",
    directCostModel: "cogs_only",
    tieOutRules: ["revenue_present", "all_entities_reported", "cash_present",
      "balance_sheet_balances", "cash_ties_balance_sheet", "margin_sanity"],
    bands: { grossMargin: { lo: 35, hi: 55 }, currentRatio: { lo: 1.5, hi: 3.0 } },
    volume: { unit: "order", unitPlural: "orders", label: "Orders fulfilled",
      rateLabel: "Average order value" },
    receivables: {
      partyLabel: "account", partyLabelPlural: "accounts", ageingMatters: false,
      collection: [
        { rate: 0.98, startWeek: 1, spread: 2 },
        { rate: 0.92, startWeek: 2, spread: 3 },
        { rate: 0.80, startWeek: 3, spread: 4 },
        { rate: 0.55, startWeek: 5, spread: 6 },
      ],
      immediateShare: 0.90,
    },
    sections: { ...BASE_SECTIONS, payrollDetail: true, receivables: false },
    language: {
      revenueLabel: "Sales", directCostLabel: "Cost of goods sold", laborRatioLabel: "Payroll ratio",
      laborQuestion: "What does it cost to buy what you sold?",
      laborGuidance: "Cost of goods against sales. Margin compression usually shows here before it shows in net income.",
    },
  },

  /* ---------------- Generic ---------------- */
  generic: {
    key: "generic",
    label: "General Business",
    // Deliberately opinion-free. Used when no profile fits, and it should feel emptier
    // than the others — that emptiness is the argument for building a real profile.
    description: "No industry assumptions. Bands must be set per client.",
    directCostModel: "payroll_plus_cogs",
    tieOutRules: ["revenue_present", "all_entities_reported", "cash_present",
      "balance_sheet_balances", "cash_ties_balance_sheet", "margin_sanity"],
    bands: { currentRatio: { lo: 1.5, hi: 3.0 } },
    volume: { unit: "unit", unitPlural: "units", label: "Volume", rateLabel: "Revenue per unit" },
    receivables: {
      partyLabel: "customer", partyLabelPlural: "customers", ageingMatters: true,
      collection: [
        { rate: 0.92, startWeek: 2, spread: 4 },
        { rate: 0.85, startWeek: 3, spread: 5 },
        { rate: 0.70, startWeek: 5, spread: 6 },
        { rate: 0.45, startWeek: 7, spread: 8 },
      ],
      immediateShare: 0.50,
    },
    sections: { ...BASE_SECTIONS },
    language: {
      revenueLabel: "Revenue", directCostLabel: "Direct cost", laborRatioLabel: "Direct cost ratio",
      laborQuestion: "What does delivering the revenue cost?",
      laborGuidance: "Set a target band for this client so the ratio can be judged rather than merely reported.",
    },
  },
};

export const verticalList = () =>
  (Object.keys(VERTICALS) as VerticalKey[]).map((k) => ({
    key: k, label: VERTICALS[k].label, description: VERTICALS[k].description,
  }));

export function vertical(key: string | null | undefined): VerticalProfile {
  return VERTICALS[(key as VerticalKey) ?? "generic"] ?? VERTICALS.generic;
}

/**
 * Resolves the bands actually used for a client: the vertical's opinion, overridden by
 * anything set on the client record. The vertical supplies a default worth having; the
 * client record handles the business that genuinely differs.
 */
export function bandsFor(profile: VerticalProfile, client: {
  target_labor_lo?: number | null; target_labor_hi?: number | null;
}): VerticalProfile["bands"] {
  const bands = { ...profile.bands };
  // Ignore 0/0 — that used to mean "unset" and was misread as a real band.
  if (client.target_labor_lo != null && client.target_labor_hi != null
      && !(client.target_labor_lo === 0 && client.target_labor_hi === 0)
      && profile.bands.labor) {
    bands.labor = { lo: client.target_labor_lo, hi: client.target_labor_hi };
  }
  return bands;
}
