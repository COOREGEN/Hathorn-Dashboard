import { NextResponse } from "next/server";
import { requireRole, requireClientAccess, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";
import { rateLimit, RateLimited, LIMITS } from "@/lib/security";
import { db } from "@/lib/db";
import {
  listClientConfig, listReconciliations, packSummary, reconciliationEnabled,
  runPack, runOne, ensureClientConfig,
} from "@/lib/reconciliation/model";
import { RECONCILIATION_TYPES, type ReconciliationType } from "@/lib/reconciliation/types";
import { SUBLEDGERS } from "@/lib/reconciliation/registry";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER");
    const url = new URL(req.url);
    const clientId = url.searchParams.get("clientId") || "";
    const periodId = url.searchParams.get("periodId") || "";
    if (!clientId) throw new ValidationError("clientId is required.");
    await requireClientAccess(clientId);

    ensureClientConfig(clientId);
    const periods = db().prepare(
      `SELECT id, year, month, status FROM periods WHERE client_id=? ORDER BY year DESC, month DESC`,
    ).all(clientId);

    if (periodId) {
      const pack = packSummary(clientId, periodId);
      return NextResponse.json({
        ok: true,
        enabled: reconciliationEnabled(),
        periods,
        pack,
        definitions: Object.values(SUBLEDGERS),
      });
    }

    return NextResponse.json({
      ok: true,
      enabled: reconciliationEnabled(),
      periods,
      config: listClientConfig(clientId),
      reconciliations: listReconciliations(clientId),
      definitions: Object.values(SUBLEDGERS),
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
    if (!reconciliationEnabled()) {
      return NextResponse.json({ ok: false, error: "Reconciliation is disabled." }, { status: 503 });
    }
    rateLimit({ action: "reconRun", subject: s.userId, ...LIMITS.reconRun });
    const body = await jsonObject(req);
    const clientId = String(body.clientId || "");
    const periodId = String(body.periodId || "");
    if (!clientId || !periodId) throw new ValidationError("clientId and periodId are required.");
    await requireClientAccess(clientId);

    const type = body.type ? String(body.type) as ReconciliationType : null;
    if (type && !RECONCILIATION_TYPES.includes(type)) {
      throw new ValidationError("Unknown reconciliation type.");
    }

    const results = type
      ? [runOne({ clientId, periodId, type, createdBy: s.userId })]
      : runPack({ clientId, periodId, createdBy: s.userId });

    audit(s.userId, "RECONCILIATION_RUN", `${clientId} ${periodId} ${type || "PACK"} n=${results.length}`);
    for (const r of results) {
      if (r.result.status === "EXCEPTION" || r.result.status === "NEEDS_DATA") {
        audit(s.userId, "RECONCILIATION_EXCEPTION_CREATED", r.reconciliationId);
      }
    }

    return NextResponse.json({
      ok: true,
      results,
      pack: packSummary(clientId, periodId),
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    if (e instanceof RateLimited) return NextResponse.json({ ok: false, error: e.message }, { status: 429 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
