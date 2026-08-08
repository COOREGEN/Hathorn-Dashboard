/**
 * Release authority.
 *
 * One module decides whether a period may be published, and it is the only thing that
 * can publish. Every other surface — a button, an export, a scheduled job, an email —
 * calls this. Duplicated publish logic is how a system ends up with a path that skips a
 * check nobody remembers exists.
 *
 * Two rules make this different from a status flag:
 *
 * **Evaluate again inside the transaction.** A browser verdict from thirty seconds ago is
 * not evidence. Data can change between the advisor seeing a green gate and pressing
 * publish, and the check that matters is the one at the moment of the write.
 *
 * **The release is an immutable snapshot.** Previously "published" was a column while the
 * figures stayed in editable tables, so a statement a client had already read could
 * silently change — someone corrects a payroll line in September and the June statement
 * becomes a different document. There was no answer to "what did you send me". A release
 * now freezes the whole statement, and client-facing surfaces read the frozen copy.
 *
 * Correcting a published month means issuing an **amendment**: a new version that
 * supersedes the previous one and records why. That is how accountants already work, and
 * the software should not invent a different model.
 */

import crypto from "crypto";
import { db, uid } from "./db";
import { runGate } from "./gate";
import { computePeriod } from "./metrics";
import { assessConfidence } from "./confidence";
import { balanceSheet, cashOutlook, openActions } from "./advisory";
import { computeKpis } from "./kpi-registry";
import { vertical } from "./verticals";

export type Blocker = {
  code: string;
  severity: "blocking" | "warning";
  message: string;
  /** Where to go to fix it. */
  action?: string;
  href?: string;
};

export type Evaluation = {
  canPublish: boolean;
  blockers: Blocker[];
  warnings: Blocker[];
  /** The version this would create. */
  nextVersion: number;
  /** Set when a live release already exists for the period. */
  currentRelease: { id: string; version: number; publishedAt: string } | null;
  isAmendment: boolean;
};

/* ------------------------------------------------------------------ */
/* Evaluate                                                            */
/* ------------------------------------------------------------------ */

/**
 * Decides whether this period may reach a client, and names every reason it may not.
 *
 * Blockers stop publication. Warnings do not — they are things an advisor should know
 * they are choosing, like publishing while a cleanup finding is still open. Conflating
 * the two either blocks legitimate work or lets real problems through.
 */
