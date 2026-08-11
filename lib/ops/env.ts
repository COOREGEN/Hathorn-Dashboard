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

/**
 * Demo/fixture seed is for LOCAL development and TEST/CI only.
 *
 * STAGING may reset a disposable book only with ALLOW_DEMO_SEED=1 (and should
 * target SQLite or an isolated demo DB — never a pilot book by accident).
 * PRODUCTION always refuses — LEDGER_ALLOW_LOCAL_PROD does not unlock seed.
 * That flag remains for local `NODE_ENV=production` cookie/URL relaxations only.
 */
export function allowDemoSeed(env: AppEnv = resolveAppEnv()): boolean {
  if (env === "PRODUCTION") return false;
  if (process.env.ALLOW_DEMO_SEED === "1") return true;
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
