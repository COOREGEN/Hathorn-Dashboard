import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { schemaVersion, MIGRATIONS } from "@/lib/migrations";
import { config, DEFAULT_AUTH_SECRET } from "@/lib/config";
import { backupStatus } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Liveness and readiness in one. Deliberately unauthenticated but leaks nothing:
 * no client names, no counts that reveal book size, no secrets — only whether this
 * instance can serve.
 */
export async function GET() {
  try {
    const d = db();
    d.prepare("SELECT 1").get();
    const version = schemaVersion(d);
    const expected = Math.max(...MIGRATIONS.map((m) => m.id));

    const secret = process.env.AUTH_SECRET || "";
    const authOk = Boolean(secret) && secret !== DEFAULT_AUTH_SECRET && secret.length >= 32;
    const backups = backupStatus();
    const schemaOk = version === expected;
    const ready = schemaOk && (!config.isProd || (authOk && backups.healthy !== false));

    return NextResponse.json({
      status: ready ? "ok" : "degraded",
      schema: { applied: version, expected },
      auth: { configured: authOk, staffMfaRequired: config.requireStaffMfa },
      integrations: {
        email: config.email.enabled,
        quickbooks: config.qbo.enabled,
        storyAgent: config.anthropic.enabled,
      },
      // Counts and ages only — no client names, no book size.
      backups: {
        count: backups.count,
        ageHours: backups.ageHours,
        healthy: backups.healthy,
        dirConfigured: Boolean(process.env.BACKUP_DIR),
      },
      time: new Date().toISOString(),
    }, { status: ready ? 200 : 503 });
  } catch {
    return NextResponse.json({ status: "error", detail: "database unavailable" }, { status: 503 });
  }
}