export function evaluate(periodId: string): Evaluation {
  const blockers: Blocker[] = [];
  const warnings: Blocker[] = [];

  const period: any = db().prepare("SELECT * FROM periods WHERE id=?").get(periodId);
  if (!period) {
    return { canPublish: false, nextVersion: 1, currentRelease: null, isAmendment: false,
      blockers: [{ code: "no_period", severity: "blocking", message: "That period does not exist." }],
      warnings: [] };
  }
  const client: any = db().prepare("SELECT * FROM clients WHERE id=?").get(period.client_id);

  const current: any = db().prepare(
    "SELECT id, version, published_at FROM release_records WHERE period_id=? AND status='ACTIVE' ORDER BY version DESC LIMIT 1",
  ).get(periodId);
  const maxVersion: any = db().prepare(
    "SELECT COALESCE(MAX(version),0) v FROM release_records WHERE period_id=?").get(periodId);
  const nextVersion = (maxVersion?.v ?? 0) + 1;

  const lock: any = db().prepare("SELECT * FROM period_locks WHERE period_id=?").get(periodId);
  const isAmendment = Boolean(current);

  // A locked period may only be republished through an open amendment.
  if (lock && !lock.amendment_open) {
    blockers.push({
      code: "locked", severity: "blocking",
      message: `This period was published on ${String(current?.published_at ?? lock.locked_at).slice(0, 10)} and is locked. Open an amendment to change it.`,
      action: "Open an amendment", href: `/review/${periodId}`,
    });
  }

  // The gate is re-run here, never read from a cached verdict.
  const gate = runGate(periodId);
  if (!gate.pass) {
    for (const c of gate.checks.filter((x) => !x.pass)) {
      blockers.push({ code: "gate", severity: "blocking",
        message: `${c.name}: ${c.detail}`, action: "Review the close", href: `/review/${periodId}` });
    }
  }

  // A statement with no explanation is a chart, and the explanation is the product.
  const notes: any = db().prepare(
    "SELECT COUNT(*) n FROM story_notes WHERE period_id=? AND slot='WHAT_CHANGED'").get(periodId);
  if ((notes?.n ?? 0) === 0) {
    blockers.push({ code: "no_commentary", severity: "blocking",
      message: "No commentary has been written for this period.",
      action: "Write the commentary", href: `/review/${periodId}` });
  }

  const m = computePeriod(periodId);
  if (m.revenue === 0 && m.directCost === 0) {
    blockers.push({ code: "no_figures", severity: "blocking",
      message: "This period has no figures.", action: "Upload the close", href: "/upload" });
  }

  // An amendment must say why. A silent second version is worse than no versioning.
  if (isAmendment && lock?.amendment_open && !String(lock.amendment_reason || "").trim()) {
    blockers.push({ code: "no_amendment_reason", severity: "blocking",
      message: "An amendment needs a stated reason before it can be republished." });
  }

  // ---- Warnings: real, but the advisor's call ----
  if (!period.reconciled) {
    warnings.push({ code: "not_reconciled", severity: "warning",
      message: "The period is not marked reconciled. The figures may be complete and still unverified." });
  }
  const openCleanup: any = db().prepare(
    "SELECT COUNT(*) n FROM cleanup_findings WHERE client_id=? AND status='OPEN'").get(period.client_id);
  if ((openCleanup?.n ?? 0) > 0) {
    warnings.push({ code: "open_cleanup", severity: "warning",
      message: `${openCleanup.n} cleanup finding${openCleanup.n > 1 ? "s are" : " is"} still open. The books may not be settled.` });
  }
  const conf = assessConfidence(m, period.client_id);
  if (conf.overall < 60) {
    warnings.push({ code: "low_confidence", severity: "warning",
      message: `Confidence is ${conf.overall}%. ${conf.weakest ?? ""}`.trim() });
  }
  if (client?.stage && client.stage !== "ADVISORY") {
    warnings.push({ code: "engagement_stage", severity: "warning",
      message: `This client is still at ${String(client.stage).toLowerCase()}. Publishing a statement before alignment means the metrics have no agreed targets yet.` });
  }

  return {
    canPublish: blockers.length === 0,
    blockers, warnings, nextVersion,
    currentRelease: current ? { id: current.id, version: current.version, publishedAt: current.published_at } : null,
    isAmendment,
  };
}

/* ------------------------------------------------------------------ */
/* The snapshot                                                        */
/* ------------------------------------------------------------------ */

/**
 * Freezes everything the client-facing statement needs.
 *
 * Deliberately denormalised and self-contained: a release must remain readable and
 * identical years later even if metric definitions change, a business is renamed, or the
 * client's targets move. Anything resolved by lookup at read time is not frozen.
 */
export function buildSnapshot(periodId: string) {
  const period: any = db().prepare("SELECT * FROM periods WHERE id=?").get(periodId);
  const client: any = db().prepare("SELECT * FROM clients WHERE id=?").get(period.client_id);
  const m = computePeriod(periodId);
  const profile = vertical(client.vertical);

  return {
    schemaVersion: 1,
    frozenAt: new Date().toISOString(),
    client: {
      id: client.id, name: client.name,
      logoText: client.logo_text, logoSub: client.logo_sub,
      brandPrimary: client.brand_primary, brandAccent: client.brand_accent,
      template: client.template, industry: client.industry_tag || "",
    },
    period: {
      id: periodId, label: m.label, year: m.year, month: m.month,
      daysCovered: period.days_covered, basis: period.accounting_basis, currency: period.currency,
      reconciled: Boolean(period.reconciled),
    },
    figures: {
      revenue: m.revenue, directCost: m.directCost, grossProfit: m.grossProfit,
      grossMarginPct: m.grossMarginPct, opex: m.opex, netIncome: m.netIncome,
      netMarginPct: m.netMarginPct, laborPct: m.laborPct, totalPayroll: m.totalPayroll,
      otPremium: m.otPremium, cash: m.cash, arTotal: m.arTotal,
    },
    entities: m.entities.map((e) => ({
      id: e.id, name: e.name, status: e.status, revenue: e.revenue,
      directCost: e.directCost, grossProfit: e.grossProfit, grossMarginPct: e.grossMarginPct,
      opex: e.opex, netIncome: e.netIncome, netMarginPct: e.netMarginPct, laborPct: e.laborPct,
      payroll: e.payroll,
    })),
    receivables: m.ar,
    commentary: m.notes.map((n: any) => ({ slot: n.slot, tone: n.tone, heading: n.heading, body: n.body })),
    metrics: computeKpis(client.id, m).map((k) => ({
      key: k.key, label: k.label, category: k.category, unit: k.unit, decimals: k.decimals,
      value: k.value, target: k.target, verdict: k.verdict, importance: k.importance,
    })),
    balance: balanceSheet(periodId, m.netIncome),
    cashOutlook: cashOutlook(m, profile),
    actions: openActions(client.id, m),
    confidence: assessConfidence(m, client.id),
    // The language the statement was published under, frozen with it.
    language: profile.language,
    disclosure:
      "Prepared from records provided by management. These statements are management-prepared " +
      "and have not been audited, reviewed or compiled by Hathorn Advisory Group, and no assurance " +
      "is expressed on them.",
  };
}

