/**
 * The story agent.
 *
 * Turns a computed period into draft commentary the advisor edits and approves.
 * This is the piece that makes the platform more than a chart library: the numbers
 * are the input, the *explanation* is the product.
 *
 * Two rules shape the prompt:
 *   1. Every note must name a number, a cause, and an action. No vague filler.
 *   2. The agent must distinguish timing from operational — a $58K claims lag and a
 *      $22K/month staffing loss look identical on a chart and mean opposite things.
 *
 * The agent drafts. The advisor always edits and approves. It never publishes.
 */

import { config } from "./config";
import { computePeriod, clientHistory, type PeriodMetrics } from "./metrics";
import { db } from "./db";
import { fetchWithTimeout } from "./security";

export type DraftNote = { slot: "WHAT_CHANGED" | "ACTION"; tone: "info" | "warn" | "bad"; heading: string; body: string };

/* ------------------------------------------------------------------ */
/* Signal detection — deterministic math, done before the model sees it */
/* ------------------------------------------------------------------ */

type Signal = { kind: string; detail: string; severity: "info" | "warn" | "bad" };

function detectSignals(cur: PeriodMetrics, prev: PeriodMetrics | null, laborLo: number, laborHi: number): Signal[] {
  const s: Signal[] = [];
  const r1 = (n: number) => Math.round(n * 10) / 10;

  if (prev && prev.revenue > 0) {
    const delta = ((cur.revenue - prev.revenue) / prev.revenue) * 100;
    if (Math.abs(delta) >= 5) {
      s.push({
        kind: "Revenue movement",
        detail: `Consolidated revenue ${delta >= 0 ? "rose" : "fell"} ${Math.abs(r1(delta))}% ` +
                `($${prev.revenue}K → $${cur.revenue}K) versus ${prev.label}.`,
        severity: delta <= -10 ? "bad" : delta < 0 ? "warn" : "info",
      });
    }
    // Per-entity movement often explains the consolidated number.
    for (const e of cur.entities) {
      const pe = prev.entities.find((x) => x.id === e.id);
      if (!pe || pe.revenue < 1) continue;
      const d = ((e.revenue - pe.revenue) / pe.revenue) * 100;
      if (Math.abs(d) >= 15) {
        s.push({
          kind: `Entity swing — ${e.name}`,
          detail: `${e.name} revenue moved ${r1(d)}% ($${pe.revenue}K → $${e.revenue}K).`,
          severity: d <= -20 ? "bad" : d < 0 ? "warn" : "info",
        });
      }
      const ph = pe.payroll.hoursPaid, ch = e.payroll.hoursPaid;
      if (ph > 0 && Math.abs((ch - ph) / ph) >= 0.08) {
        s.push({
          kind: `Hours delivered — ${e.name}`,
          detail: `Hours paid moved from ${ph.toLocaleString()} to ${ch.toLocaleString()} ` +
                  `(${r1(((ch - ph) / ph) * 100)}%). Hours are the volume driver — a drop here is ` +
                  `operational, not a timing issue.`,
          severity: ch < ph ? "bad" : "info",
        });
      }
    }
  }

  for (const e of cur.entities) {
    if (e.revenue <= 0) continue;
    if (e.laborPct > laborHi) {
      s.push({
        kind: `Labor ratio above band — ${e.name}`,
        detail: `${e.name} labor ratio is ${e.laborPct}% against a ${laborLo}–${laborHi}% target — ` +
                `${r1(e.laborPct - laborHi)} points high, roughly ` +
                `$${r1((e.revenue * (e.laborPct - laborHi)) / 100)}K of margin this month.`,
        severity: "bad",
      });
    }
  }

  if (cur.otPremium > 0) {
    const share = cur.totalPayroll > 0 ? (cur.otPremium / cur.totalPayroll) * 100 : 0;
    s.push({
      kind: "Overtime premium",
      detail: `$${cur.otPremium}K of overtime premium, ${r1(share)}% of total payroll.`,
      severity: share > 4 ? "warn" : "info",
    });
  }

  const past90 = cur.ar.reduce((a, b) => a + b.b90p, 0);
  if (past90 > 0) {
    const worst = [...cur.ar].sort((a, b) => b.b90p - a.b90p)[0];
    s.push({
      kind: "Aged receivables",
      detail: `$${r1(past90)}K sits past 90 days; the largest bucket is ${worst.payer} at $${r1(worst.b90p)}K. ` +
              `Past-90 balances carry timely-filing risk.`,
      severity: past90 > cur.arTotal * 0.08 ? "bad" : "warn",
    });
  }

  const arMonths = cur.revenue > 0 ? cur.arTotal / cur.revenue : 0;
  if (arMonths > 1.0) {
    s.push({
      kind: "AR to revenue",
      detail: `AR of $${cur.arTotal}K is ${r1(arMonths)}× one month of revenue — collections are lagging billing.`,
      severity: arMonths > 1.4 ? "bad" : "warn",
    });
  }

  if (cur.cash.total > 0 && cur.revenue > 0) {
    const monthsCover = cur.cash.total / (cur.directCost + cur.opex);
    if (monthsCover < 1) {
      s.push({
        kind: "Cash coverage",
        detail: `Cash of $${cur.cash.total}K covers ${r1(monthsCover)} months of operating cost.`,
        severity: monthsCover < 0.6 ? "bad" : "warn",
      });
    }
  }

  for (const e of cur.entities) {
    if (e.netIncome < 0 && e.status === "ACTIVE") {
      s.push({
        kind: `Loss-making entity — ${e.name}`,
        detail: `${e.name} lost $${Math.abs(e.netIncome)}K this month on $${e.revenue}K of revenue.`,
        severity: "bad",
      });
    }
  }

  return s;
}

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
/* ------------------------------------------------------------------ */

