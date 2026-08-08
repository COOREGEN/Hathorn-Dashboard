import { db } from "./db";
import { computePeriod, type PeriodMetrics } from "./metrics";
import { vertical, type TieOutRule, type VerticalProfile } from "./verticals";
import { managementBasis, feeRecovery } from "./management-basis";

export type GateCheck = { name: string; pass: boolean; detail: string };
export type GateResult = { pass: boolean; checks: GateCheck[] };

const TOL = 0.5; // $K tolerance for rounding

/**
 * The Gate. Nothing reaches review — let alone a client — unless every check ties.
 *
 * Checks are selected by the client's vertical rather than hardcoded. That matters more
 * than it sounds: the original gate asserted `direct cost = payroll`, which is true for
 * home care and false for a restaurant (food plus labour), a short-term rental (cleaning
 * and platform fees, no payroll in the direct line) and a retailer (cost of goods).
 * Every one of those businesses would have been unable to publish a single period.
 *
 * Each check is named so a failure routes back to the bookkeeper with the specific break.
 */

type CheckContext = {
  periodId: string; m: PeriodMetrics; profile: VerticalProfile; client: any; entities: any[];
};

const RULES: Record<TieOutRule, (ctx: CheckContext) => GateCheck[]> = {
  revenue_present: ({ m, profile }) => [{
    name: `${profile.language.revenueLabel} present`,
    pass: m.revenue > 0,
    detail: m.revenue > 0
      ? `Consolidated ${profile.language.revenueLabel.toLowerCase()} $${m.revenue}K`
      : "No revenue lines found for this period",
  }],

  all_entities_reported: ({ m, entities }) => {
    const missing = entities.filter((e) =>
      e.status === "ACTIVE" &&
      !m.entities.find((x) => x.id === e.id && (x.revenue !== 0 || x.directCost !== 0 || x.opex !== 0)));
    return [{
      name: "Every active entity reported",
      pass: missing.length === 0,
      detail: missing.length
        ? `Missing P&L data: ${missing.map((e) => e.name).join(", ")}`
        : `${entities.length} entities present`,
    }];
  },

  // Direct cost is entirely labour. Valid for home care, childcare, professional services.
  labor_ties_payroll: ({ m }) => m.entities.flatMap((e) => {
    const comp = e.payroll.wages + e.payroll.otPremium + e.payroll.taxes
      + e.payroll.workersComp + e.payroll.processing;
    if (e.directCost === 0 && comp === 0) return [];
    const diff = Math.abs(e.directCost - comp);
    return [{
      name: `Labor ties — ${e.name}`,
      pass: diff <= TOL,
      detail: diff <= TOL
        ? `Direct cost $${e.directCost}K = payroll composition $${comp.toFixed(1)}K`
        : `Direct cost $${e.directCost}K vs payroll composition $${comp.toFixed(1)}K — off by $${diff.toFixed(1)}K`,
    }];
  }),

  // Payroll is one component of direct cost, not all of it. Payroll exceeding direct cost
  // means labour is posting somewhere it should not be.
  labor_within_direct_cost: ({ m }) => m.entities.flatMap((e) => {
    const comp = e.payroll.wages + e.payroll.otPremium + e.payroll.taxes
      + e.payroll.workersComp + e.payroll.processing;
    if (comp === 0) return [];
    const ok = comp <= e.directCost + TOL;
    return [{
      name: `Payroll sits inside direct cost — ${e.name}`,
      pass: ok,
      detail: ok
        ? `Payroll $${comp.toFixed(1)}K of $${e.directCost}K direct cost`
        : `Payroll $${comp.toFixed(1)}K exceeds direct cost $${e.directCost}K — labor may be posting outside the direct line`,
    }];
  }),

  cash_present: ({ m }) => [{
    name: "Cash balance present",
    pass: m.cash.total > 0,
    detail: m.cash.total > 0 ? `$${m.cash.total}K across operating and reserve` : "No cash balance recorded",
  }],

  ar_present: ({ m, profile }) => [{
    name: `${profile.receivables.partyLabelPlural.replace(/^./, (c) => c.toUpperCase())} reported`,
    pass: m.ar.length > 0,
    detail: m.ar.length
      ? `${m.ar.length} ${profile.receivables.partyLabelPlural} totalling $${m.arTotal}K`
      : "No receivables detail for this period",
  }],

  balance_sheet_balances: ({ periodId }) => {
    const rows: any[] = db().prepare(
      "SELECT section, SUM(amount) total FROM balance_lines WHERE period_id=? GROUP BY section").all(periodId);
    if (!rows.length) return [];
    const t = (s: string) => rows.find((r) => r.section === s)?.total ?? 0;
    const assets = t("CURRENT_ASSET") + t("FIXED_ASSET");
    const claims = t("CURRENT_LIABILITY") + t("LONG_TERM_LIABILITY") + t("EQUITY");
    const diff = Math.abs(assets - claims);
    return [{
      name: "Balance sheet balances",
      pass: diff <= TOL,
      detail: diff <= TOL
        ? `Assets $${assets.toFixed(1)}K = liabilities plus equity $${claims.toFixed(1)}K`
        : `Assets $${assets.toFixed(1)}K vs liabilities plus equity $${claims.toFixed(1)}K — out by $${diff.toFixed(1)}K`,
    }];
  },

  cash_ties_balance_sheet: ({ periodId, m }) => {
    const row: any = db().prepare(
      "SELECT SUM(amount) total FROM balance_lines WHERE period_id=? AND section='CURRENT_ASSET' AND LOWER(label) LIKE '%cash%'").get(periodId);
    if (!row?.total) return [];
    const diff = Math.abs(row.total - m.cash.total);
    return [{
      name: "Cash ties to the bank balance",
      pass: diff <= TOL,
      detail: diff <= TOL
        ? `Balance sheet cash $${row.total.toFixed(1)}K = reported bank $${m.cash.total}K`
        : `Balance sheet cash $${row.total.toFixed(1)}K vs reported bank $${m.cash.total}K — off by $${diff.toFixed(1)}K`,
    }];
  },

  margin_sanity: ({ m }) => [{
    name: "Margin within a plausible range",
    pass: m.grossMarginPct >= -50 && m.grossMarginPct <= 95,
    detail: `Gross margin ${m.grossMarginPct}%`,
  }],

  // Nights sold cannot exceed nights available — catches a double-counted channel.
  occupancy_sane: ({ periodId }) => {
    const row: any = db().prepare(
      "SELECT SUM(units_sold) sold, SUM(units_available) available FROM volume_lines WHERE period_id=?").get(periodId);
    if (!row?.available) return [];
    const ok = row.sold <= row.available + 0.5;
    return [{
      name: "Occupancy within capacity",
      pass: ok,
      detail: ok
        ? `${row.sold} of ${row.available} nights sold (${((row.sold / row.available) * 100).toFixed(0)}%)`
        : `${row.sold} nights sold against ${row.available} available — a channel may be double counted`,
    }];
  },

  // Enrolment above licensed capacity is a licensing exposure, not merely a typo.
  enrollment_sane: ({ periodId }) => {
    const row: any = db().prepare(
      "SELECT SUM(units_sold) enrolled, SUM(units_available) capacity FROM volume_lines WHERE period_id=?").get(periodId);
    if (!row?.capacity) return [];
    const ok = row.enrolled <= row.capacity + 0.5;
    return [{
      name: "Enrolment within licensed capacity",
      pass: ok,
      detail: ok
        ? `${row.enrolled} enrolled against ${row.capacity} licensed`
        : `${row.enrolled} enrolled exceeds licensed capacity of ${row.capacity} — confirm before this is reported`,
    }];
  },

  /**
   * Tax and owner money must be identified before anything is called revenue.
   *
   * The failure this prevents is the serious one in property management: reporting gross
   * bookings as revenue. It flatters the business by an order of magnitude and it is
   * wrong on the return.
   */
  passthrough_declared: ({ periodId }) => {
    const period: any = db().prepare("SELECT gross_bookings FROM periods WHERE id=?").get(periodId);
    if (!period?.gross_bookings) return [];
    const row: any = db().prepare(
      "SELECT COUNT(*) n, SUM(amount) total FROM passthrough_lines WHERE period_id=?").get(periodId);
    const declared = (row?.n ?? 0) > 0;
    return [{
      name: "Pass-through identified",
      pass: declared,
      detail: declared
        ? `$${(row.total ?? 0).toFixed(1)}K identified as tax, owner disbursement or reserve`
        : `$${period.gross_bookings.toFixed(1)}K of gross bookings recorded with no pass-through declared — tax and owner money would be reported as revenue`,
    }];
  },

  /**
   * The bridge from gross flow to management NOI must close.
   *
   * A gap means a pass-through category is missing or double counted, and the owner-facing
   * number and the book number will disagree in a meeting.
   */
  management_bridge_closes: ({ m }) => {
    const b = managementBasis(m);
    if (!b.available) return [];
    const checks: GateCheck[] = [{
      name: "Management bridge closes",
      pass: b.reconciles,
      detail: b.reconciles
        ? `Gross $${b.grossBookings}K less pass-through $${b.totalPassthrough}K = $${b.managementRevenue}K, matching revenue posted to the ledger`
        : `Bridge is out by $${b.bridgeGap.toFixed(1)}K — derived management revenue $${b.managementRevenue}K against $${b.bookedRevenue}K posted. A pass-through category is missing or double counted`,
    }];
    // Management revenue must be a plausible slice of gross. Above half means
    // pass-through is understated; near zero means it is overstated.
    if (b.grossBookings > 0) {
      const share = (b.managementRevenue / b.grossBookings) * 100;
      const ok = share > 2 && share < 55;
      checks.push({
        name: "Management revenue is a plausible share of gross",
        pass: ok,
        detail: ok
          ? `${share.toFixed(1)}% of gross bookings retained as management revenue`
          : `${share.toFixed(1)}% of gross retained — check that tax and owner disbursements are complete`,
      });
    }
    return checks;
  },

  /** Fees billed, collected and paid for. Absent is a gap worth naming, not a failure. */
  fee_recovery_tracked: ({ periodId }) => {
    const f = feeRecovery(periodId);
    if (!f.available) return [{
      name: "Fee recovery reported",
      pass: true,
      detail: "No fee detail supplied — cleaning and maintenance margins cannot be shown",
    }];
    return [{
      name: "Fee recovery reported",
      pass: true,
      detail: f.subsidised.length
        ? `${f.recoveryPct}% of billed fees collected. Subsidised: ${f.subsidised.join(", ")}`
        : `${f.recoveryPct}% of billed fees collected, all fee types at positive margin`,
    }];
  },

  // Advisory rather than blocking: a month with no draws is legitimate.
  distributions_tracked: ({ periodId }) => {
    const row: any = db().prepare(
      "SELECT SUM(amount) total FROM pl_lines WHERE period_id=? AND category='OPEX' AND LOWER(label) LIKE '%draw%'").get(periodId);
    return [{
      name: "Distributions recorded",
      pass: true,
      detail: row?.total
        ? `$${row.total.toFixed(1)}K in draws recorded`
        : "No draws recorded this period — confirm nothing was taken personally",
    }];
  },
};

