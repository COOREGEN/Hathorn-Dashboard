/**
 * The engagement.
 *
 * A dashboard is the last step of a service, not the service. The work runs:
 *
 *   1. **Discovery** — find the inefficiencies, gaps and risks.
 *   2. **Cleanup** — historical audit and remediation until the books are trustworthy.
 *   3. **Alignment** — agree the client's goals, their pain points, and which metrics
 *      matter for their industry and their situation.
 *   4. **Advisory** — monthly sessions against those metrics.
 *
 * The platform previously modelled only step four, which produced two concrete failures.
 * A client mid-cleanup was shown a polished dashboard of numbers nobody had verified. And
 * targets could carry a provenance of `AGREED` while the meeting where agreement happens
 * did not exist in the system — so every metric sat permanently at "not yet agreed".
 *
 * The through-line matters more than any single stage: **a discovery finding becomes a
 * goal, a goal is measured by a metric, that metric carries an agreed target, and the
 * monthly session tracks it.** Nothing else on the market can answer "why are we watching
 * this number", because nothing else was there when the client said why.
 */

import { db, uid } from "./db";
import { setClientConfig } from "./kpi-registry";

export type Stage = "DISCOVERY" | "CLEANUP" | "ALIGNMENT" | "ADVISORY" | "PAUSED";

export const STAGES: { key: Stage; label: string; question: string; description: string }[] = [
  { key: "DISCOVERY", label: "Discovery",
    question: "What is actually going on in this business?",
    description: "The discovery call. Inefficiencies, gaps, risks and opportunities, captured while they are still fresh." },
  { key: "CLEANUP", label: "Cleanup",
    question: "Can we trust the books?",
    description: "Historical audit and remediation. Nothing downstream means anything until this closes." },
  { key: "ALIGNMENT", label: "Alignment",
    question: "What does this client actually care about?",
    description: "The goals session. Goals, pain points, and the metrics that will measure them — with targets the client agreed to." },
  { key: "ADVISORY", label: "Advisory",
    question: "Are they getting financially sound?",
    description: "Monthly sessions against the agreed metrics, with commitments carried forward." },
  { key: "PAUSED", label: "Paused",
    question: "",
    description: "Engagement on hold." },
];

/* ------------------------------------------------------------------ */
/* Readiness                                                           */
/* ------------------------------------------------------------------ */

export type StageCheck = { label: string; done: boolean; detail: string; action?: string; href?: string };

export type Readiness = {
  stage: Stage;
  stageLabel: string;
  question: string;
  checks: StageCheck[];
  complete: number;
  total: number;
  /** True when everything this stage needs is done and the next stage is warranted. */
  readyToAdvance: boolean;
  nextStage: Stage | null;
  /** The single thing to do next, so a screen can say it in one line. */
  nextAction: string | null;
};

/**
 * What this client still needs before the engagement moves on.
 *
 * Deliberately advisory rather than blocking — a firm sometimes runs a session before
 * cleanup is finished and that is their call. But the platform should say so plainly
 * rather than presenting unverified numbers as if they were settled.
 */
