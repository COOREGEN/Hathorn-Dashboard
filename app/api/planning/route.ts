import { NextResponse } from "next/server";
import { requireRole, requireClientAccess, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";
import { rateLimit, RateLimited, LIMITS } from "@/lib/security";
import {
  createModelRun, loadBaseline, defaultAssumptionsFromBaseline, listModelRuns, getModelRun,
} from "@/lib/fpa/model";
import { DEFAULT_ASSUMPTIONS, type Assumptions, type ScenarioKey } from "@/lib/fpa/types";
import { forgeStatus } from "@/lib/fpa/engine";
import { db } from "@/lib/db";

const SCENARIOS = new Set(["BASE", "UPSIDE", "DOWNSIDE", "CUSTOM"]);

export async function GET(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR");
    const url = new URL(req.url);
    const clientId = url.searchParams.get("clientId") || "";
    const runId = url.searchParams.get("runId") || "";
    if (runId) {
      const run = getModelRun(runId);
      if (!run) return NextResponse.json({ ok: false, error: "Run not found." }, { status: 404 });
      await requireClientAccess(run.clientId);
      return NextResponse.json({ ok: true, run, forge: forgeStatus() });
    }
    if (!clientId) return NextResponse.json({ ok: false, error: "clientId required." }, { status: 400 });
    await requireClientAccess(clientId);
    const base = loadBaseline(clientId);
    return NextResponse.json({
      ok: true,
      baseline: base,
      defaults: base ? defaultAssumptionsFromBaseline(base.baseline) : DEFAULT_ASSUMPTIONS,
      runs: listModelRuns(clientId, 10),
      forge: forgeStatus(),
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR");
    rateLimit({ action: "fpaRun", subject: s.userId, ...LIMITS.fpaRun });

    const body = await jsonObject(req);
    const clientId = String(body.clientId || "");
    const scenario = String(body.scenario || "BASE").toUpperCase() as ScenarioKey;
    if (!clientId) throw new ValidationError("clientId is required.");
    if (!SCENARIOS.has(scenario)) throw new ValidationError("Invalid scenario.");
    await requireClientAccess(clientId);

    const a = body.assumptions || {};
    const assumptions: Assumptions = {
      annualRevenueGrowthPct: Number(a.annualRevenueGrowthPct),
      grossMarginPct: Number(a.grossMarginPct),
      annualOpexGrowthPct: Number(a.annualOpexGrowthPct),
      horizonMonths: 12,
    };

    const preferForge = Boolean(body.preferForge);
    const run = await createModelRun({
      clientId,
      sourcePeriodId: body.sourcePeriodId ? String(body.sourcePeriodId) : "",
      sourceReleaseId: body.sourceReleaseId ? String(body.sourceReleaseId) : null,
      scenario,
      assumptions,
    }, s.userId, preferForge);

    audit(s.userId, "FPA_MODEL_RUN", `${clientId} ${scenario} ${run.engine} ${run.status}`);
    return NextResponse.json({ ok: true, run });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    if (e instanceof RateLimited) return NextResponse.json({ ok: false, error: e.message }, { status: 429 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
