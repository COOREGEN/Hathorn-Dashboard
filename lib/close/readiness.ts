import type { ChecklistItemStatus, CloseChecklistItem, CloseReadiness, CloseRunStatus, CloseSummary } from "./types";

const COMPLETE: ChecklistItemStatus[] = ["PASS", "WAIVED", "NOT_APPLICABLE"];
/** NEEDS_REVIEW / STALE count as incomplete until human acts. */

export function buildSummary(items: CloseChecklistItem[], openExceptions: number, blockingExceptions: number): CloseSummary {
  const required = items.filter((i) => i.required && i.status !== "NOT_APPLICABLE");
  const requiredComplete = required.filter((i) => COMPLETE.includes(i.status) || (i.status === "PASS")).length;
  // WAIVED is complete for progress but never shown as PASS
  const done = required.filter((i) => COMPLETE.includes(i.status)).length;
  const progressPct = required.length ? Math.round((done / required.length) * 100) : 0;

  const byCategory: Record<string, { total: number; complete: number }> = {};
  for (const i of items) {
    if (i.status === "NOT_APPLICABLE" && !i.required) continue;
    const cat = i.category;
    if (!byCategory[cat]) byCategory[cat] = { total: 0, complete: 0 };
    if (i.status === "NOT_APPLICABLE") continue;
    byCategory[cat].total += 1;
    if (COMPLETE.includes(i.status)) byCategory[cat].complete += 1;
  }

  const blockers = items
    .filter((i) => i.blocking && i.required && !COMPLETE.includes(i.status) && i.status !== "NOT_APPLICABLE")
    .map((i) => ({
      checkKey: i.checkKey,
      title: i.title,
      detail: String((i.evidence as any)?.detail || i.note || i.status),
    }));

  const whyNotClosed: string[] = [];
  for (const b of blockers) whyNotClosed.push(`${b.title}: ${b.detail}`);
  if (blockingExceptions > 0) {
    whyNotClosed.push(`${blockingExceptions} blocking exception(s) still open.`);
  }

  return {
    requiredTotal: required.length,
    requiredComplete: done,
    progressPct,
    byCategory,
    openExceptions,
    blockingExceptions,
    blockers,
    whyNotClosed,
  };
}

export function evaluateCloseReadiness(opts: {
  items: CloseChecklistItem[];
  openBlockingExceptions: number;
  periodPublished: boolean;
  releaseId: string | null;
  wasReopened: boolean;
}): CloseReadiness {
  if (opts.periodPublished && opts.releaseId && !opts.wasReopened) {
    return {
      status: "CLOSED",
      canMarkReadyForReview: false,
      canFeedPublish: false,
      blockers: [],
      whyNotClosed: [],
    };
  }

  const summary = buildSummary(opts.items, 0, opts.openBlockingExceptions);
  const blockers = summary.blockers;
  if (opts.openBlockingExceptions > 0) {
    blockers.push({
      checkKey: "exceptions",
      title: "Blocking exceptions open",
      detail: `${opts.openBlockingExceptions} blocking exception(s)`,
    });
  }

  const why = [...summary.whyNotClosed];
  if (opts.openBlockingExceptions > 0) {
    why.push(`${opts.openBlockingExceptions} blocking exception(s) open.`);
  }

  if (blockers.length) {
    return {
      status: "BLOCKED",
      canMarkReadyForReview: false,
      canFeedPublish: false,
      blockers,
      whyNotClosed: why,
    };
  }

  // All required automated/manual complete — check publish evaluate specifically
  const publishClear = opts.items.find((i) => i.checkKey === "publish_evaluate_clear");
  const commentary = opts.items.find((i) => i.checkKey === "commentary_present");
  const readyToPublish = publishClear?.status === "PASS" && commentary?.status === "PASS";

  if (readyToPublish) {
    return {
      status: "READY_TO_PUBLISH",
      canMarkReadyForReview: true,
      canFeedPublish: true,
      blockers: [],
      whyNotClosed: [],
    };
  }

  const pendingManual = opts.items.some(
    (i) => i.kind === "MANUAL" && i.required && !COMPLETE.includes(i.status),
  );
  const needsReview = opts.items.some((i) => i.status === "NEEDS_REVIEW" || i.status === "STALE");

  if (!pendingManual && !needsReview && summary.progressPct === 100) {
    return {
      status: "READY_FOR_REVIEW",
      canMarkReadyForReview: true,
      canFeedPublish: false,
      blockers: [],
      whyNotClosed: why.length ? why : ["Release evaluate or commentary still incomplete."],
    };
  }

  return {
    status: opts.wasReopened ? "REOPENED" : "IN_PROGRESS",
    canMarkReadyForReview: false,
    canFeedPublish: false,
    blockers: [],
    whyNotClosed: why,
  };
}

export function statusRank(s: CloseRunStatus): number {
  const order: CloseRunStatus[] = [
    "NOT_STARTED", "REOPENED", "IN_PROGRESS", "BLOCKED",
    "READY_FOR_REVIEW", "READY_TO_PUBLISH", "CLOSED",
  ];
  return order.indexOf(s);
}
