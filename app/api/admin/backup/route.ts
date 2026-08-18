import { NextResponse } from "next/server";
import { requireRole, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";
import { createBackup, listBackups, pruneBackups, restoreBackup, backupStatus, verifyBackup } from "@/lib/backup";

function fail(e: any) {
  if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
}

export async function GET() {
  try {
    await requireRole("ADMIN");
    return NextResponse.json({
      status: backupStatus(),
      backups: listBackups().slice(0, 30).map((b) => ({
        name: b.name, sizeBytes: b.sizeBytes, createdAt: b.createdAt,
      })),
    });
  } catch (e: any) { return fail(e); }
}

export async function POST(req: Request) {
  try {
    const s = await requireRole("ADMIN");
    const body: Record<string, any> = await jsonObject(req).catch(() => ({}));
    const action = String(body.action || "create");

    if (action === "create") {
      const b = await createBackup("manual");
      pruneBackups();
      audit(s.userId, "BACKUP_CREATE", b.name);
      return NextResponse.json({ ok: true, backup: { name: b.name, sizeBytes: b.sizeBytes, note: b.note } });
    }

    if (action === "verify") {
      const all = listBackups();
      const target = all.find((b) => b.name === String(body.name));
      if (!target) throw new ValidationError("No backup by that name.");
      return NextResponse.json({ ok: true, result: verifyBackup(target.path) });
    }

    if (action === "restore") {
      // Restoring replaces the entire book. It is deliberately explicit rather than a
      // one-click action, and it snapshots the current state before overwriting.
      if (body.confirm !== "RESTORE") {
        throw new ValidationError('Restoring replaces every client\'s data. Send confirm: "RESTORE" to proceed.');
      }
      const result = restoreBackup(String(body.name));
      audit(s.userId, "BACKUP_RESTORE", `${result.restored} (safety ${result.safetyCopy})`);
      return NextResponse.json({ ok: true, ...result });
    }

    throw new ValidationError("Unknown action.");
  } catch (e: any) { return fail(e); }
}
