/**
 * Management basis.
 *
 * A property manager's books and a property manager's business are two different
 * stories, and the gap between them is where the arguments happen.
 *
 * QuickBooks records the gross flow: every booking dollar lands in the account, tax is
 * remitted to the state, owners are disbursed, and what remains is the management fee.
 * So book revenue can be ten times management revenue. Report the book number and the
 * owner thinks the business is enormous; report only the management number and it will
 * not tie to the return the CPA files.
 *
 * Both have to be shown, with an explicit bridge between them. That bridge is the
 * deliverable — it is the thing an owner-facing dashboard exists to make legible.
 */

import { db } from "./db";
import type { PeriodMetrics } from "./metrics";

const r1 = (n: number) => Math.round(n * 10) / 10;

/* ------------------------------------------------------------------ */
/* The bridge                                                          */
/* ------------------------------------------------------------------ */

export type PassthroughKind =
  | "SALES_TAX" | "OCCUPANCY_TAX" | "OWNER_DISBURSEMENT" | "RESERVE" | "OTHER";

export type ManagementBasis = {
  available: boolean;
  /** What flowed through the account. */
  grossBookings: number;
  /** Money that was never the manager's: tax collected, owner disbursements, reserves. */
  passthrough: { kind: PassthroughKind; label: string; amount: number }[];
  taxRemitted: number;
  ownerDisbursed: number;
  reserves: number;
  totalPassthrough: number;
  /** Gross less pass-through — the revenue the manager actually earned. */
  managementRevenue: number;
  operatingExpense: number;
  /** Management revenue less operating expense. The number the owner asks about. */
  managementNOI: number;
  managementMargin: number;
  /** What the books say, for reconciliation. */
  bookNetIncome: number | null;
  /**
   * True when the bridge agrees with the P&L.
   *
   * The reconciliation that matters is against an *independent* figure. Management NOI is
   * derived from gross less pass-through less expense, so checking that identity proves
   * nothing — it holds by construction. What has to agree is the derived management
   * revenue and the revenue actually booked in the P&L. If a pass-through category is
   * missing or double counted, those two diverge, and that is exactly the error this
   * vertical is prone to.
   */
  reconciles: boolean;
  bridgeGap: number;
  /** Revenue as recorded in the ledger, for the comparison. */
  bookedRevenue: number;
  /** Ordered steps, for rendering the waterfall. */
  bridge: { label: string; amount: number; kind: "start" | "deduct" | "total" }[];
};

export function managementBasis(m: PeriodMetrics): ManagementBasis {
  const period: any = db().prepare(
    "SELECT gross_bookings, book_net_income FROM periods WHERE id=?").get(m.periodId);
  const rows: any[] = db().prepare(
    "SELECT kind, label, amount FROM passthrough_lines WHERE period_id=? ORDER BY kind").all(m.periodId);

  const empty: ManagementBasis = {
    available: false, grossBookings: 0, passthrough: [], taxRemitted: 0, ownerDisbursed: 0,
    reserves: 0, totalPassthrough: 0, managementRevenue: m.revenue, operatingExpense: m.opex,
    managementNOI: m.netIncome, managementMargin: m.netMarginPct, bookNetIncome: null,
    reconciles: true, bridgeGap: 0, bookedRevenue: m.revenue, bridge: [],
  };
  if (!rows.length || !period?.gross_bookings) return empty;

  const sum = (kinds: PassthroughKind[]) =>
    r1(rows.filter((r) => kinds.includes(r.kind)).reduce((s, r) => s + r.amount, 0));

  const grossBookings = r1(period.gross_bookings);
  const taxRemitted = sum(["SALES_TAX", "OCCUPANCY_TAX"]);
  const ownerDisbursed = sum(["OWNER_DISBURSEMENT"]);
  const reserves = sum(["RESERVE"]);
  const other = sum(["OTHER"]);
  const totalPassthrough = r1(taxRemitted + ownerDisbursed + reserves + other);

  const managementRevenue = r1(grossBookings - totalPassthrough);
  const operatingExpense = r1(m.directCost + m.opex);
  const managementNOI = r1(managementRevenue - operatingExpense);

  const bridge: ManagementBasis["bridge"] = [
    { label: "Gross bookings collected", amount: grossBookings, kind: "start" },
    { label: "Sales and occupancy tax remitted", amount: -taxRemitted, kind: "deduct" },
    { label: "Disbursed to owners", amount: -ownerDisbursed, kind: "deduct" },
  ];
  if (reserves) bridge.push({ label: "Held in owner reserves", amount: -reserves, kind: "deduct" });
  if (other) bridge.push({ label: "Other pass-through", amount: -other, kind: "deduct" });
  bridge.push({ label: "Management revenue", amount: managementRevenue, kind: "total" });
  bridge.push({ label: "Operating expense", amount: -operatingExpense, kind: "deduct" });
  bridge.push({ label: "Management NOI", amount: managementNOI, kind: "total" });

  // Derived management revenue must equal the revenue posted to the ledger. These come
  // from different places — the bridge from the pass-through schedule, the P&L from the
  // fee postings — so a mismatch is a real break rather than an arithmetic identity.
  const bookedRevenue = r1(m.revenue);
  const gap = r1(managementRevenue - bookedRevenue);

  return {
    available: true, grossBookings,
    passthrough: rows.map((r) => ({ kind: r.kind, label: r.label, amount: r1(r.amount) })),
    taxRemitted, ownerDisbursed, reserves, totalPassthrough,
    managementRevenue, operatingExpense, managementNOI,
    managementMargin: managementRevenue ? r1((managementNOI / managementRevenue) * 100) : 0,
    bookNetIncome: period.book_net_income != null ? r1(period.book_net_income) : null,
    reconciles: Math.abs(gap) <= 0.5,
    bridgeGap: gap,
    bookedRevenue,
    bridge,
  };
}