export function readiness(clientId: string): Readiness {
  const c: any = db().prepare("SELECT * FROM clients WHERE id=?").get(clientId);
  const stage: Stage = (c?.stage as Stage) ?? "DISCOVERY";
  const meta = STAGES.find((s) => s.key === stage) ?? STAGES[0];
  const n = (sql: string, ...args: any[]) => (db().prepare(sql).get(...args) as any)?.n ?? 0;

  const findings = n("SELECT COUNT(*) n FROM discovery_findings WHERE client_id=?", clientId);
  const openCleanup = n("SELECT COUNT(*) n FROM cleanup_findings WHERE client_id=? AND status='OPEN'", clientId);
  const scopes = n("SELECT COUNT(*) n FROM cleanup_scope WHERE client_id=?", clientId);
  const scopesDone = n("SELECT COUNT(*) n FROM cleanup_scope WHERE client_id=? AND status='COMPLETE'", clientId);
  const goals = n("SELECT COUNT(*) n FROM client_goals WHERE client_id=? AND status='ACTIVE'", clientId);
  const pains = n("SELECT COUNT(*) n FROM client_pain_points WHERE client_id=? AND status='ACTIVE'", clientId);
  const agreed = n("SELECT COUNT(*) n FROM kpi_client_config WHERE client_id=? AND active=1 AND target_source='AGREED'", clientId);
  const activeKpis = n("SELECT COUNT(*) n FROM kpi_client_config WHERE client_id=? AND active=1", clientId);
  const published = n("SELECT COUNT(*) n FROM periods WHERE client_id=? AND status='PUBLISHED'", clientId);
  const sessions = n("SELECT COUNT(*) n FROM advisory_sessions WHERE client_id=? AND status='HELD'", clientId);

  let checks: StageCheck[] = [];
  let nextStage: Stage | null = null;

  if (stage === "DISCOVERY") {
    nextStage = "CLEANUP";
    checks = [
      { label: "Discovery findings captured", done: findings > 0,
        detail: findings ? `${findings} recorded` : "Nothing captured from the discovery call yet",
        action: "Record findings", href: `/engagement/discovery?client=${clientId}` },
      { label: "Cleanup scope defined", done: scopes > 0,
        detail: scopes ? `${scopes} period range${scopes > 1 ? "s" : ""} scoped` : "No historical period scoped for audit",
        action: "Scope the audit", href: `/engagement/cleanup?client=${clientId}` },
    ];
  } else if (stage === "CLEANUP") {
    nextStage = "ALIGNMENT";
    checks = [
      { label: "Audit scope complete", done: scopes > 0 && scopesDone === scopes,
        detail: scopes ? `${scopesDone} of ${scopes} ranges complete` : "No scope defined",
        action: "Work the audit", href: `/engagement/cleanup?client=${clientId}` },
      { label: "Cleanup findings resolved", done: openCleanup === 0,
        detail: openCleanup ? `${openCleanup} still open` : "Nothing outstanding",
        action: "Resolve findings", href: `/engagement/cleanup?client=${clientId}` },
      { label: "At least one period published", done: published > 0,
        detail: published ? `${published} published` : "Nothing has cleared the gate yet",
        action: "Upload a close", href: "/upload" },
    ];
  } else if (stage === "ALIGNMENT") {
    nextStage = "ADVISORY";
    checks = [
      { label: "Goals agreed", done: goals > 0,
        detail: goals ? `${goals} active` : "No goals recorded from the goals session",
        action: "Record goals", href: `/engagement/goals?client=${clientId}` },
      { label: "Pain points understood", done: pains > 0,
        detail: pains ? `${pains} recorded with root cause` : "Nothing recorded",
        action: "Record pain points", href: `/engagement/goals?client=${clientId}` },
      // The check that closes the loop the platform was missing.
      { label: "Metrics have agreed targets", done: agreed > 0,
        detail: agreed
          ? `${agreed} of ${activeKpis} metrics carry a target the client agreed to`
          : "Every metric is still reported without a verdict",
        action: "Agree targets", href: `/engagement/goals?client=${clientId}` },
    ];
  } else if (stage === "ADVISORY") {
    checks = [
      { label: "Books current", done: published > 0,
        detail: published ? `${published} periods published` : "No published period",
        action: "Upload a close", href: "/upload" },
      { label: "Sessions being held", done: sessions > 0,
        detail: sessions ? `${sessions} held` : "No advisory session recorded yet",
        action: "Record a session", href: `/engagement/sessions?client=${clientId}` },
      { label: "Goals still tracked", done: goals > 0,
        detail: goals ? `${goals} active` : "No active goals — worth revisiting",
        action: "Review goals", href: `/engagement/goals?client=${clientId}` },
      { label: "Cleanup closed out", done: openCleanup === 0,
        detail: openCleanup ? `${openCleanup} cleanup findings still open` : "Clear",
        action: "Close them out", href: `/engagement/cleanup?client=${clientId}` },
    ];
  }

  const complete = checks.filter((c) => c.done).length;
  const firstOpen = checks.find((c) => !c.done);

  return {
    stage, stageLabel: meta.label, question: meta.question, checks,
    complete, total: checks.length,
    readyToAdvance: checks.length > 0 && complete === checks.length && nextStage !== null,
    nextStage,
    nextAction: firstOpen ? `${firstOpen.action}: ${firstOpen.detail.toLowerCase()}` : null,
  };
}

