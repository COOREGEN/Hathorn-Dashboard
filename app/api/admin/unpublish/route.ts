import { NextResponse } from "next/server";
import { revokePeriod } from "@/lib/release";
import { requirePeriodInFirm, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";

export async function POST(req: Request) {
  try {
    const body = await jsonObject(req);
    const { periodId } = body;
    // Withdrawing removes a statement a client may already have read.
    const s = await requirePeriodInFirm(periodId, "ADMIN", "ADVISOR");
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