/* ------------------------------------------------------------------ */
/* Fee recovery                                                        */
/* ------------------------------------------------------------------ */

export type FeeLine = {
  feeType: string;
  billed: number;
  collected: number;
  cost: number;
  /** Billed less cost. Negative means the manager subsidises the service. */
  margin: number;
  marginPct: number | null;
  /** Collected as a share of billed. Below 100% is leakage. */
  recoveryPct: number | null;
  uncollected: number;
  note: string;
};

export type FeeRecovery = {
  available: boolean;
  lines: FeeLine[];
  totalBilled: number;
  totalCollected: number;
  totalCost: number;
  totalMargin: number;
  recoveryPct: number | null;
  /** Fee types where cost exceeds what was billed — the silent losses. */
  subsidised: string[];
};

/**
 * Fees earned against fees collected, and services billed against services paid for.
 *
 * A manager charging a $150 cleaning fee and paying a cleaner $165 loses money on every
 * turn, and it is invisible in a normal P&L because the two sides land in different
 * accounts. The same is true of maintenance markups and resort fees. This is usually the
 * fastest margin available to a management company, and nobody looks at it.
 */
export function feeRecovery(periodId: string): FeeRecovery {
  const rows: any[] = db().prepare(
    "SELECT * FROM fee_lines WHERE period_id=? ORDER BY fee_type").all(periodId);
  if (!rows.length) {
    return { available: false, lines: [], totalBilled: 0, totalCollected: 0, totalCost: 0,
      totalMargin: 0, recoveryPct: null, subsidised: [] };
  }

  const lines: FeeLine[] = rows.map((r) => {
    const margin = r1(r.billed - r.cost);
    return {
      feeType: r.fee_type,
      billed: r1(r.billed), collected: r1(r.collected), cost: r1(r.cost),
      margin,
      marginPct: r.billed ? r1((margin / r.billed) * 100) : null,
      recoveryPct: r.billed ? r1((r.collected / r.billed) * 100) : null,
      uncollected: r1(r.billed - r.collected),
      note: r.note || "",
    };
  });

  const totalBilled = r1(lines.reduce((s, l) => s + l.billed, 0));
  const totalCollected = r1(lines.reduce((s, l) => s + l.collected, 0));
  const totalCost = r1(lines.reduce((s, l) => s + l.cost, 0));

  return {
    available: true, lines, totalBilled, totalCollected, totalCost,
    totalMargin: r1(totalBilled - totalCost),
    recoveryPct: totalBilled ? r1((totalCollected / totalBilled) * 100) : null,
    subsidised: lines.filter((l) => l.margin < 0).map((l) => l.feeType),
  };
}

/* ------------------------------------------------------------------ */
/* Channel mix                                                         */
/* ------------------------------------------------------------------ */

export type ChannelMix = {
  available: boolean;
  channels: {
    channel: string; gross: number; fees: number; net: number;
    feePct: number | null; share: number; nights: number | null;
    /** Revenue per night after the channel takes its cut. */
    netPerNight: number | null;
  }[];
  totalGross: number;
  totalFees: number;
  blendedFeePct: number | null;
  /** Share held by the largest channel. Concentration is a real risk here. */
  topChannelShare: number;
};

/**
 * Where the bookings came from and what each channel cost.
 *
 * Channel fees are a direct margin lever a manager can act on — shifting ten points of
 * volume from a 15% platform to direct booking is worth more than most cost cutting —
 * and concentration in one platform is a genuine risk when that platform changes its
 * terms.
 */
export function channelMix(periodId: string): ChannelMix {
  const rows: any[] = db().prepare(
    "SELECT channel, SUM(gross_bookings) gross, SUM(channel_fees) fees, SUM(nights) nights FROM channel_lines WHERE period_id=? GROUP BY channel ORDER BY 2 DESC").all(periodId);
  if (!rows.length) {
    return { available: false, channels: [], totalGross: 0, totalFees: 0,
      blendedFeePct: null, topChannelShare: 0 };
  }

  const totalGross = r1(rows.reduce((s, r) => s + r.gross, 0));
  const totalFees = r1(rows.reduce((s, r) => s + r.fees, 0));

  return {
    available: true,
    channels: rows.map((r) => {
      const net = r1(r.gross - r.fees);
      return {
        channel: r.channel, gross: r1(r.gross), fees: r1(r.fees), net,
        feePct: r.gross ? r1((r.fees / r.gross) * 100) : null,
        share: totalGross ? r1((r.gross / totalGross) * 100) : 0,
        nights: r.nights ?? null,
        netPerNight: r.nights ? r1((net / r.nights) * 1000) / 1000 : null,
      };
    }),
    totalGross, totalFees,
    blendedFeePct: totalGross ? r1((totalFees / totalGross) * 100) : null,
    topChannelShare: totalGross ? r1((rows[0].gross / totalGross) * 100) : 0,
  };
}
