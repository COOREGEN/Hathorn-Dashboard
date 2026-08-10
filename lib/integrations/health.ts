import { STALE_SYNC_HOURS, type ConnectionStatus, type HealthLabel } from "./types";

export function computeHealth(opts: {
  status: ConnectionStatus;
  lastSuccessfulSyncAt: string | null;
  lastErrorCode: string | null;
}): HealthLabel {
  if (opts.status === "DISCONNECTED") return "DISCONNECTED";
  if (opts.status === "RECONNECT_REQUIRED") return "RECONNECT_REQUIRED";
  if (opts.status === "ERROR") return "DEGRADED";
  if (opts.status === "DEGRADED") return "DEGRADED";
  if (opts.status === "SYNCING") return "HEALTHY";

  if (!opts.lastSuccessfulSyncAt) {
    // Connected but never synced successfully
    return opts.lastErrorCode ? "DEGRADED" : "STALE";
  }

  const last = Date.parse(opts.lastSuccessfulSyncAt.includes("T")
    ? opts.lastSuccessfulSyncAt
    : opts.lastSuccessfulSyncAt.replace(" ", "T") + "Z");
  if (!Number.isFinite(last)) return "STALE";
  const ageH = (Date.now() - last) / 3_600_000;
  if (ageH > STALE_SYNC_HOURS) return "STALE";
  if (opts.lastErrorCode) return "DEGRADED";
  return "HEALTHY";
}

export function classifyProviderError(message: string, status?: number): {
  errorClass: "TRANSIENT" | "AUTH" | "RATE_LIMIT" | "VALIDATION" | "PERMANENT" | "UNKNOWN";
  errorCode: string;
} {
  const m = (message || "").toLowerCase();
  if (status === 429 || /rate.?limit|too many/i.test(m)) {
    return { errorClass: "RATE_LIMIT", errorCode: "RATE_LIMIT" };
  }
  if (status === 401 || status === 403 || /unauthorized|revoked|invalid_grant|reconnect|expired.*refresh/i.test(m)) {
    return { errorClass: "AUTH", errorCode: "AUTH" };
  }
  if (status && status >= 500 || /timeout|econnreset|temporar|unavailable/i.test(m)) {
    return { errorClass: "TRANSIENT", errorCode: "TRANSIENT" };
  }
  if (/validation|invalid|malformed|missing/i.test(m)) {
    return { errorClass: "VALIDATION", errorCode: "VALIDATION" };
  }
  return { errorClass: "UNKNOWN", errorCode: "UNKNOWN" };
}

export function sanitizeErrorMessage(msg: string): string {
  return String(msg || "Integration error")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]")
    .replace(/refresh_token[=:][^\s&,]+/gi, "refresh_token=[redacted]")
    .replace(/access_token[=:][^\s&,]+/gi, "access_token=[redacted]")
    .slice(0, 280);
}