function buildPrompt(opts: {
  clientName: string; cur: PeriodMetrics; prev: PeriodMetrics | null;
  history: PeriodMetrics[]; goals: any[]; signals: Signal[]; priorNotes: any[];
}) {
  const { clientName, cur, prev, history, goals, signals, priorNotes } = opts;

  const trend = history.slice(-6).map((p) =>
    `${p.label}: revenue $${p.revenue}K, net $${p.netIncome}K, labor ${p.laborPct}%, ` +
    `hours ${p.entities.reduce((s, e) => s + e.payroll.hoursPaid, 0).toLocaleString()}`).join("\n");

  const entityLines = cur.entities.map((e) =>
    `- ${e.name} (${e.status}): revenue $${e.revenue}K, direct labor $${e.directCost}K ` +
    `(${e.laborPct}%), overhead $${e.opex}K, net $${e.netIncome}K, ` +
    `hours ${e.payroll.hoursPaid.toLocaleString()}, OT premium $${e.payroll.otPremium}K`).join("\n");

  const arLines = cur.ar.map((a) =>
    `- ${a.payer}: current–30 $${a.b0_30}K, 31–60 $${a.b31_60}K, 61–90 $${a.b61_90}K, 90+ $${a.b90p}K`).join("\n");

  const goalLines = goals.length
    ? goals.map((g) => `- ${g.title} — target ${g.target}, currently ${g.current || "unknown"}`).join("\n")
    : "- (no standing goals recorded)";

  const signalLines = signals.length
    ? signals.map((s) => `- [${s.severity}] ${s.kind}: ${s.detail}`).join("\n")
    : "- (no threshold signals fired; the month looks routine)";

  const priorLines = priorNotes.length
    ? priorNotes.map((n) => `- ${n.heading}: ${n.body}`).join("\n")
    : "- (no prior commentary)";

  return `You are drafting the monthly commentary for ${clientName}, prepared by Hathorn Advisory Group for the owner of the business. The advisor will edit and approve whatever you write — you are producing a first draft, not the final word.

PERIOD: ${cur.label}

CONSOLIDATED
Revenue $${cur.revenue}K · direct labor $${cur.directCost}K (${cur.laborPct}%) · gross profit $${cur.grossProfit}K (${cur.grossMarginPct}%) · overhead $${cur.opex}K · net income $${cur.netIncome}K (${cur.netMarginPct}%)
Total payroll $${cur.totalPayroll}K · overtime premium $${cur.otPremium}K
Cash $${cur.cash.total}K ($${cur.cash.operating}K operating, $${cur.cash.reserve}K reserve)
Accounts receivable $${cur.arTotal}K

BY ENTITY
${entityLines}

AR AGING
${arLines}

RECENT TREND
${trend}

THE OWNER'S STANDING GOALS
${goalLines}

SIGNALS DETECTED (computed from thresholds — treat as leads to explain, not as finished sentences)
${signalLines}

LAST MONTH'S COMMENTARY (do not repeat it; note if something has continued or resolved)
${priorLines}

HOW TO WRITE THIS

Write two kinds of note:
- WHAT_CHANGED — what moved this month and why. Three notes at most.
- ACTION — what the owner should do before next month. Three notes at most.

Every note must contain a number, a cause, and where relevant an action. "Revenue was down" is useless. "Revenue fell $22K because two caregivers left and 692 hours went undelivered" is the job.

The single most valuable thing you can do is separate TIMING from OPERATIONAL. A billing lag and a lost-hours problem look identical on a revenue chart and mean opposite things: one reverses on its own next month, the other keeps costing money until someone acts. If the data supports that distinction, make it explicitly and quantify each side.

Where a number connects to one of the owner's standing goals, say so.

Do not invent facts. Only use figures given above. If a cause is genuinely uncertain, name the two most likely explanations and say what would distinguish them — that is more useful than false confidence.

Write plainly, the way a sharp CFO talks to an owner who is good at running their business but does not read financial statements for a living. No jargon, no hedging, no filler openers.

Tone values: "info" for neutral or good news, "warn" for something to watch, "bad" for something costing money now.

Return ONLY a JSON array. No preamble, no markdown fences. Each element:
{"slot":"WHAT_CHANGED"|"ACTION","tone":"info"|"warn"|"bad","heading":"under 60 characters","body":"2-3 sentences"}`;
}

