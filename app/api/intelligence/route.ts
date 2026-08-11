import { NextResponse } from "next/server";
import { requireRole, requireClientAccess, AuthError, audit } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";
import { rateLimit, RateLimited, LIMITS } from "@/lib/security";
import { clientHistory, computePeriod } from "@/lib/metrics";
import {
  buildIntelligenceOverview,
  explainIntelligence,
  listSignals,
  setSignalStatus,
  createAllocationRule,
  listAllocationRules,
  intelligenceReadiness,
  arPayerConcentration,
} from "@/lib/intelligence";

export async function GET(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR");
    if (!s.firmId) throw new AuthError(403, "An active firm context is required.");
    const url = new URL(req.url);
    const clientId = String(url.searchParams.get("clientId") || "");
    if (!clientId) throw new ValidationError("clientId is required.");
    await requireClientAccess(clientId);

    const view = url.searchParams.get("view") || "overview";
    if (view === "readiness") {
      return NextResponse.json({ ok: true, readiness: intelligenceReadiness(clientId) });
    }
    if (view === "signals") {
      const periodId = url.searchParams.get("periodId") || undefined;
      return NextResponse.json({
        ok: true,
        signals: listSignals({ firmId: s.firmId, clientId, periodId: periodId || undefined }),
      });
    }
    if (view === "allocations") {
      return NextResponse.json({ ok: true, rules: listAllocationRules(clientId) });
    }

    let periodId = url.searchParams.get("periodId") || "";
    if (!periodId) {
      const hist = clientHistory(clientId, false);
      const latest = [...hist].reverse().find((p) => p.revenue || p.directCost);
      periodId = latest?.periodId || "";
    }
    if (!periodId) {
      return NextResponse.json({
        ok: true,
        empty: true,
        readiness: intelligenceReadiness(clientId),
        error: "No period with figures.",
      });
    }

    const sourceKind = url.searchParams.get("source") === "release"
      ? "financial_release" as const
      : "working_ledger" as const;

    const overview = buildIntelligenceOverview({
      firmId: s.firmId,
      clientId,
      periodId,
      actorId: s.userId,
      sourceKind,
      syncSignals: true,
      persistRun: false,
    });

    const m = computePeriod(periodId);
    const arPayers = arPayerConcentration(m);

    const periods = clientHistory(clientId, false).map((p) => ({
      periodId: p.periodId, label: p.label, year: p.year, month: p.month, status: p.status,
    }));

    return NextResponse.json({
      ok: true,
      overview,
      arPayers,
      periods,
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message || "Error" }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR");
    if (!s.firmId) throw new AuthError(403, "An active firm context is required.");
    rateLimit({ action: "intelligence", subject: s.userId, ...LIMITS.intelligence });
    const body = await jsonObject(req);
    const action = String(body.action || "");

    if (action === "summarize") {
      const clientId = String(body.clientId || "");
      const periodId = String(body.periodId || "");
      if (!clientId || !periodId) throw new ValidationError("clientId and periodId are required.");
      await requireClientAccess(clientId);
      const overview = buildIntelligenceOverview({
        firmId: s.firmId, clientId, periodId, actorId: s.userId,
        sourceKind: body.source === "release" ? "financial_release" : "working_ledger",
        persistRun: true,
      });
      const summary = await explainIntelligence(overview);
      audit(s.userId, "AI_INTELLIGENCE_SUMMARY_GENERATED", `${periodId}:${summary.source}`, {
        firmId: s.firmId, clientId,
      });
      return NextResponse.json({ ok: true, summary, overview });
    }

    if (action === "setSignalStatus") {
      const signalId = String(body.signalId || "");
      const status = String(body.status || "") as any;
      if (!signalId || !["REVIEWED", "DISMISSED", "MONITORING", "NEW"].includes(status)) {
        throw new ValidationError("signalId and valid status are required.");
      }
      const updated = setSignalStatus({
        signalId, firmId: s.firmId, status, userId: s.userId,
      });
      if (!updated) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
      return NextResponse.json({ ok: true, signal: updated });
    }

    if (action === "createAllocationRule") {
      const clientId = String(body.clientId || "");
      await requireClientAccess(clientId);
      const method = String(body.allocationMethod || "");
      if (!["REVENUE_SHARE", "HOURS", "DIRECT"].includes(method)) {
        throw new ValidationError("allocationMethod must be REVENUE_SHARE, HOURS, or DIRECT.");
      }
      const rule = createAllocationRule({
        firmId: s.firmId,
        clientId,
        costPool: String(body.costPool || "OPEX"),
        allocationMethod: method as any,
        effectiveFrom: String(body.effectiveFrom || new Date().toISOString().slice(0, 10)),
        reason: String(body.reason || ""),
        createdBy: s.userId,
      });
      audit(s.userId, "ALLOCATION_RULE_CREATED", `${rule.id}:v${rule.version}`, {
        firmId: s.firmId, clientId,
      });
      return NextResponse.json({ ok: true, rule });
    }

    throw new ValidationError("Unknown action.");
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    if (e instanceof RateLimited) return NextResponse.json({ ok: false, error: e.message }, { status: 429 });
    return NextResponse.json({ ok: false, error: e.message || "Error" }, { status: 400 });
  }
}