const checksum = (obj: unknown) =>
  crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex").slice(0, 32);

/* ------------------------------------------------------------------ */
/* Publish                                                             */
/* ------------------------------------------------------------------ */

export type PublishResult = {
  ok: boolean;
  releaseId?: string;
  version?: number;
  checksum?: string;
  supersededVersion?: number;
  blockers?: Blocker[];
};

/**
 * Publishes a period.
 *
 * The evaluation runs again inside the transaction. A verdict from the browser thirty
 * seconds ago is not evidence — data can change between the advisor seeing a green gate
 * and pressing the button, and two advisors can press it at the same moment.
 */
export function publish(periodId: string, actorId: string): PublishResult {
  const d = db();
  let result: PublishResult = { ok: false };

  const tx = d.transaction(() => {
    const check = evaluate(periodId);
    if (!check.canPublish) { result = { ok: false, blockers: check.blockers }; return; }

    const snapshot = buildSnapshot(periodId);
    const sum = checksum(snapshot);
    const gate = runGate(periodId);
    const lock: any = d.prepare("SELECT * FROM period_locks WHERE period_id=?").get(periodId);

    // Supersede rather than replace. The prior version stays readable forever, because
    // "what did you send me in June" must always have an answer.
    if (check.currentRelease) {
      d.prepare("UPDATE release_records SET status='SUPERSEDED', superseded_by=? WHERE id=?")
        .run("pending", check.currentRelease.id);
    }

    const releaseId = uid();
    d.prepare(`INSERT INTO release_records
      (id,client_id,period_id,version,snapshot,checksum,gate_detail,published_by,status,amendment_reason)
      VALUES (?,?,?,?,?,?,?,?, 'ACTIVE', ?)`)
      .run(releaseId, snapshot.client.id, periodId, check.nextVersion,
        JSON.stringify(snapshot), sum,
        gate.checks.map((c) => `${c.name}: ${c.pass ? "ties" : "BREAK"}`).join("; "),
        actorId, lock?.amendment_reason ?? "");

    if (check.currentRelease) {
      d.prepare("UPDATE release_records SET superseded_by=? WHERE id=?")
        .run(releaseId, check.currentRelease.id);
    }

    // Lock the period. From here the source data is immutable until an amendment opens.
    d.prepare(`INSERT INTO period_locks (period_id,release_id,locked_by,amendment_open,amendment_reason)
      VALUES (?,?,?,0,'')
      ON CONFLICT(period_id) DO UPDATE SET
        release_id=excluded.release_id, locked_at=datetime('now'), locked_by=excluded.locked_by,
        amendment_open=0, amendment_reason='', amendment_by=NULL, amendment_opened_at=NULL`)
      .run(periodId, releaseId, actorId);

    d.prepare("UPDATE periods SET status='PUBLISHED', published_at=datetime('now') WHERE id=?").run(periodId);

    result = {
      ok: true, releaseId, version: check.nextVersion, checksum: sum,
      supersededVersion: check.currentRelease?.version,
    };
  });

  tx();
  return result;
}

/* ------------------------------------------------------------------ */
/* Amend and revoke                                                    */
/* ------------------------------------------------------------------ */

/**
 * Opens an amendment: the only way to change a published month.
 *
 * The reason is required and travels with the resulting version, so the client can be
 * told what changed and why rather than noticing that a figure moved.
 */