export function setStage(clientId: string, stage: Stage) {
  db().prepare("UPDATE clients SET stage=?, stage_since=datetime('now') WHERE id=?").run(stage, clientId);
  if (stage === "ADVISORY") {
    db().prepare(
      "UPDATE clients SET engagement_started=COALESCE(engagement_started, datetime('now')) WHERE id=?",
    ).run(clientId);
  }
}

/* ------------------------------------------------------------------ */
/* Discovery                                                           */
/* ------------------------------------------------------------------ */

export function addFinding(clientId: string, f: {
  kind: string; area?: string; title: string; detail?: string; severity?: string;
}) {
  const id = uid();
  db().prepare(`INSERT INTO discovery_findings (id,client_id,kind,area,title,detail,severity)
    VALUES (?,?,?,?,?,?,?)`)
    .run(id, clientId, f.kind, f.area ?? "", f.title, f.detail ?? "", f.severity ?? "medium");
  return id;
}

export function findings(clientId: string) {
  return db().prepare(
    "SELECT * FROM discovery_findings WHERE client_id=? ORDER BY CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, found_at",
  ).all(clientId) as any[];
}

/* ------------------------------------------------------------------ */
/* Cleanup                                                             */
/* ------------------------------------------------------------------ */

export function cleanupState(clientId: string) {
  const scopes = db().prepare("SELECT * FROM cleanup_scope WHERE client_id=? ORDER BY period_from").all(clientId) as any[];
  const items = db().prepare(
    "SELECT * FROM cleanup_findings WHERE client_id=? ORDER BY CASE status WHEN 'OPEN' THEN 0 ELSE 1 END, ABS(amount) DESC",
  ).all(clientId) as any[];
  const open = items.filter((i) => i.status === "OPEN");
  return {
    scopes, items, open,
    exposure: Math.round(open.reduce((s, i) => s + Math.abs(i.amount), 0) * 10) / 10,
    complete: scopes.length > 0 && scopes.every((s) => s.status === "COMPLETE") && open.length === 0,
  };
}

/* ------------------------------------------------------------------ */
/* Alignment — where an agreed target actually comes from               */
/* ------------------------------------------------------------------ */

export function goals(clientId: string) {
  return db().prepare("SELECT * FROM client_goals WHERE client_id=? ORDER BY sort, agreed_at").all(clientId) as any[];
}
export function painPoints(clientId: string) {
  return db().prepare("SELECT * FROM client_pain_points WHERE client_id=? ORDER BY raised_at").all(clientId) as any[];
}

/**
 * Records a goal and, where it names a metric, writes the agreed target through to the
 * metric registry.
 *
 * This is the join the platform was missing. A target with source `AGREED` now has a
 * provenance you can point at in a meeting: the goal, its date, and what the client said.
 */
