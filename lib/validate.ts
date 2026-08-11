/**
 * Input validation at the write boundary.
 *
 * Sanitising on read is not enough: garbage that persists will eventually be read by
 * something that forgets to sanitise — an export, a report, a future component. Reject
 * it on the way in.
 */

export class ValidationError extends Error {
  constructor(message: string) { super(message); }
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function hexColour(value: unknown, field: string): string {
  const v = String(value ?? "").trim();
  if (!HEX.test(v)) {
    throw new ValidationError(`${field} must be a hex colour such as #2C504D.`);
  }
  return v;
}

export function period(year: unknown, month: unknown): { year: number; month: number } {
  const y = Number(year), m = Number(month);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) {
    throw new ValidationError("Year must be a whole number between 2000 and 2100.");
  }
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    throw new ValidationError("Month must be a whole number from 1 to 12.");
  }
  return { year: y, month: m };
}

export function text(value: unknown, field: string, max: number, required = true): string {
  const v = String(value ?? "").trim();
  if (required && !v) throw new ValidationError(`${field} is required.`);
  return v.slice(0, max);
}

/** Requires a JSON object body — not null, not an array, not a scalar. */
export async function jsonObject(req: Request): Promise<Record<string, any>> {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    throw new ValidationError("Request body is not valid JSON.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ValidationError("Request body must be a JSON object.");
  }
  return parsed as Record<string, any>;
}

/**
 * A value that starts with =, +, - or @ is interpreted as a formula by Excel and
 * Google Sheets. Nothing in this app executes it, but anything that might one day be
 * exported to a spreadsheet goes through here first.
 */
export function spreadsheetSafe(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Turns a name into a URL slug, appending a counter until it is unique. */
export function uniqueSlug(base: string, exists: (slug: string) => boolean): string {
  const root = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client";
  if (!exists(root)) return root;
  for (let i = 2; i < 200; i++) {
    const candidate = `${root}-${i}`;
    if (!exists(candidate)) return candidate;
  }
  throw new ValidationError("Could not derive a unique URL for that name. Try a different one.");
}
