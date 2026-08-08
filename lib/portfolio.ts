/**
 * The portfolio view.
 *
 * A firm-side screen answering one question: **which of these clients needs me this
 * month?** Without it, advisory does not scale — every client gets the same hour whether
 * they need it or not, and the one quietly running out of cash gets it in the same slot
 * as the one having a fine quarter.
 *
 * The established tools solve this with filters and sorting: show me clients where
 * revenue is growing and profit is falling, then sort by net profit growth. That works,
 * but it requires the advisor to already suspect what they are looking for.
 *
 * This goes further because the platform already knows things a reporting tool does not:
 * whether the close cleared the gate, how strong the evidence is, whether a metric is
 * outside a target somebody actually agreed, and whether a commitment made three months
 * ago is still open. Those are advisory signals, not just financial ones, and they can be
 * ranked directly.
 *
 * Every score is decomposed into named reasons. A number that says "attention: 62" and
 * nothing else is a horoscope.
 */

import { db } from "./db";
import { clientHistory, computePeriod, type PeriodMetrics } from "./metrics";
import { computeKpis } from "./kpi-registry";
import { assessConfidence } from "./confidence";
import { cashOutlook, openActions } from "./advisory";
import { vertical } from "./verticals";
import { runGate } from "./gate";

export type AttentionReason = {
  code: string;
  weight: number;          // contribution to the score
  severity: "critical" | "high" | "medium" | "low";
  headline: string;
  detail: string;
};

export type PortfolioRow = {
  clientId: string;
  name: string;
  vertical: string;
  verticalLabel: string;
  tags: string[];
  ownerUserId: string | null;

  /** Latest period with figures, published or not. */
  periodLabel: string | null;
  periodId: string | null;
  status: string | null;
  monthsBehind: number;

  revenue: number | null;
  netIncome: number | null;
  netMarginPct: number | null;
  cash: number | null;
  weeksOfCover: number | null;
  revenueChangePct: number | null;

  /** Last twelve months of revenue, for the row sparkline. */
  trend: number[];
  confidence: number | null;
  gatePass: boolean | null;
  openCommitments: number;
  oldestCommitmentMonths: number;

  /** 0–100. Higher means more in need of attention. */
  attention: number;
  band: "urgent" | "watch" | "steady";
  reasons: AttentionReason[];
};

const r1 = (n: number) => Math.round(n * 10) / 10;

/* ------------------------------------------------------------------ */
/* Attention scoring                                                   */
/* ------------------------------------------------------------------ */

/**
 * Weights, stated openly rather than buried.
 *
 * These are a judgement about advisory urgency, not a claim about finance. A close that
 * has not happened outranks a margin that slipped, because the firm cannot advise on a
 * month it has not closed. A failing gate outranks both, because it means the numbers on
 * screen are not trustworthy yet.
 */
const WEIGHTS = {
  closeOverdue: 22,
  gateFailing: 20,
  cashCritical: 20,
  cashTight: 12,
  lossMaking: 14,
  revenueCollapse: 16,
  revenueDecline: 8,
  targetBreach: 7,      // per breached metric, capped
  lowConfidence: 10,
  staleCommitment: 9,
  neverPublished: 25,
};

function monthsBetween(a: { year: number; month: number }, b: { year: number; month: number }) {
  return (a.year - b.year) * 12 + (a.month - b.month);
}

