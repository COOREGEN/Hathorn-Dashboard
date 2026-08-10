import { NextResponse } from "next/server";
import { requireRole, requireClientAccess, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";
import { syncPeriod, getConnection, disconnect, applySyncToPeriod } from "@/lib/qbo";
import { rateLimit, RateLimited, LIMITS, UpstreamTimeout } from "@/lib/security";
import { recordCompletedQboSync, syncQboHubProjection } from "@/lib/integrations/model";

/**
 * Pulls P&L and AR from QuickBooks into a period, leaving payroll alone.
 * Runs the gate afterward so the bookkeeper immediately sees whether the
 * QuickBooks side ties to the payroll register they uploaded.
 *
 * Absolute rule: this route remains the Intuit pull. Hub history is recorded
 * via recordCompletedQboSync — no second provider call.
 */
export async function POST(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER");
    rateLimit({ action: "qboSync", subject: s.userId, ...LIMITS.qboSync });
    const { clientId, year, month } = await jsonObject(req);
    await requireClientAccess(String(clientId || ""));

    const result = await syncPeriod(clientId, year, month);
    const applied = applySyncToPeriod(clientId, year, month, result);

    audit(s.userId, "QBO_SYNC", `${clientId} ${year}-${month} lines=${result.plLines.length}`);
    const syncRunId = recordCompletedQboSync({
      clientId,
      triggeredBy: s.userId,
      plLines: result.plLines.length,
      arRows: result.arBuckets.length,
      periodId: applied.periodId,
      year: Number(year),
      month: Number(month),
      warnings: result.warnings,
    });

    return NextResponse.json({
      ok: true, periodId: applied.periodId,
      pulled: { plLines: result.plLines.length, arRows: result.arBuckets.length },
      warnings: result.warnings, gate: applied.gate,
      syncRunId,
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    if (e instanceof RateLimited) return NextResponse.json({ ok: false, error: e.message }, { status: 429 });
    if (e instanceof UpstreamTimeout) return NextResponse.json({ ok: false, error: e.message }, { status: 504 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

export async function GET(req: Request) {
  try {
    await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER");
    const clientId = new URL(req.url).searchParams.get("clientId") || "";
    if (clientId) await requireClientAccess(clientId);
    const c = getConnection(clientId);
    if (clientId) syncQboHubProjection(clientId);
    return NextResponse.json({
      connected: Boolean(c),
      realmId: c?.realm_id ?? null,
      lastSyncAt: c?.last_sync_at ?? null,
      lastSyncStatus: c?.last_sync_status ?? "",
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR");
    const { clientId } = await jsonObject(req);
    await requireClientAccess(String(clientId || ""));
    disconnect(clientId);
    syncQboHubProjection(clientId);
    audit(s.userId, "QBO_DISCONNECT", clientId);
    audit(s.userId, "INTEGRATION_DISCONNECTED", `quickbooks ${clientId}`);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
