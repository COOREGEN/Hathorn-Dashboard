import { NextResponse } from "next/server";
import { requireRole, requireClientAccess, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";
import { rateLimit, RateLimited, LIMITS } from "@/lib/security";
import {
  getHubConnection, integrationHubEnabled, listSyncRuns, publicConnection,
} from "@/lib/integrations/model";
import { disconnectProvider, syncConnection } from "@/lib/integrations/service";
import type { ProviderKey } from "@/lib/integrations/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER");
    const connection = getHubConnection(params.id);
    if (!connection) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    await requireClientAccess(connection.clientId);
    const runs = listSyncRuns({ clientId: connection.clientId, connectionId: connection.id, limit: 40 });
    return NextResponse.json({
      ok: true,
      connection: publicConnection(connection),
      runs: runs.map((r) => ({
        ...r,
        metadata: Object.fromEntries(
          Object.entries(r.metadata || {}).filter(([k]) => !/token|secret|password|key/i.test(k)),
        ),
      })),
    });
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
    if (!integrationHubEnabled()) {
      return NextResponse.json({ ok: false, error: "Integration Hub is disabled." }, { status: 503 });
    }
    const connection = getHubConnection(params.id);
    if (!connection) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    await requireClientAccess(connection.clientId);

    const body = await jsonObject(req);
    const action = String(body.action || "sync").toLowerCase();

    if (action === "sync" || action === "full_resync") {
      rateLimit({ action: "integrationSync", subject: s.userId, ...LIMITS.integrationSync });
      // Durable async path — survives request timeout; idempotent per connection+window.
      if (body.async) {
        const { enqueueJob, getJob, jobPublicView, processJob } = await import("@/lib/ops/jobs");
        const { firmIdForClient } = await import("@/lib/tenancy");
        const window = new Date().toISOString().slice(0, 13);
        const job = enqueueJob({
          jobType: "INTEGRATION_SYNC",
          firmId: firmIdForClient(connection.clientId),
          clientId: connection.clientId,
          resourceId: connection.id,
          concurrencyKey: `sync:${connection.id}`,
          idempotencyKey: `sync:${connection.id}:${action}:${window}`,
          params: {
            connectionId: connection.id,
            clientId: connection.clientId,
            syncType: action === "full_resync" ? "FULL" : "MANUAL",
            year: body.year != null ? Number(body.year) : undefined,
            month: body.month != null ? Number(body.month) : undefined,
          },
          createdBy: s.userId,
          jitterSeconds: 15,
        });
        // Best-effort immediate processing; cron tick recovers if this process dies.
        void processJob(job);
        return NextResponse.json({
          ok: true,
          async: true,
          job: jobPublicView(getJob(job.id)!),
        });
      }
      const outcome = await syncConnection({
        connectionId: connection.id,
        clientId: connection.clientId,
        triggeredBy: s.userId,
        year: body.year != null ? Number(body.year) : undefined,
        month: body.month != null ? Number(body.month) : undefined,
        fullResync: action === "full_resync" || Boolean(body.fullResync),
        importPayload: body.importPayload || undefined,
      });
      if (action === "full_resync") {
        audit(s.userId, "INTEGRATION_FULL_RESYNC", connection.id);
      }
      const fresh = getHubConnection(connection.id)!;
      return NextResponse.json({
        ok: outcome.run.status !== "FAILED",
        outcome,
        connection: publicConnection(fresh),
      });
    }

    if (action === "disconnect") {
      await requireRole("ADMIN", "ADVISOR");
      await disconnectProvider({
        clientId: connection.clientId,
        provider: connection.provider as ProviderKey,
        userId: s.userId,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "connect_mock") {
      // Mock is always-on; record connect audit
      audit(s.userId, "INTEGRATION_CONNECTED", `mock ${connection.clientId}`);
      return NextResponse.json({ ok: true, connection: publicConnection(connection) });
    }

    throw new ValidationError("Unknown action.");
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    if (e instanceof RateLimited) return NextResponse.json({ ok: false, error: e.message }, { status: 429 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
