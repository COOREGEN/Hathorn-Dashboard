/**
 * Service health model — liveness vs readiness, core vs optional dependencies.
 *
 * AI / Docling / QBO / email outages must not mark the whole app dead when
 * released financials remain readable.
 */

import { db } from "../db";
import { schemaVersion, MIGRATIONS } from "../migrations";
import { config, DEFAULT_AUTH_SECRET } from "../config";
import { backupStatus } from "../backup";
import { resolveAppEnv, appVersionInfo, isProductionLike } from "./env";
import { jobCounts } from "./jobs";

export type DepStatus = "ok" | "degraded" | "down" | "disabled";

export type DependencyHealth = {
  name: string;
  tier: "CORE" | "OPTIONAL";
  status: DepStatus;
  detail?: string;
};

export function liveness(): { status: "ok"; time: string } {
  return { status: "ok", time: new Date().toISOString() };
}

export function dependencyHealth(): DependencyHealth[] {
  const deps: DependencyHealth[] = [];

  // Database — CORE
  try {
    db().prepare("SELECT 1").get();
    const version = schemaVersion(db());
    const expected = Math.max(...MIGRATIONS.map((m) => m.id));
    deps.push({
      name: "database",
      tier: "CORE",
      status: version === expected ? "ok" : "degraded",
      detail: version === expected
        ? `schema ${version}`
        : `schema ${version}/${expected}`,
    });
  } catch {
    deps.push({ name: "database", tier: "CORE", status: "down", detail: "unavailable" });
  }

  // Auth configuration — CORE in production-like envs
  const secret = process.env.AUTH_SECRET || "";
  const authOk = Boolean(secret) && secret !== DEFAULT_AUTH_SECRET && secret.length >= 32;
  deps.push({
    name: "auth",
    tier: "CORE",
    status: !isProductionLike() || authOk ? "ok" : "down",
    detail: authOk ? "configured" : "AUTH_SECRET missing or default",
  });

  // Backups — CORE signal in production (age), OPTIONAL elsewhere
  const backups = backupStatus();
  deps.push({
    name: "backups",
    tier: isProductionLike() ? "CORE" : "OPTIONAL",
    status: backups.healthy === false ? "degraded" : backups.count > 0 ? "ok" : "degraded",
    detail: `count=${backups.count} ageHours=${backups.ageHours ?? "n/a"}`,
  });

  // Object / document storage path
  try {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const dir = process.env.DOCUMENTS_DIR
      || path.join(process.env.DATA_DIR || path.join(process.cwd(), "data"), "documents");
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    deps.push({ name: "storage", tier: "CORE", status: "ok", detail: "writable" });
  } catch {
    deps.push({ name: "storage", tier: "CORE", status: "degraded", detail: "not writable" });
  }

  // Optional integrations — configured ≠ probed (no outbound calls from health)
  deps.push({
    name: "email",
    tier: "OPTIONAL",
    status: config.email.enabled ? "ok" : "disabled",
    detail: config.email.enabled ? "Resend configured" : "RESEND_API_KEY unset",
  });
  deps.push({
    name: "quickbooks",
    tier: "OPTIONAL",
    status: config.qbo.enabled ? "ok" : "disabled",
    detail: config.qbo.enabled
      ? `env=${config.qbo.environment}`
      : "QBO credentials unset",
  });
  deps.push({
    name: "ai",
    tier: "OPTIONAL",
    status: !config.ai.enabled
      ? "disabled"
      : config.anthropic.enabled
        ? "ok"
        : "disabled",
    detail: config.ai.enabled
      ? (config.anthropic.enabled ? "Anthropic configured" : "AI enabled but no API key")
      : "AI_PROVIDER_ENABLED=0",
  });
  deps.push({
    name: "document_worker",
    tier: "OPTIONAL",
    status: config.documentIntelligence.enabled ? "ok" : "disabled",
    detail: config.documentIntelligence.enabled
      ? "Docling/worker flag on"
      : "native CSV only",
  });

  // Jobs subsystem
  try {
    const counts = jobCounts();
    const failed = counts.FAILED || 0;
    const stuck = counts.STUCK || 0;
    deps.push({
      name: "jobs",
      tier: "OPTIONAL",
      status: stuck > 0 ? "degraded" : "ok",
      detail: `failed=${failed} stuck=${stuck} running=${counts.RUNNING}`,
    });
  } catch {
    deps.push({ name: "jobs", tier: "OPTIONAL", status: "degraded", detail: "unavailable" });
  }

  return deps;
}

export function readiness() {
  const deps = dependencyHealth();
  const coreDown = deps.some((d) => d.tier === "CORE" && d.status === "down");
  const coreDegraded = deps.some((d) => d.tier === "CORE" && d.status === "degraded");
  const status = coreDown ? "error" : coreDegraded ? "degraded" : "ok";
  const version = appVersionInfo();
  return {
    status,
    ready: status === "ok",
    ...version,
    dependencies: deps,
    time: new Date().toISOString(),
  };
}

/** Feature degradation matrix (documented + machine-readable). */
export const DEGRADATION_MATRIX = [
  {
    dependency: "ai",
    ifDown: "Financial data and releases still work. Copilot / story drafts unavailable.",
  },
  {
    dependency: "document_worker",
    ifDown: "Uploads still work. Parsing pending/unavailable until worker recovers.",
  },
  {
    dependency: "quickbooks",
    ifDown: "Historical and released data still work. New sync unavailable.",
  },
  {
    dependency: "email",
    ifDown: "App and publish still work. Notifications fail separately.",
  },
  {
    dependency: "jobs",
    ifDown: "Interactive paths still work. Background retries pause until tick resumes.",
  },
] as const;
