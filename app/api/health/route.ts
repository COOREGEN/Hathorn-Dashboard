import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { schemaVersion, MIGRATIONS } from "@/lib/migrations";
import { config } from "@/lib/config";
import { backupStatus } from "@/lib/backup";

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

    return NextResponse.json({
      status: version === expected ? "ok" : "degraded",
      schema: { applied: version, expected },
      integrations: {
        email: config.email.enabled,
        quickbooks: config.qbo.enabled,
        storyAgent: config.anthropic.enabled,
      },
      // Counts and ages only — no client names, no book size.
      backups: (() => {
        const b = backupStatus();
        return { count: b.count, ageHours: b.ageHours, healthy: b.healthy };
      })(),
      time: new Date().toISOString(),
    }, { status: version === expected ? 200 : 503 });
  } catch (e: any) {
    return NextResponse.json({ status: "error", detail: "database unavailable" }, { status: 503 });
  }
}
