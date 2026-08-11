import { NextResponse } from "next/server";
import { requireRole, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";
import { rateLimit, RateLimited, LIMITS } from "@/lib/security";
import { getModelRun, saveAnalysis } from "@/lib/fpa/model";
import { explainScenarioRun } from "@/lib/ai/scenario-explanation";

export async function POST(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR");
    rateLimit({ action: "fpaAnalyze", subject: s.userId, ...LIMITS.fpaAnalyze });
    const body = await jsonObject(req);
    const runId = String(body.runId || "");
    if (!runId) throw new ValidationError("runId is required.");
    const run = getModelRun(runId);
    if (!run) return NextResponse.json({ ok: false, error: "Run not found." }, { status: 404 });
    if (run.status !== "OK") throw new ValidationError("Cannot analyze a failed model run.");

    const explanation = await explainScenarioRun(run);
    saveAnalysis(run.id, explanation.text);
    const updated = getModelRun(run.id)!;
    audit(s.userId, "FPA_AI_ANALYSIS_GENERATED", `${run.id} ${explanation.source}`);
    return NextResponse.json({
      ok: true, run: updated, source: explanation.source, warning: explanation.warning,
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    if (e instanceof RateLimited) return NextResponse.json({ ok: false, error: e.message }, { status: 429 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
