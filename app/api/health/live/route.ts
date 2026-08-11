import { NextResponse } from "next/server";
import { liveness } from "@/lib/ops/health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Process liveness — no dependency checks. Safe for uptime monitors. */
export async function GET() {
  return NextResponse.json(liveness());
}
