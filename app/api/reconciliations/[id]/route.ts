import { NextResponse } from "next/server";
import { requireRole, requireClientAccess, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";
import { rateLimit, RateLimited, LIMITS } from "@/lib/security";
import {
  analyzeReconciliation, assignException, getReconciliation, reconciliationBundle,
  reconciliationEnabled, resolveException, runOne,
} from "@/lib/reconciliation/model";
import type { ResolutionCategory } from "@/lib/reconciliation/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER");
    const bundle = reconciliationBundle(params.id);
    if (!bundle) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    await requireClientAccess(bundle.reconciliation.clientId);
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
    if (!reconciliationEnabled()) {
      return NextResponse.json({ ok: false, error: "Reconciliation is disabled." }, { status: 503 });
    }
    const recon = getReconciliation(params.id);
    if (!recon) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    await requireClientAccess(recon.clientId);

    const body = await jsonObject(req);
    const action = String(body.action || "").toLowerCase();

    if (action === "rerun") {
      rateLimit({ action: "reconRun", subject: s.userId, ...LIMITS.reconRun });
      const result = runOne({
        clientId: recon.clientId,
        periodId: recon.periodId,
        type: recon.type,
        createdBy: s.userId,
      });
      audit(s.userId, "RECONCILIATION_RUN", `${params.id} rerun`);
      return NextResponse.json({ ok: true, ...result, bundle: reconciliationBundle(result.reconciliationId) });
    }

    if (action === "analyze") {
      rateLimit({ action: "reconAnalyze", subject: s.userId, ...LIMITS.reconAnalyze });
      const analysis = await analyzeReconciliation(params.id);
      audit(s.userId, "RECONCILIATION_AI_ANALYSIS_GENERATED", params.id);
      return NextResponse.json({ ok: true, analysis, bundle: reconciliationBundle(params.id) });
    }

    if (action === "assign") {
      const exceptionId = String(body.exceptionId || "");
      const assignee = body.assignedTo ? String(body.assignedTo) : null;
      const ex = assignException(exceptionId, assignee);
      if (!ex || ex.clientId !== recon.clientId) {
        throw new ValidationError("Exception not found for this reconciliation.");
      }
      audit(s.userId, "RECONCILIATION_ASSIGNED", exceptionId);
      return NextResponse.json({ ok: true, exception: ex, bundle: reconciliationBundle(params.id) });
    }

    if (action === "resolve") {
      // Bookkeepers may run; only ADMIN/ADVISOR resolve
      await requireRole("ADMIN", "ADVISOR");
      const exceptionId = String(body.exceptionId || "");
      const ex = resolveException({
        exceptionId,
        resolvedBy: s.userId,
        resolutionNote: String(body.resolutionNote || ""),
        resolutionCategory: String(body.resolutionCategory || "OTHER") as ResolutionCategory,
        acceptDifference: Boolean(body.acceptDifference),
      });
      if (!ex || ex.clientId !== recon.clientId) {
        throw new ValidationError("Exception not found for this reconciliation.");
      }
      audit(
        s.userId,
        body.acceptDifference ? "RECONCILIATION_DIFFERENCE_ACCEPTED" : "RECONCILIATION_RESOLVED",
        exceptionId,
      );
      audit(s.userId, "RECONCILIATION_REVIEWED", params.id);
      return NextResponse.json({ ok: true, exception: ex, bundle: reconciliationBundle(params.id) });
    }

    throw new ValidationError("Unknown action.");
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    if (e instanceof RateLimited) return NextResponse.json({ ok: false, error: e.message }, { status: 429 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
