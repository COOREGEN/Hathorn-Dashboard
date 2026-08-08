import { NextResponse } from "next/server";
import { unpublishPeriod } from "@/lib/gate";
import { requireRole, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";

export async function POST(req: Request) {
  try {
  const s = await requireRole("ADMIN", "ADVISOR");
  const { periodId } = await jsonObject(req);
  unpublishPeriod(periodId);
  audit(s.userId, "PERIOD_UNPUBLISH", periodId);
  return NextResponse.json({ ok: true });

  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
