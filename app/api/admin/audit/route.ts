import { NextResponse } from "next/server";
import { AuthError, requireRole } from "@/lib/auth";
import { auditActionCatalog, queryAuditTrail } from "@/lib/audit-trail";

export const dynamic = "force-dynamic";

/**
 * Firm activity monitor — who touched what on this firm's book.
 * ADMIN only. Does not expose other firms' rows.
 * Does not log its own reads (would flood the trail on every filter refresh).
 */
export async function GET(req: Request) {
  try {
    const s = await requireRole("ADMIN");
    if (!s.firmId) {
      return NextResponse.json({ ok: false, error: "No active firm." }, { status: 400 });
    }
    const url = new URL(req.url);
    const clientId = url.searchParams.get("clientId");
    const userId = url.searchParams.get("userId");
    const action = url.searchParams.get("action");
    const resourceType = url.searchParams.get("resourceType");
    const resourceId = url.searchParams.get("resourceId");
    const q = url.searchParams.get("q");
    const limit = Number(url.searchParams.get("limit") || 75);

    const events = queryAuditTrail({
      firmId: s.firmId,
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
      actions: auditActionCatalog(s.firmId),
    });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
