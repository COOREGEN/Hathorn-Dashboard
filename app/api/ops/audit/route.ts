import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { requirePlatformAdmin } from "@/lib/tenancy";
import { auditActionCatalog, queryAuditTrail } from "@/lib/audit-trail";

export const dynamic = "force-dynamic";

/**
 * Platform activity monitor — cross-firm who-touched-what for support.
 * Metadata only; never returns ledger line amounts.
 * Does not log its own reads (would flood the trail on every filter refresh).
 */
export async function GET(req: Request) {
  try {
    await requirePlatformAdmin();
    const url = new URL(req.url);
    const firmId = url.searchParams.get("firmId");
    const clientId = url.searchParams.get("clientId");
    const userId = url.searchParams.get("userId");
    const action = url.searchParams.get("action");
    const resourceType = url.searchParams.get("resourceType");
    const resourceId = url.searchParams.get("resourceId");
    const q = url.searchParams.get("q");
    const limit = Number(url.searchParams.get("limit") || 100);

    const events = queryAuditTrail({
      firmId,
      clientId,
      userId,
      action,
      resourceType,
      resourceId,
      q,
      limit,
    });

    return NextResponse.json({
      ok: true,
      events,
      actions: auditActionCatalog(firmId),
    });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
