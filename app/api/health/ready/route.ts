import { NextResponse } from "next/server";
import { readiness } from "@/lib/ops/health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Readiness — core dependencies usable.
 * Optional AI/QBO/email outages do not mark the app unready.
 */
export async function GET() {
  const body = readiness();
  return NextResponse.json(body, { status: body.ready ? 200 : 503 });
}