/** Assesses one client. */
export function assessClient(clientId: string, asOf = new Date()): PortfolioRow | null {
  const client: any = db().prepare("SELECT * FROM clients WHERE id=?").get(clientId);
  if (!client) return null;

  const profile = vertical(client.vertical);
  const tags: string[] = (db().prepare("SELECT tag FROM client_tags WHERE client_id=? ORDER BY tag")
    .all(clientId) as any[]).map((r) => r.tag);

  const history = clientHistory(clientId, false);
  const withFigures = history.filter((p) => p.revenue !== 0 || p.directCost !== 0);
  const latest = withFigures[withFigures.length - 1] ?? null;
  const prev = withFigures.length > 1 ? withFigures[withFigures.length - 2] : null;

  const reasons: AttentionReason[] = [];
  let score = 0;
  const add = (r: AttentionReason) => { reasons.push(r); score += r.weight; };

  // ---- Nothing closed at all ----
  if (!latest) {
    add({ code: "never_published", weight: WEIGHTS.neverPublished, severity: "high",
      headline: "No close on record",
      detail: "Nothing has been uploaded for this client. Every view is empty until a month is closed." });
    return {
      clientId, name: client.name, vertical: client.vertical ?? "generic",
      verticalLabel: profile.label, tags, ownerUserId: client.owner_user_id,
      trend: [], periodLabel: null, periodId: null, status: null, monthsBehind: 99,
      revenue: null, netIncome: null, netMarginPct: null, cash: null,
      weeksOfCover: null, revenueChangePct: null, confidence: null, gatePass: null,
      openCommitments: 0, oldestCommitmentMonths: 0,
      attention: Math.min(100, score), band: "urgent", reasons,
    };
  }

  // ---- Is the close current? ----
  // A month is expected once the following month is under way. Two months behind is a
  // service failure, not a data point.
  const now = { year: asOf.getFullYear(), month: asOf.getMonth() + 1 };
  const behind = Math.max(0, monthsBetween(now, { year: latest.year, month: latest.month }) - 1);
  if (behind >= 1) {
    add({ code: "close_overdue",
      weight: Math.min(WEIGHTS.closeOverdue, WEIGHTS.closeOverdue * behind * 0.6),
      severity: behind >= 2 ? "critical" : "high",
      headline: `${behind} month${behind > 1 ? "s" : ""} behind on the close`,
      detail: `The most recent figures are ${latest.label}. Advice cannot run ahead of the books.` });
  }

  // ---- Does the latest close tie? ----
  let gatePass: boolean | null = null;
  try {
    const gate = runGate(latest.periodId);
    gatePass = gate.pass;
    if (!gate.pass) {
      const failing = gate.checks.filter((c) => !c.pass);
      add({ code: "gate_failing", weight: WEIGHTS.gateFailing, severity: "critical",
        headline: "The close does not tie",
        detail: `${failing.length} check${failing.length > 1 ? "s" : ""} failing: ${failing.map((c) => c.name).join("; ")}.` });
    }
  } catch { /* a period mid-construction is not a signal */ }

  // ---- Cash ----
  const cash = cashOutlook(latest, profile);
  if (cash.goesNegative) {
    add({ code: "cash_critical", weight: WEIGHTS.cashCritical, severity: "critical",
      headline: "Projected to run short of cash",
      detail: `The thirteen-week outlook dips to $${cash.lowestBalance}K in week ${cash.lowestWeek}.` });
  } else if ((cash.weeksOfCover ?? 99) < 6) {
    add({ code: "cash_tight", weight: WEIGHTS.cashTight, severity: "high",
      headline: "Thin cash cover",
      detail: `${cash.weeksOfCover} weeks of cover at the current burn.` });
  }

  // ---- Profitability ----
  if (latest.netIncome < 0) {
    add({ code: "loss_making", weight: WEIGHTS.lossMaking, severity: "high",
      headline: "Loss-making month",
      detail: `${latest.label} net income was −$${Math.abs(latest.netIncome).toFixed(1)}K.` });
  }

  // ---- Revenue movement ----
  let revenueChangePct: number | null = null;
  if (prev && prev.revenue) {
    revenueChangePct = r1(((latest.revenue - prev.revenue) / prev.revenue) * 100);
    if (revenueChangePct <= -25) {
      add({ code: "revenue_collapse", weight: WEIGHTS.revenueCollapse, severity: "critical",
        headline: `Revenue fell ${Math.abs(revenueChangePct)}%`,
        detail: `$${prev.revenue}K in ${prev.label} to $${latest.revenue}K in ${latest.label}.` });
    } else if (revenueChangePct <= -10) {
      add({ code: "revenue_decline", weight: WEIGHTS.revenueDecline, severity: "medium",
        headline: `Revenue fell ${Math.abs(revenueChangePct)}%`,
        detail: `$${prev.revenue}K in ${prev.label} to $${latest.revenue}K in ${latest.label}.` });
    }
  }

  // ---- Metrics outside a target somebody actually agreed ----
  // Metrics with no agreed target are deliberately ignored here. Scoring a client against
  // a band nobody set would be the same invented-number problem in a new place.
  const kpis = computeKpis(clientId, latest);
  const breached = kpis.filter((k) => k.verdict === "below" || k.verdict === "above");
  if (breached.length) {
    const capped = Math.min(breached.length * WEIGHTS.targetBreach, 21);
    add({ code: "target_breach", weight: capped,
      severity: breached.some((b) => b.importance === 3) ? "high" : "medium",
      headline: `${breached.length} metric${breached.length > 1 ? "s" : ""} outside target`,
      detail: breached.slice(0, 3).map((b) => `${b.label} ${b.verdict}`).join(", ")
        + (breached.length > 3 ? `, and ${breached.length - 3} more` : "") + "." });
  }

  // ---- Evidence quality ----
  const confidence = assessConfidence(latest, clientId);
  if (confidence.overall < 60) {
    add({ code: "low_confidence", weight: WEIGHTS.lowConfidence, severity: "medium",
      headline: `Confidence ${confidence.overall}%`,
      detail: confidence.weakest ?? "Several evidence components are incomplete." });
  }

  // ---- Commitments that have not moved ----
  const actions = openActions(clientId, latest);
  const oldest = actions.reduce((mx, a) => Math.max(mx, a.monthsOpen), 0);
  if (oldest >= 3) {
    add({ code: "stale_commitment", weight: WEIGHTS.staleCommitment, severity: "high",
      headline: `A commitment has been open ${oldest} months`,
      detail: `${actions.filter((a) => a.monthsOpen >= 3).map((a) => a.title).slice(0, 2).join("; ")}.` });
  }

  const attention = Math.min(100, Math.round(score));

  return {
    clientId, name: client.name, vertical: client.vertical ?? "generic",
    verticalLabel: profile.label, tags, ownerUserId: client.owner_user_id,
    trend: withFigures.slice(-12).map((p) => p.revenue),
    periodLabel: latest.label, periodId: latest.periodId, status: latest.status,
    monthsBehind: behind,
    revenue: latest.revenue, netIncome: latest.netIncome, netMarginPct: latest.netMarginPct,
    cash: latest.cash.total, weeksOfCover: cash.weeksOfCover, revenueChangePct,
    confidence: confidence.overall, gatePass,
    openCommitments: actions.length, oldestCommitmentMonths: oldest,
    attention,
    band: attention >= 40 ? "urgent" : attention >= 18 ? "watch" : "steady",
    // Loudest first — an advisor reads the first line and needs it to be the real one.
    reasons: reasons.sort((a, b) => b.weight - a.weight),
  };
}