function persistGate(periodId: string, result: GateResult) {
  const failed = result.checks.filter((c) => !c.pass).map((c) => c.name);
  db().prepare(
    "UPDATE periods SET gate_pass=?, gate_detail=?, gate_run_at=datetime('now') WHERE id=?",
  ).run(result.pass ? 1 : 0, failed.length ? failed.join("; ") : "All checks passed", periodId);
}

export function runGate(periodId: string): GateResult {
  const d = db();
  const m = computePeriod(periodId);
  const period: any = d.prepare("SELECT * FROM periods WHERE id=?").get(periodId);
  const client: any = d.prepare("SELECT * FROM clients WHERE id=?").get(period.client_id);
  const entities: any[] = d.prepare("SELECT * FROM entities WHERE client_id=?").all(period.client_id);
  const profile = vertical(client?.vertical);

  const ctx: CheckContext = { periodId, m, profile, client, entities };
  const checks = profile.tieOutRules.flatMap((rule) => RULES[rule]?.(ctx) ?? []);

  const pass = checks.every((c) => c.pass);
  if (pass && period.status === "AWAITING") {
    d.prepare("UPDATE periods SET status='IN_REVIEW' WHERE id=?").run(periodId);
  }

  const result = { pass, checks };
  persistGate(periodId, result);
  return result;
}

