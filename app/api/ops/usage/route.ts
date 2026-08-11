import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { requirePlatformAdmin } from "@/lib/tenancy";
import { platformUsageSummary } from "@/lib/ops/usage";
import { readiness } from "@/lib/ops/health";

export const dynamic = "force-dynamic";

/** Platform usage — no confidential financial aggregates. */
export async function GET() {
  try {
    await requirePlatformAdmin();
    return NextResponse.json({
      ok: true,
      health: readiness(),
      usage: platformUsageSummary(),
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
