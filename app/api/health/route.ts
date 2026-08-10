import { NextResponse } from "next/server";
import { config, DEFAULT_AUTH_SECRET } from "@/lib/config";
import { backupStatus } from "@/lib/backup";
import { readiness, DEGRADATION_MATRIX } from "@/lib/ops/health";
import { schemaVersion, MIGRATIONS } from "@/lib/migrations";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Combined health for ops dashboards. Deliberately unauthenticated but leaks nothing:
 * no client names, no counts that reveal book size, no secrets.
 */
export async function GET() {
  try {
    const ready = readiness();
    const d = db();
    const version = schemaVersion(d);
    const expected = Math.max(...MIGRATIONS.map((m) => m.id));
    const secret = process.env.AUTH_SECRET || "";
    const authOk = Boolean(secret) && secret !== DEFAULT_AUTH_SECRET && secret.length >= 32;
    const backups = backupStatus();

    return NextResponse.json({
      status: ready.status,
      schema: { applied: version, expected },
      auth: { configured: authOk, staffMfaRequired: config.requireStaffMfa },
      integrations: {
        email: config.email.enabled,
        quickbooks: config.qbo.enabled,
        ai: config.anthropic.enabled,
        storyAgent: config.anthropic.enabled,
        copilot: config.ai.enabled && config.ai.copilotEnabled,
        documentWorker: config.documentIntelligence.enabled,
      },
      backups: {
        count: backups.count,
        ageHours: backups.ageHours,
        healthy: backups.healthy,
        dirConfigured: Boolean(process.env.BACKUP_DIR),
      },
      appEnv: ready.appEnv,
      appVersion: ready.appVersion,
      gitCommit: ready.gitCommit,
      dependencies: ready.dependencies,
      degradation: DEGRADATION_MATRIX,
      time: new Date().toISOString(),
    }, { status: ready.ready ? 200 : 503 });
  } catch {
    return NextResponse.json({ status: "error", detail: "database unavailable" }, { status: 503 });
  }
}
