/**
 * Environment configuration with fail-fast validation.
 *
 * The rule: in development, sensible defaults keep you moving. In production,
 * a missing secret is a hard stop — never a silent fallback to a known value.
 */

const isProd = process.env.NODE_ENV === "production";

/**
 * Reads a secret, warning loudly in production if it's missing.
 *
 * Deliberately does NOT throw at import time: `next build` runs with
 * NODE_ENV=production and no runtime env, so throwing here would break the build.
 * Enforcement happens in assertProductionReady(), called from the request path.
 */
function required(name: string, devFallback: string): string {
  const v = process.env[name];
  if (v) return v;
  if (isProd && !isBuildPhase) {
    console.error(
      `\n[config] ${name} is not set. Running with a publicly known default is unsafe. ` +
      `Generate one with: openssl rand -base64 48\n`,
    );
  }
  return devFallback;
}

/** True while `next build` is collecting page data — no runtime secrets expected yet. */
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

/**
 * Hard stop for misconfigured production deploys. Called from the root layout so
 * a bad deploy fails visibly on first request instead of silently signing sessions
 * with a secret that is published in this repository.
 */
export function assertProductionReady() {
  if (!isProd || isBuildPhase) return;
  const problems: string[] = [];
  if (!process.env.AUTH_SECRET) {
    problems.push("AUTH_SECRET is not set — sessions would be signed with a public default.");
  }
  if (!process.env.NEXT_PUBLIC_BASE_URL) {
    problems.push("NEXT_PUBLIC_BASE_URL is not set — email links and OAuth redirects will point at localhost.");
  }
  if (problems.length) {
    throw new Error(`Refusing to serve with an unsafe configuration:\n  - ${problems.join("\n  - ")}`);
  }
}

export const config = {
  isProd,

  /** JWT signing secret. Rotating this invalidates every session. */
  authSecret: required("AUTH_SECRET", "dev-secret-change-in-production-9f2a"),

  /** Public base URL — used in emails and OAuth redirects. */
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000",

  /** Session lifetime in seconds. */
  sessionTtl: 8 * 3600,

  /** Minimum password length enforced on create and reset. */
  minPasswordLength: 10,

  /** Login throttle: max failed attempts per email inside the window. */
  loginMaxAttempts: 8,
  loginWindowMinutes: 15,

  email: {
    apiKey: process.env.RESEND_API_KEY || "",
    from: process.env.RESEND_FROM || "Hathorn Advisory <noreply@hathornadvisorygroup.com>",
    get enabled() { return Boolean(this.apiKey); },
  },

  qbo: {
    clientId: process.env.QBO_CLIENT_ID || "",
    clientSecret: process.env.QBO_CLIENT_SECRET || "",
    /** "sandbox" hits QuickBooks' test company; "production" hits real books. */
    environment: (process.env.QBO_ENVIRONMENT || "sandbox") as "sandbox" | "production",
    get redirectUri() { return `${config.baseUrl}/api/qbo/callback`; },
    get enabled() { return Boolean(this.clientId && this.clientSecret); },
    get apiBase() {
      return this.environment === "production"
        ? "https://quickbooks.api.intuit.com"
        : "https://sandbox-quickbooks.api.intuit.com";
    },
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    get enabled() { return Boolean(this.apiKey); },
  },
};

/** Human-readable startup report — surfaced on the admin page so nothing is a mystery. */
export function integrationStatus() {
  return [
    { name: "Email (Resend)", enabled: config.email.enabled,
      hint: "Set RESEND_API_KEY to notify clients when a period publishes." },
    { name: "QuickBooks Online", enabled: config.qbo.enabled,
      hint: "Set QBO_CLIENT_ID and QBO_CLIENT_SECRET to pull P&L and AR automatically." },
    { name: "Story agent (Claude)", enabled: config.anthropic.enabled,
      hint: "Set ANTHROPIC_API_KEY to draft commentary from the numbers." },
  ];
}
