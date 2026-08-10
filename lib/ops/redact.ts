/**
 * Log / error redaction — never ship secrets, tokens, or bank details in structured logs.
 */

const SENSITIVE_KEY =
  /pass(word)?|secret|token|authorization|cookie|api[_-]?key|refresh|ssn|account[_-]?number|routing|encryption|bearer|private[_-]?key/i;

const REDACTED = "[REDACTED]";

export function redactValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY.test(key)) return REDACTED;
  if (typeof value === "string") {
    if (/^enc:v\d+:/.test(value)) return REDACTED;
    if (/Bearer\s+\S+/i.test(value)) return value.replace(/Bearer\s+\S+/gi, `Bearer ${REDACTED}`);
    if (value.length > 500 && /eyJ[A-Za-z0-9_-]+\./.test(value)) return REDACTED;
  }
  return value;
}

export function redactObject(input: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!input) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = redactObject(v as Record<string, unknown>);
    } else if (Array.isArray(v)) {
      out[k] = v.map((item, i) =>
        item && typeof item === "object"
          ? redactObject(item as Record<string, unknown>)
          : redactValue(String(i), item),
      );
    } else {
      out[k] = redactValue(k, v);
    }
  }
  return out;
}

/** Support reference shown to users — maps to correlation without encoding secrets. */
export function supportReference(correlationId: string): string {
  const clean = String(correlationId || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12).toUpperCase();
  return clean || "UNKNOWN";
}