export function addGoal(clientId: string, g: {
  title: string; detail?: string; horizon?: string; targetDate?: string;
  kpiKey?: string; targetValue?: number; targetLo?: number; targetHi?: number;
  baseline?: number; fromFindingId?: string;
}) {
  const id = uid();
  db().prepare(`INSERT INTO client_goals
    (id,client_id,title,detail,horizon,target_date,measured_by_kpi,target_value,baseline_value)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, clientId, g.title, g.detail ?? "", g.horizon ?? "YEAR", g.targetDate ?? "",
      g.kpiKey ?? null, g.targetValue ?? null, g.baseline ?? null);

  // Close the loop: the metric now carries a target the client agreed to, with the goal
  // recorded as its basis.
  if (g.kpiKey && (g.targetValue != null || (g.targetLo != null && g.targetHi != null))) {
    setClientConfig(clientId, g.kpiKey, {
      active: true,
      targetLo: g.targetLo ?? null,
      targetHi: g.targetHi ?? null,
      targetPoint: g.targetLo != null ? null : (g.targetValue ?? null),
      targetSource: "AGREED",
      targetNote: `Agreed in the goals session: ${g.title}${g.targetDate ? ` by ${g.targetDate}` : ""}.`,
    });
  }

  // A finding that became a goal is no longer just an observation.
  if (g.fromFindingId) {
    db().prepare("UPDATE discovery_findings SET became_goal_id=?, status='ADDRESSED' WHERE id=?")
      .run(id, g.fromFindingId);
  }
  return id;
}

export function addPainPoint(clientId: string, p: {
  title: string; detail?: string; rootCause?: string; kpiKey?: string;
}) {
  const id = uid();
  db().prepare(`INSERT INTO client_pain_points (id,client_id,title,detail,root_cause,measured_by_kpi)
    VALUES (?,?,?,?,?,?)`)
    .run(id, clientId, p.title, p.detail ?? "", p.rootCause ?? "", p.kpiKey ?? null);
  return id;
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

export function sessions(clientId: string) {
  return db().prepare(
    "SELECT * FROM advisory_sessions WHERE client_id=? ORDER BY COALESCE(held_at, scheduled_for) DESC",
  ).all(clientId) as any[];
}

/**
 * Builds the agenda for a monthly session from what the platform already knows.
 *
 * This is the payoff for everything upstream. The advisor opens the session and the
 * agenda is already written: the goals they agreed, the pain points they raised, what
 * moved this month, and what was promised last month and has not happened.
 */
export function draftAgenda(clientId: string, periodLabel: string) {
  const g = goals(clientId).filter((x) => x.status === "ACTIVE");
  const p = painPoints(clientId).filter((x) => x.status === "ACTIVE");
  const open: any[] = db().prepare(
    "SELECT title, owner FROM action_items WHERE client_id=? AND status='OPEN'").all(clientId);
  const cleanup: any[] = db().prepare(
    "SELECT title FROM cleanup_findings WHERE client_id=? AND status='OPEN' LIMIT 3").all(clientId);

  const lines: string[] = [`${periodLabel} advisory session`, ""];
  lines.push("1. What changed this month", "   — walk the statement, lead with the explanation", "");
  if (g.length) {
    lines.push("2. Progress against agreed goals");
    for (const x of g) lines.push(`   — ${x.title}${x.target_date ? ` (by ${x.target_date})` : ""}`);
    lines.push("");
  }
  if (p.length) {
    lines.push(`${g.length ? 3 : 2}. Pain points raised at alignment`);
    for (const x of p) lines.push(`   — ${x.title}${x.root_cause ? ` — root cause: ${x.root_cause}` : ""}`);
    lines.push("");
  }
  if (open.length) {
    lines.push(`${(g.length ? 1 : 0) + (p.length ? 1 : 0) + 2}. Commitments from last time`);
    for (const x of open) lines.push(`   — ${x.title}${x.owner ? ` (${x.owner})` : ""}`);
    lines.push("");
  }
  if (cleanup.length) {
    lines.push("Outstanding from cleanup");
    for (const x of cleanup) lines.push(`   — ${x.title}`);
    lines.push("");
  }
  lines.push("Decisions and new commitments", "   — ");
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* The through-line                                                    */
/* ------------------------------------------------------------------ */

export type Thread = {
  finding: { id: string; title: string; kind: string } | null;
  goal: { id: string; title: string; targetDate: string } | null;
  kpiKey: string | null;
  targetSource: string | null;
};

/**
 * Traces why a metric is being watched, back to the conversation that put it there.
 *
 * "We track your labor ratio because in the discovery call you said scheduling was
 * chaotic, in the goals session you set 68–72% by December, and here is where it sits."
 * That sentence is the product.
 */
export function threadFor(clientId: string, kpiKey: string): Thread {
  const goal: any = db().prepare(
    "SELECT * FROM client_goals WHERE client_id=? AND measured_by_kpi=? AND status='ACTIVE' LIMIT 1",
  ).get(clientId, kpiKey);
  const finding: any = goal
    ? db().prepare("SELECT * FROM discovery_findings WHERE became_goal_id=?").get(goal.id)
    : null;
  const cfg: any = db().prepare(
    "SELECT target_source FROM kpi_client_config WHERE client_id=? AND kpi_key=?",
  ).get(clientId, kpiKey);

  return {
    finding: finding ? { id: finding.id, title: finding.title, kind: finding.kind } : null,
    goal: goal ? { id: goal.id, title: goal.title, targetDate: goal.target_date } : null,
    kpiKey,
    targetSource: cfg?.target_source ?? null,
  };
}
