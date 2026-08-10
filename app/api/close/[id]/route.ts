import { NextResponse } from "next/server";
import { requireRole, AuthError, audit } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";
import {
  closeAutomationEnabled, closeBundle, completeManualCheck, generateCloseSummary,
  refreshCloseRun, reopenCloseRun, reviewCheck, waiveCheck,
} from "@/lib/close";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER");
    const bundle = closeBundle(params.id);
    if (!bundle) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    return NextResponse.json({ ok: true, ...bundle });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER");
    if (!closeAutomationEnabled()) {
      return NextResponse.json({ ok: false, error: "Close automation is disabled." }, { status: 503 });
    }
    const body = await jsonObject(req);
    const action = String(body.action || "refresh").toLowerCase();

    if (action === "refresh") {
      const run = refreshCloseRun(params.id, s.userId);
      audit(s.userId, "CLOSE_CHECK_EVALUATED", params.id);
      return NextResponse.json({ ok: true, run, bundle: closeBundle(params.id) });
    }

    if (action === "complete_manual") {
      const itemId = String(body.itemId || "");
      if (!itemId) throw new ValidationError("itemId required.");
      const run = completeManualCheck({ itemId, userId: s.userId, note: body.note ? String(body.note) : undefined });
      audit(s.userId, "CLOSE_CHECK_COMPLETED", itemId);
      return NextResponse.json({ ok: true, run, bundle: closeBundle(params.id) });
    }

    if (action === "review_check") {
      const itemId = String(body.itemId || "");
      if (!itemId) throw new ValidationError("itemId required.");
      const run = reviewCheck({ itemId, userId: s.userId, note: body.note ? String(body.note) : undefined });
      audit(s.userId, "CLOSE_CHECK_COMPLETED", `review ${itemId}`);
      return NextResponse.json({ ok: true, run, bundle: closeBundle(params.id) });
    }

    if (action === "waive") {
      await requireRole("ADMIN", "ADVISOR");
      const itemId = String(body.itemId || "");
      const reason = String(body.reason || "");
      if (!itemId) throw new ValidationError("itemId required.");
      const run = waiveCheck({ itemId, userId: s.userId, reason, role: s.role });
      audit(s.userId, "CLOSE_CHECK_WAIVED", itemId);
      return NextResponse.json({ ok: true, run, bundle: closeBundle(params.id) });
    }

    if (action === "reopen") {
      await requireRole("ADMIN", "ADVISOR");
      const run = reopenCloseRun({
        closeRunId: params.id,
        userId: s.userId,
        role: s.role,
        reason: String(body.reason || ""),
      });
      audit(s.userId, "CLOSE_REOPENED", params.id);
      return NextResponse.json({ ok: true, run, bundle: closeBundle(params.id) });
    }

    if (action === "ai_summary") {
      const bundle = closeBundle(params.id);
      if (!bundle) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
      const summary = await generateCloseSummary({
        run: bundle.run,
        items: bundle.items,
        whyNotClosed: bundle.whyNotClosed,
        clientName: bundle.client?.name || "Client",
      });
      return NextResponse.json({ ok: true, summary });
    }

    throw new ValidationError("Unknown action.");
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