const RULE_LABELS: Record<TieOutRule, string> = {
  revenue_present: "Revenue is present",
  all_entities_reported: "Every active business reported",
  labor_ties_payroll: "Direct cost equals payroll exactly",
  labor_within_direct_cost: "Payroll sits inside direct cost",
  cash_present: "A bank balance is recorded",
  ar_present: "Receivables detail is present",
  balance_sheet_balances: "The balance sheet balances",
  cash_ties_balance_sheet: "Balance sheet cash agrees with the bank",
  margin_sanity: "Margin is within a plausible range",
  occupancy_sane: "Nights sold do not exceed nights available",
  enrollment_sane: "Enrolment does not exceed licensed capacity",
  distributions_tracked: "Distributions are recorded",
  management_bridge_closes: "Gross to management NOI reconciles",
  passthrough_declared: "Tax and owner money identified as pass-through",
  fee_recovery_tracked: "Fee recovery reported",
};

/** What the gate will check for a vertical — for the upload screen and settings. */
export function rulesFor(verticalKey: string) {
  return vertical(verticalKey).tieOutRules.map((rule) => ({ rule, label: RULE_LABELS[rule] }));
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

/**
 * Publishes a period, re-running the gate first.
 *
 * The re-run is deliberate: data can change between upload and approval, and the gate is
 * the release authority, not a one-time formality at intake.
 */
export function approvePeriod(periodId: string) {
  const gate = runGate(periodId);
  if (!gate.pass) throw new Error("Cannot publish: gate checks failing");
  db().prepare("UPDATE periods SET status='PUBLISHED', published_at=datetime('now') WHERE id=?").run(periodId);
}

/** Pulls a published period back into review. The client immediately stops seeing it. */
export function unpublishPeriod(periodId: string) {
  db().prepare("UPDATE periods SET status='IN_REVIEW', published_at=NULL WHERE id=?").run(periodId);
}
