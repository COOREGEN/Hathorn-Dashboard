import { NextResponse } from "next/server";
import { requireRole, requireClientAccess, AuthError, audit } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";
import { listFirmExceptions } from "@/lib/close";
import { assignException, resolveException } from "@/lib/reconciliation/model";
import type { ResolutionCategory } from "@/lib/reconciliation/types";
import { resolveActiveFirmId } from "@/lib/tenancy";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER");
    const url = new URL(req.url);
    const mine = url.searchParams.get("mine") === "1";
    const firmId = resolveActiveFirmId(s);
    if (!firmId) throw new AuthError(403, "Resource not found.");
    const clientId = url.searchParams.get("clientId") || undefined;
    if (clientId) await requireClientAccess(clientId);
    const rows = listFirmExceptions({
      firmId,
      clientId,
      periodId: url.searchParams.get("periodId") || undefined,
      severity: url.searchParams.get("severity") || undefined,
      status: url.searchParams.get("status") || undefined,
      assignedTo: url.searchParams.get("assignedTo") || undefined,
      blocking: url.searchParams.get("blocking") === "1" ? true : undefined,
      mineUserId: mine ? s.userId : undefined,
    });
    return NextResponse.json({ ok: true, exceptions: rows });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER");
    const body = await jsonObject(req);
    const action = String(body.action || "").toLowerCase();
    const exceptionId = String(body.exceptionId || "");
    if (!exceptionId) throw new ValidationError("exceptionId required.");

    if (action === "assign") {
      const assigneeId = body.assigneeId == null ? null : String(body.assigneeId);
      const ex = assignException(exceptionId, assigneeId);
      audit(s.userId, "CLOSE_EXCEPTION_ASSIGNED", `${exceptionId} -> ${assigneeId || "unassigned"}`);
      return NextResponse.json({ ok: true, exception: ex });
    }

    if (action === "resolve") {
      // AI cannot call this — only authenticated staff via this route.
      const ex = resolveException({
        exceptionId,
        resolvedBy: s.userId,
        resolutionNote: String(body.resolutionNote || ""),
        resolutionCategory: (body.resolutionCategory || "OTHER") as ResolutionCategory,
        acceptDifference: Boolean(body.acceptDifference),
      });
      audit(s.userId, "CLOSE_EXCEPTION_RESOLVED", exceptionId);
      return NextResponse.json({ ok: true, exception: ex });
    }

    throw new ValidationError("Unknown action.");
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
