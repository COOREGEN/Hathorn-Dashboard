import { NextResponse } from "next/server";
import { revokePeriod } from "@/lib/release";
import { requireRole, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";

export async function POST(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR");
    const body = await jsonObject(req);
    const { periodId } = body;
    const reason = String(body.reason || "Withdrawn from the advisory book").trim();
    revokePeriod(periodId, s.userId, reason);
    audit(s.userId, "PERIOD_REVOKE", periodId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
