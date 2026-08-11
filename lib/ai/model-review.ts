/**
 * Lightweight model-review helpers — structural checks already live on the run.
 * This module names the review questions an advisor should ask before trusting a forecast.
 */

import type { ModelRunRecord } from "../fpa/types";

export function reviewChecklist(run: ModelRunRecord): { ok: boolean; items: string[] } {
  const items: string[] = [];
  if (run.status !== "OK") items.push("Model status is FAILED — do not brief from this run.");
  if (run.engine === "forge") items.push("Engine is Forge — confirm the Forge pilot is intentional.");
  if (!run.sourceReleaseId) {
    items.push("No active release id on the source period — baseline may be working papers, not a frozen statement.");
  }
  if (run.assumptions.grossMarginPct > 80) {
    items.push("Gross margin assumption above 80% — unusual for most operating businesses; verify.");
  }
  const failed = run.checks.filter((c) => !c.pass);
  for (const c of failed) items.push(`Check failed: ${c.code} — ${c.detail}`);
  if (!items.length) items.push("Structural checks passed. Review assumption realism next.");
  return { ok: failed.length === 0 && run.status === "OK", items };
}