export function openAmendment(periodId: string, actorId: string, reason: string) {
  if (!reason.trim()) throw new Error("An amendment needs a reason.");
  const lock: any = db().prepare("SELECT * FROM period_locks WHERE period_id=?").get(periodId);
  if (!lock) throw new Error("This period has not been published, so there is nothing to amend.");

  db().prepare(`UPDATE period_locks SET amendment_open=1, amendment_reason=?, amendment_by=?,
    amendment_opened_at=datetime('now') WHERE period_id=?`).run(reason.trim(), actorId, periodId);
  // The period returns to review; the live release stays visible to the client until the
  // amendment is published, because withdrawing a statement without replacing it is worse.
  db().prepare("UPDATE periods SET status='IN_REVIEW' WHERE id=?").run(periodId);
  return { ok: true };
}

/**
 * Withdraws a release without replacing it. Rare, and deliberately awkward.
 */
export function revoke(releaseId: string, actorId: string, reason: string) {
  if (!reason.trim()) throw new Error("Revoking a statement needs a reason.");
  const r: any = db().prepare("SELECT * FROM release_records WHERE id=?").get(releaseId);
  if (!r) throw new Error("No such release.");

  db().prepare(`UPDATE release_records SET status='REVOKED', revoked_reason=?, revoked_at=datetime('now')
    WHERE id=?`).run(reason.trim(), releaseId);
  const remaining: any = db().prepare(
    "SELECT COUNT(*) n FROM release_records WHERE period_id=? AND status='ACTIVE'").get(r.period_id);
  if ((remaining?.n ?? 0) === 0) {
    db().prepare("UPDATE periods SET status='IN_REVIEW', published_at=NULL WHERE id=?").run(r.period_id);
    db().prepare("DELETE FROM period_locks WHERE period_id=?").run(r.period_id);
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

/**
 * The live release for a period — what the client sees.
 *
 * Client-facing surfaces read this, never the live tables, which is the whole point: a
 * statement someone has already read cannot change underneath them.
 */
export function activeRelease(periodId: string) {
  const r: any = db().prepare(
    "SELECT * FROM release_records WHERE period_id=? AND status='ACTIVE' ORDER BY version DESC LIMIT 1",
  ).get(periodId);
  if (!r) return null;
  return {
    id: r.id, version: r.version, publishedAt: r.published_at, checksum: r.checksum,
    amendmentReason: r.amendment_reason || "",
    snapshot: JSON.parse(r.snapshot) as ReturnType<typeof buildSnapshot>,
  };
}

/** Every published version of a period, newest first. History is never deleted. */
export function releaseHistory(periodId: string) {
  return (db().prepare(
    `SELECT id, version, published_at, checksum, status, amendment_reason, revoked_reason
       FROM release_records WHERE period_id=? ORDER BY version DESC`).all(periodId) as any[])
    .map((r) => ({
      id: r.id, version: r.version, publishedAt: r.published_at, checksum: r.checksum,
      status: r.status, amendmentReason: r.amendment_reason || "", revokedReason: r.revoked_reason || "",
    }));
}

/** Published periods for a client, for the portal's period selector. */
export function publishedPeriods(clientId: string) {
  return db().prepare(
    `SELECT r.period_id, r.version, r.published_at, p.year, p.month
       FROM release_records r JOIN periods p ON p.id = r.period_id
      WHERE r.client_id=? AND r.status='ACTIVE'
      ORDER BY p.year DESC, p.month DESC`).all(clientId) as any[];
}

export function isLocked(periodId: string) {
  const l: any = db().prepare("SELECT * FROM period_locks WHERE period_id=?").get(periodId);
  if (!l) return { locked: false, amendmentOpen: false, reason: "" };
  return {
    locked: !l.amendment_open,
    amendmentOpen: Boolean(l.amendment_open),
    reason: l.amendment_reason || "",
    lockedAt: l.locked_at,
  };
}

/**
 * The guard every write path must call before touching a period's source data.
 *
 * Upload already refused to overwrite a published period, but that was one check on one
 * route. Anything else that writes — an adjustment, a background sync, a fix script —
 * would have gone straight through.
 */
export function assertEditable(periodId: string) {
  const l = isLocked(periodId);
  if (l.locked) {
    throw new Error(
      "This period is published and locked. Open an amendment from the review screen to change it.");
  }
}
