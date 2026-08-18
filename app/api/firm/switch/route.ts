import { NextResponse } from "next/server";
import { AuthError, switchActiveFirm } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await jsonObject(req);
    const firmId = String(body.firmId || "");
    if (!firmId) throw new ValidationError("firmId is required.");
    const session = await switchActiveFirm(firmId);
    return NextResponse.json({
      ok: true,
      firmId: session.firmId,
      // Caller must refresh client lists — never reuse prior firm cache keys.
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
