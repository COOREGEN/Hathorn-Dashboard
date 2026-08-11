/**
 * Deterministic journal-entry validation — never trust an LLM "it balances".
 */

import type { ProposedJournalEntry, ProposedJournalLine } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;

export function validateProposedJournalEntry(
  lines: ProposedJournalLine[],
  description = "Proposed entry",
): ProposedJournalEntry {
  let totalDebits = 0;
  let totalCredits = 0;
  const cleaned: ProposedJournalLine[] = [];

  for (const line of lines || []) {
    const amount = Number(line.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Journal line amounts must be positive finite numbers.");
    }
    if (line.side !== "DR" && line.side !== "CR") {
      throw new Error("Journal line side must be DR or CR.");
    }
    if (!String(line.account || "").trim()) {
      throw new Error("Journal line requires an account.");
    }
    const amt = r2(amount);
    if (line.side === "DR") totalDebits += amt;
    else totalCredits += amt;
    cleaned.push({
      side: line.side,
      account: String(line.account).trim(),
      amount: amt,
      memo: line.memo ? String(line.memo) : undefined,
    });
  }

  totalDebits = r2(totalDebits);
  totalCredits = r2(totalCredits);
  const balanced = cleaned.length > 0 && totalDebits === totalCredits;

  return {
    description,
    lines: cleaned,
    balanced,
    totalDebits,
    totalCredits,
  };
}

export function assertBalanced(entry: ProposedJournalEntry) {
  if (!entry.balanced) {
    throw new Error(
      `Proposed journal entry does not balance (DR ${entry.totalDebits} ≠ CR ${entry.totalCredits}).`,
    );
  }
}