/* ------------------------------------------------------------------ */
/* Fallback — used when no API key is configured                       */
/* ------------------------------------------------------------------ */

function fallbackNotes(signals: Signal[], cur: PeriodMetrics): DraftNote[] {
  const notes: DraftNote[] = [];
  const rank = { bad: 0, warn: 1, info: 2 } as const;
  const sorted = [...signals].sort((a, b) => rank[a.severity] - rank[b.severity]);

  for (const s of sorted.slice(0, 3)) {
    notes.push({ slot: "WHAT_CHANGED", tone: s.severity, heading: s.kind, body: s.detail });
  }
  if (!notes.length) {
    notes.push({
      slot: "WHAT_CHANGED", tone: "info", heading: "A routine month",
      body: `Revenue of $${cur.revenue}K and net income of $${cur.netIncome}K, with no threshold ` +
            `breaches. Labor ratio at ${cur.laborPct}%.`,
    });
  }
  for (const s of sorted.filter((x) => x.severity !== "info").slice(0, 3)) {
    notes.push({
      slot: "ACTION", tone: s.severity, heading: `Address: ${s.kind}`,
      body: `${s.detail} Confirm the cause and decide on a response before next month's meeting.`,
    });
  }
  return notes;
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export async function draftStory(periodId: string): Promise<{ notes: DraftNote[]; source: "claude" | "signals"; warning?: string }> {
  const d = db();
  const period: any = d.prepare("SELECT * FROM periods WHERE id=?").get(periodId);
  if (!period) throw new Error("Period not found");
  const client: any = d.prepare("SELECT * FROM clients WHERE id=?").get(period.client_id);

  const cur = computePeriod(periodId);
  const history = clientHistory(period.client_id, false).filter(
    (p) => p.year < cur.year || (p.year === cur.year && p.month <= cur.month));
  const idx = history.findIndex((p) => p.periodId === periodId);
  const prev = idx > 0 ? history[idx - 1] : null;

  const goals: any[] = d.prepare("SELECT * FROM goals WHERE client_id=? AND active=1").all(period.client_id);
  const priorNotes: any[] = prev
    ? d.prepare("SELECT heading, body FROM story_notes WHERE period_id=? AND slot='WHAT_CHANGED'").all(prev.periodId)
    : [];

  const signals = detectSignals(cur, prev, client.target_labor_lo, client.target_labor_hi);

  if (!config.anthropic.enabled) {
    return {
      notes: fallbackNotes(signals, cur),
      source: "signals",
      warning: "Drafted from threshold signals. Set ANTHROPIC_API_KEY for full narrative drafting.",
    };
  }

  const prompt = buildPrompt({
    clientName: client.name, cur, prev, history, goals, signals, priorNotes,
  });

  try {
    const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.anthropic.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.anthropic.model,
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    }, 45_000);

    if (!res.ok) throw new Error(`Anthropic API returned ${res.status}`);
    const data = await res.json();
    const text = (data.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
    const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start === -1 || end === -1) throw new Error("Model did not return a JSON array");

    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    const notes: DraftNote[] = parsed
      .filter((n: any) => n?.heading && n?.body)
      .map((n: any) => ({
        slot: n.slot === "ACTION" ? "ACTION" : "WHAT_CHANGED",
        tone: ["info", "warn", "bad"].includes(n.tone) ? n.tone : "info",
        heading: String(n.heading).slice(0, 90),
        body: String(n.body).slice(0, 600),
      }))
      .slice(0, 8);

    if (!notes.length) throw new Error("Model returned no usable notes");
    return { notes, source: "claude" };
  } catch (e: any) {
    return {
      notes: fallbackNotes(signals, cur),
      source: "signals",
      warning: `Story agent unavailable (${e.message}). Drafted from threshold signals instead.`,
    };
  }
}
