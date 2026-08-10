import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth";
import { ValidationError } from "@/lib/validate";
import { db } from "@/lib/db";
import {
  hubDashboard, integrationHubEnabled, publicConnection,
} from "@/lib/integrations/model";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER");
    const clientId = new URL(req.url).searchParams.get("clientId") || "";
    if (!clientId) throw new ValidationError("clientId is required.");
    const c = db().prepare("SELECT id, name FROM clients WHERE id=?").get(clientId) as any;
    if (!c) return NextResponse.json({ ok: false, error: "Client not found." }, { status: 404 });

    const dash = hubDashboard(clientId);
    return NextResponse.json({
      ok: true,
      enabled: integrationHubEnabled(),
      client: { id: c.id, name: c.name },
      counts: dash.counts,
      readiness: dash.readiness,
      providers: dash.providers,
      connections: dash.connections.map(publicConnection),
      recentRuns: dash.recentRuns.map((r) => ({
        ...r,
        // belt-and-suspenders: never leak token-like metadata
        metadata: Object.fromEntries(
          Object.entries(r.metadata || {}).filter(([k]) => !/token|secret|password|key/i.test(k)),
        ),
      })),
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