/* ------------------------------------------------------------------ */
/* The book                                                            */
/* ------------------------------------------------------------------ */

export type PortfolioFilter = {
  tag?: string;
  vertical?: string;
  band?: string;
  sort?: string;
};

export type Portfolio = {
  rows: PortfolioRow[];
  /** Statistics over the *filtered* set, so like is compared with like. */
  cohort: {
    count: number;
    cohortMeaningful: boolean;
    totalRevenue: number;
    medianNetMargin: number | null;
    medianConfidence: number | null;
    urgent: number; watch: number; steady: number;
    behindOnClose: number;
    gateFailing: number;
  };
  allTags: string[];
  allVerticals: { key: string; label: string }[];
};

export function loadPortfolio(filter: PortfolioFilter = {}, asOf = new Date()): Portfolio {
  const clients: any[] = db().prepare("SELECT id FROM clients ORDER BY name").all();
  let rows = clients
    .map((c) => assessClient(c.id, asOf))
    .filter((r): r is PortfolioRow => r !== null);

  const allTags = Array.from(new Set(rows.flatMap((r) => r.tags))).sort();
  const allVerticals = Array.from(new Map(rows.map((r) => [r.vertical, r.verticalLabel])).entries())
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  if (filter.tag) rows = rows.filter((r) => r.tags.includes(filter.tag!));
  if (filter.vertical) rows = rows.filter((r) => r.vertical === filter.vertical);
  if (filter.band) rows = rows.filter((r) => r.band === filter.band);

  const sort = filter.sort ?? "attention";
  rows.sort((a, b) => {
    switch (sort) {
      case "name": return a.name.localeCompare(b.name);
      case "revenue": return (b.revenue ?? -1) - (a.revenue ?? -1);
      case "margin": return (b.netMarginPct ?? -999) - (a.netMarginPct ?? -999);
      case "confidence": return (a.confidence ?? 101) - (b.confidence ?? 101);
      case "growth": return (b.revenueChangePct ?? -999) - (a.revenueChangePct ?? -999);
      case "decline": return (a.revenueChangePct ?? 999) - (b.revenueChangePct ?? 999);
      default: return b.attention - a.attention || a.name.localeCompare(b.name);
    }
  });

  /**
   * A median needs a cohort. Below three clients it describes one business and calls it a
   * benchmark, which is worse than showing nothing — the reader compares against it.
   */
  const median = (xs: number[]) => {
    if (xs.length < 3) return null;
    const s = [...xs].sort((a, b) => a - b);
    return r1(s[Math.floor(s.length / 2)]);
  };

  return {
    rows,
    cohort: {
      count: rows.length,
      /** False when the selection is too small for a median to mean anything. */
      cohortMeaningful: rows.length >= 3,
      totalRevenue: r1(rows.reduce((s, r) => s + (r.revenue ?? 0), 0)),
      medianNetMargin: median(rows.map((r) => r.netMarginPct).filter((x): x is number => x !== null)),
      medianConfidence: median(rows.map((r) => r.confidence).filter((x): x is number => x !== null)),
      urgent: rows.filter((r) => r.band === "urgent").length,
      watch: rows.filter((r) => r.band === "watch").length,
      steady: rows.filter((r) => r.band === "steady").length,
      behindOnClose: rows.filter((r) => r.monthsBehind >= 1).length,
      gateFailing: rows.filter((r) => r.gatePass === false).length,
    },
    allTags, allVerticals,
  };
}

/* ------------------------------------------------------------------ */
/* Tags                                                                */
/* ------------------------------------------------------------------ */

export function setTags(clientId: string, tags: string[]) {
  const write = db().transaction(() => {
    db().prepare("DELETE FROM client_tags WHERE client_id=?").run(clientId);
    for (const t of tags.map((x) => x.trim()).filter(Boolean)) {
      db().prepare("INSERT OR IGNORE INTO client_tags (id, client_id, tag) VALUES (?,?,?)")
        .run(`${clientId}:${t}`, clientId, t);
    }
  });
  write();
}
