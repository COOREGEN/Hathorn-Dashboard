import { NextResponse } from "next/server";
import { AuthError, audit } from "@/lib/auth";
import { requirePlatformAdmin } from "@/lib/tenancy";
import {
  enqueueJob, getJob, jobCounts, jobPublicView, listJobs, retryJob, tickJobs,
  type JobStatus, type JobType,
} from "@/lib/ops/jobs";
import { ValidationError, jsonObject } from "@/lib/validate";
import { newCorrelationId, runWithCorrelationAsync } from "@/lib/ops/correlation";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requirePlatformAdmin();
    const url = new URL(req.url);
    const status = url.searchParams.get("status") as JobStatus | null;
    const jobType = url.searchParams.get("type") as JobType | null;
    const clientId = url.searchParams.get("clientId") || undefined;
    const jobs = listJobs({
      status: status || undefined,
      jobType: jobType || undefined,
      clientId,
      limit: Number(url.searchParams.get("limit") || 50),
    }).map(jobPublicView);
    return NextResponse.json({ ok: true, counts: jobCounts(), jobs });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const correlationId = req.headers.get("x-request-id") || newCorrelationId();
  try {
    const s = await requirePlatformAdmin();
    return await runWithCorrelationAsync({
      correlationId, userId: s.userId, operation: "ops.jobs",
    }, async () => {
      // Re-bind after await — ALS does not survive Next.js async boundaries.
      try {
        const { setPlatformAdmin, setRlsUserId, setRlsFirmId } =
          require("@/lib/db-context") as typeof import("@/lib/db-context");
        setRlsUserId(s.userId);
        setRlsFirmId(s.firmId ?? null);
        setPlatformAdmin(true);
      } catch { /* sqlite */ }
      const body = await jsonObject(req);
      const action = String(body.action || "");

      if (action === "retry") {
        const jobId = String(body.jobId || "");
        if (!jobId) throw new ValidationError("jobId required");
        const job = retryJob(jobId, s.userId);
        audit(s.userId, "JOB_RETRIED", job.id, {
          firmId: job.firmId, clientId: job.clientId,
        });
        // Process immediately so support sees progress without waiting for cron.
        const { processJob } = await import("@/lib/ops/jobs");
        const fresh = getJob(job.id);
        if (fresh) await processJob(fresh);
        return NextResponse.json({
          ok: true,
          job: jobPublicView(getJob(job.id)!),
          reference: correlationId.slice(0, 12).toUpperCase(),
        });
      }

      if (action === "tick") {
        const result = await tickJobs(Number(body.limit || 5));
        audit(s.userId, "JOBS_TICK", JSON.stringify(result));
        return NextResponse.json({ ok: true, ...result });
      }

      if (action === "enqueue_maintenance") {
        const job = enqueueJob({
          jobType: "MAINTENANCE",
          concurrencyKey: "maintenance:global",
          idempotencyKey: `maintenance:manual:${Date.now()}`,
          params: { kind: "stuck_sweep" },
          createdBy: s.userId,
        });
        const { processJob } = await import("@/lib/ops/jobs");
        await processJob(job);
        return NextResponse.json({ ok: true, job: jobPublicView(getJob(job.id)!) });
      }

      throw new ValidationError("Unknown action");
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({
      ok: false,
      error: e.message,
      reference: correlationId.slice(0, 12).toUpperCase(),
    }, { status: 400 });
  }
}
