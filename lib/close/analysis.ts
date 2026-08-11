/**
 * AI close summary — explains deterministic state only.
 * Never calculates readiness, never resolves exceptions.
 */

import { config } from "../config";
import { fetchWithTimeout } from "../security";
import type { CloseChecklistItem, CloseRun } from "./types";

export type CloseAiSummary = {
  overallStatus: string;
  majorChanges: string[];
  outstandingExceptions: string[];
  managementConsiderations: string[];
  reviewerAttention: string[];
  requiresProfessionalReview: true;
  source: "signals" | "claude";
  model: string;
};

export function draftCloseSummary(opts: {
  run: CloseRun;
  items: CloseChecklistItem[];
  whyNotClosed: string[];
  clientName: string;
}): CloseAiSummary {
  const fail = opts.items.filter((i) => ["FAIL", "STALE", "NEEDS_REVIEW"].includes(i.status));
  return {
    overallStatus: `${opts.clientName} close is ${opts.run.status.replace(/_/g, " ")} (${opts.run.summary.progressPct}% of required checks).`,
    majorChanges: fail.slice(0, 5).map((i) => `${i.title}: ${i.status}`),
    outstandingExceptions: opts.whyNotClosed.slice(0, 8),
    managementConsiderations: [
      "Close automation flags evidence and routing only — professional judgment remains with staff.",
      "Publishing still requires the existing Hathorn release evaluate / approve path.",
    ],
    reviewerAttention: opts.run.summary.blockers.map((b) => b.title),
    requiresProfessionalReview: true,
    source: "signals",
    model: "deterministic",
  };
}

export async function generateCloseSummary(opts: {
  run: CloseRun;
  items: CloseChecklistItem[];
  whyNotClosed: string[];
  clientName: string;
}): Promise<CloseAiSummary> {
  const draft = draftCloseSummary(opts);
  if (!config.anthropic.enabled) return draft;

  const prompt = `You are assisting a CPA firm month-end close. Use ONLY the structured facts below. Do not invent numbers or claim the close is complete if blockers exist. Do not resolve or waive anything.

Client: ${opts.clientName}
Status: ${opts.run.status}
Progress: ${opts.run.summary.progressPct}%
Why not closed: ${JSON.stringify(opts.whyNotClosed)}
Blockers: ${JSON.stringify(opts.run.summary.blockers)}
Failing/review items: ${JSON.stringify(failingItems(opts.items))}

Return JSON with keys: overallStatus (string), majorChanges (string[]), outstandingExceptions (string[]), managementConsiderations (string[]), reviewerAttention (string[]).`;

  try {
    const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.anthropic.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.anthropic.model,
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    }, 20_000);
    if (!res.ok) return draft;
    const data = await res.json() as any;
    const text = data?.content?.[0]?.text || "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return draft;
    const parsed = JSON.parse(m[0]);
    return {
      overallStatus: String(parsed.overallStatus || draft.overallStatus),
      majorChanges: arr(parsed.majorChanges, draft.majorChanges),
      outstandingExceptions: arr(parsed.outstandingExceptions, draft.outstandingExceptions),
      managementConsiderations: arr(parsed.managementConsiderations, draft.managementConsiderations),
      reviewerAttention: arr(parsed.reviewerAttention, draft.reviewerAttention),
      requiresProfessionalReview: true,
      source: "claude",
      model: config.anthropic.model,
    };
  } catch {
    return draft;
  }
}

function failingItems(items: CloseChecklistItem[]) {
  return items
    .filter((i) => ["FAIL", "STALE", "NEEDS_REVIEW", "PENDING"].includes(i.status))
    .map((i) => ({ key: i.checkKey, title: i.title, status: i.status, blocking: i.blocking }));
}

function arr(v: unknown, fallback: string[]): string[] {
  return Array.isArray(v) ? v.map(String).slice(0, 12) : fallback;
}
