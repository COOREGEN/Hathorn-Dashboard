import { NextResponse } from "next/server";
import { requireRole, requireClientAccess, AuthError } from "@/lib/auth";
import { buildAuthUrl } from "@/lib/qbo";
import { config } from "@/lib/config";

export async function GET(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR");
    if (!config.qbo.enabled) {
      return NextResponse.json(
        { ok: false, error: "QuickBooks isn't configured. Set QBO_CLIENT_ID and QBO_CLIENT_SECRET." },
        { status: 400 });
    }
    const clientId = new URL(req.url).searchParams.get("clientId");
    if (!clientId) return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });
    await requireClientAccess(clientId);
    return NextResponse.redirect(buildAuthUrl(clientId, s.userId));
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
