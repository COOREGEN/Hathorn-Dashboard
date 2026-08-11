/** Integer-cent helpers — avoid float false exceptions. */

export function dollarsToCents(dollars: number): number {
  if (!Number.isFinite(dollars)) throw new Error("Non-finite dollar amount.");
  return Math.round(dollars * 100);
}

/** Ledger stores amounts in $K. */
export function ledgerKToCents(amountK: number): number {
  if (!Number.isFinite(amountK)) throw new Error("Non-finite ledger amount.");
  return Math.round(amountK * 1000 * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function formatCents(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "—";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}$${whole.toLocaleString()}.${frac}`;
}

export function sumCents(values: number[]): number {
  return values.reduce((s, v) => s + v, 0);
}
