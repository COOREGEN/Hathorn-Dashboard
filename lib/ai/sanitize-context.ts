/**
 * Server-side AI context sanitation — minimize RESTRICTED TAX / IDENTITY before
 * any model provider call. Does not invent legal consent; it only redacts patterns.
 *
 * Applied on every string destined for Anthropic (or any future provider).
 */
export type SanitizeReport = {
  text: string;
  redactions: number;
  categories: string[];
};

const RULES: { category: string; re: RegExp; replace: string }[] = [
  // SSN / ITIN shaped (including with dashes/spaces)
  { category: "SSN_ITIN", re: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, replace: "[REDACTED_SSN]" },
  // US bank routing (9 digits) near "routing" labels handled separately; bare 9-digit often EIN —
  // EIN: XX-XXXXXXX
  { category: "EIN", re: /\b\d{2}-\d{7}\b/g, replace: "[REDACTED_EIN]" },
  // Payment-card shaped groups (PCI guard — Hathorn must not process PAN data)
  {
    category: "PAYMENT_CARD",
    re: /\b(?:\d{4}[ -]){3}\d{1,4}\b/g,
    replace: "[REDACTED_CARD]",
  },
  // Labeled account / routing numbers in prose
  {
    category: "BANK_ACCOUNT",
    re: /\b(?:account|acct|routing|aba)(?:\s*(?:number|no\.?|#))?\s*[:#]?\s*\d{6,17}\b/gi,
    replace: "[REDACTED_BANK]",
  },
  // Bearer / API keys that might appear in tool dumps
  {
    category: "SECRET",
    re: /\b(?:sk-[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._\-]+|enc:v\d+:[A-Za-z0-9+/=]+)\b/gi,
    replace: "[REDACTED_SECRET]",
  },
];

/** Redact high-risk identity / credential patterns from AI-bound text. */
export function sanitizeAiContext(input: string, max = 14_000): SanitizeReport {
  let text = String(input || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  const categories = new Set<string>();
  let redactions = 0;
  for (const rule of RULES) {
    const before = text;
    text = text.replace(rule.re, () => {
      redactions += 1;
      categories.add(rule.category);
      return rule.replace;
    });
    if (text !== before && !categories.has(rule.category)) categories.add(rule.category);
  }
  text = text.replace(/\s+/g, " ").trim().slice(0, max);
  return { text, redactions, categories: Array.from(categories) };
}

/** Deep-sanitize JSON-serializable values before provider transmission. */
export function sanitizeAiPayload(value: unknown, max = 14_000): unknown {
  if (typeof value === "string") return sanitizeAiContext(value, max).text;
  if (Array.isArray(value)) return value.map((v) => sanitizeAiPayload(v, max));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Never send known secret-bearing keys
      if (/pass(word)?|secret|token|authorization|api[_-]?key|refresh|ssn|routing|account[_-]?number/i.test(k)) {
        out[k] = "[REDACTED]";
        continue;
      }
      out[k] = sanitizeAiPayload(v, max);
    }
    return out;
  }
  return value;
}
