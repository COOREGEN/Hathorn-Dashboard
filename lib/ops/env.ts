/**
 * Explicit deployment environments — never infer production safety from NODE_ENV alone.
 *
 * LOCAL / TEST allow seed and soft defaults.
 * STAGING mirrors production guards but may use sandbox providers.
 * PRODUCTION refuses demo seed, localhost URLs, and published secrets.
 */

export type AppEnv = "LOCAL" | "TEST" | "STAGING" | "PRODUCTION";

export function resolveAppEnv(): AppEnv {
  const raw = (process.env.APP_ENV || "").toUpperCase().trim();
  if (raw === "LOCAL" || raw === "TEST" || raw === "STAGING" || raw === "PRODUCTION") {
    return raw;
  }
  // Closest practical equivalent when APP_ENV is unset.
  if (process.env.NODE_ENV === "production") return "PRODUCTION";
  if (process.env.NODE_ENV === "test") return "TEST";
  return "LOCAL";
}

export function isProductionLike(env: AppEnv = resolveAppEnv()): boolean {
  return env === "PRODUCTION" || env === "STAGING";
}

export function allowDemoSeed(env: AppEnv = resolveAppEnv()): boolean {
  if (process.env.ALLOW_DEMO_SEED === "1") {
    // Explicit escape hatch — still refused on PRODUCTION unless also LEDGER_ALLOW_LOCAL_PROD.
    if (env === "PRODUCTION" && process.env.LEDGER_ALLOW_LOCAL_PROD !== "1") return false;
    return true;
  }
  return env === "LOCAL" || env === "TEST";
}

export function appVersionInfo() {
  return {
    appVersion: process.env.APP_VERSION || process.env.npm_package_version || "0.1.0",
    gitCommit: (process.env.GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 12) || null,
    deploymentId: process.env.DEPLOYMENT_ID || process.env.VERCEL_DEPLOYMENT_ID || null,
    appEnv: resolveAppEnv(),
  };
}
