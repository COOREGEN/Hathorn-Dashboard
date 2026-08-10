/**
 * Environment configuration with fail-fast validation.
 *
 * The rule: in development, sensible defaults keep you moving. In production,
 * a missing or published secret is a hard stop — never a silent fallback.
 */

const isProd = process.env.NODE_ENV === "production";

/** Published in the repository. Never acceptable as a production signing key. */
export const DEFAULT_AUTH_SECRET = "dev-secret-change-in-production-9f2a";

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

function truthy(v: string | undefined, defaultWhenUnset: boolean): boolean {
  if (v === undefined || v === "") return defaultWhenUnset;
  return !["0", "false", "no", "off"].includes(v.toLowerCase());
}

/**
 * Hard stop for misconfigured production deploys. Called from the root layout so
 * a bad deploy fails visibly on first request instead of silently signing sessions
 * with a secret that is published in this repository.
 */
export function assertProductionReady() {
  if (!isProd || isBuildPhase) return;
  const problems: string[] = [];
  const secret = process.env.AUTH_SECRET || "";
  if (!secret) {
    problems.push("AUTH_SECRET is not set — sessions would be signed with a public default.");
  } else if (secret === DEFAULT_AUTH_SECRET) {
    problems.push("AUTH_SECRET is still the published development default. Generate a new one.");
  } else if (secret.length < 32) {
    problems.push("AUTH_SECRET is too short — use at least 32 characters (openssl rand -base64 48).");
  }
  // Staging/proof escape hatch only — never set on a real client-facing host.
  const allowLocal = process.env.LEDGER_ALLOW_LOCAL_PROD === "1";
  if (!process.env.NEXT_PUBLIC_BASE_URL) {
    problems.push("NEXT_PUBLIC_BASE_URL is not set — email links and OAuth redirects will point at localhost.");
  } else if (!allowLocal && /localhost|127\.0\.0\.1/.test(process.env.NEXT_PUBLIC_BASE_URL)) {
    problems.push("NEXT_PUBLIC_BASE_URL still points at localhost.");
  }
  if (!allowLocal && !process.env.BACKUP_DIR) {
    problems.push("BACKUP_DIR is not set — backups would land next to the live database on the same disk.");
  }
  if (problems.length) {
    throw new Error(`Refusing to serve with an unsafe configuration:\n  - ${problems.join("\n  - ")}`);
  }
}

export const config = {
  isProd,

  /** JWT signing secret. Rotating this invalidates every session. */
  authSecret: required("AUTH_SECRET", DEFAULT_AUTH_SECRET),

  /** Public base URL — used in emails and OAuth redirects. */
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000",

  /** Session lifetime in seconds. */
  sessionTtl: 8 * 3600,

  /** Minimum password length enforced on create and reset. */
  minPasswordLength: 10,

  /** Login throttle: max failed attempts per email inside the window. */
  loginMaxAttempts: 8,
  loginWindowMinutes: 15,

  /**
   * When true (default in production), staff must complete TOTP before a session
   * is issued. Clients are never required to enroll.
   */
  requireStaffMfa: truthy(process.env.REQUIRE_STAFF_MFA, isProd),

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

  /**
   * Optional Forge FP&A engine. Default off. Hathorn never requires Forge to boot.
   * Pilot is currently BLOCKED in this environment — see lib/fpa/forge-engine.ts.
   */
  forge: {
    enabled: !["0", "false", "no", "off", ""].includes(
      String(process.env.FORGE_ENABLED ?? "0").toLowerCase(),
    ),
    bin: process.env.FORGE_BIN || "forge",
  },

  /**
   * Document Intelligence worker (Docling / Python lite). Default off.
   * Native CSV parsing still works. App never requires Docling to boot.
   */
  documentIntelligence: {
    enabled: !["0", "false", "no", "off", ""].includes(
      String(process.env.DOCUMENT_INTELLIGENCE_ENABLED ?? "0").toLowerCase(),
    ),
    python: process.env.DOCLING_PYTHON || "python3",
  },
};

/** Human-readable startup report — surfaced on the admin page so nothing is a mystery. */
export function integrationStatus() {
  return [
    { name: "Email (Resend)", enabled: config.email.enabled,
      hint: "Set RESEND_API_KEY to notify clients when a period publishes and to deliver password resets." },
    { name: "QuickBooks Online", enabled: config.qbo.enabled,
      hint: "Set QBO_CLIENT_ID and QBO_CLIENT_SECRET to pull P&L and AR automatically." },
    { name: "Story agent (Claude)", enabled: config.anthropic.enabled,
      hint: "Set ANTHROPIC_API_KEY to draft commentary from the numbers." },
    { name: "Staff MFA", enabled: true,
      hint: config.requireStaffMfa
        ? "Required for ADMIN / ADVISOR / BOOKKEEPER before a session is issued."
        : "Optional (REQUIRE_STAFF_MFA is off). Enroll from Account security." },
    { name: "FP&A / Planning", enabled: true,
      hint: config.forge.enabled
        ? "FORGE_ENABLED=1 — Forge pilot; native engine remains the fallback."
        : "Native 12-month forecast engine (Forge pilot off by default)." },
    { name: "Document Intelligence", enabled: true,
      hint: config.documentIntelligence.enabled
        ? "Worker enabled for PDF/XLSX (Docling optional). Extractions are drafts — never auto-post."
        : "Uploads + native CSV parse available. Set DOCUMENT_INTELLIGENCE_ENABLED=1 for the Python worker." },
  ];
}
