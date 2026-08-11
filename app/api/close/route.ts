import { NextResponse } from "next/server";
import { requireRole, requireClientAccess, AuthError, audit } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";
import {
  closeAutomationEnabled, firmClosePortfolio, startOrGetCloseRun,
} from "@/lib/close";
import { resolveActiveFirmId } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER");
    const url = new URL(req.url);
    const year = Number(url.searchParams.get("year") || new Date().getFullYear());
    const month = Number(url.searchParams.get("month") || new Date().getMonth() + 1);
    if (year < 2000 || year > 2100 || month < 1 || month > 12) {
      throw new ValidationError("Invalid year/month.");
    }
    const firmId = resolveActiveFirmId(s);
    if (!firmId) throw new AuthError(403, "Resource not found.");
    const portfolio = firmClosePortfolio(year, month, firmId);
    return NextResponse.json({
      ok: true,
      enabled: closeAutomationEnabled(),
      ...portfolio,
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER");
    if (!closeAutomationEnabled()) {
      return NextResponse.json({ ok: false, error: "Close automation is disabled." }, { status: 503 });
    }
    const body = await jsonObject(req);
    const clientId = String(body.clientId || "");
    const periodId = String(body.periodId || "");
    if (!clientId || !periodId) throw new ValidationError("clientId and periodId are required.");
    await requireClientAccess(clientId);
    const run = startOrGetCloseRun({
      clientId,
      periodId,
      startedBy: s.userId,
      targetCloseDate: body.targetCloseDate ? String(body.targetCloseDate) : null,
    });
    audit(s.userId, "CLOSE_STARTED", `${clientId} ${periodId} ${run.id}`, { clientId });
    return NextResponse.json({ ok: true, run });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
