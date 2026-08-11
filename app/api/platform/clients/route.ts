import { NextResponse } from "next/server";
import { AuthError, audit } from "@/lib/auth";
import { requirePlatformAdmin } from "@/lib/tenancy";
import { provisionClient } from "@/lib/ops/provision";
import { ValidationError, jsonObject, text } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** Platform-admin client provisioning — safe defaults, nothing published. */
export async function POST(req: Request) {
  try {
    const s = await requirePlatformAdmin();
    const body = await jsonObject(req);
    const firmId = text(body.firmId, "Firm id", 64);
    const name = text(body.name, "Client name", 120);
    const result = provisionClient({
      firmId,
      name,
      slug: body.slug ? String(body.slug) : undefined,
      template: body.template ? String(body.template) : undefined,
      brandPrimary: body.brandPrimary ? String(body.brandPrimary) : undefined,
      brandAccent: body.brandAccent ? String(body.brandAccent) : undefined,
      enablePortal: body.enablePortal !== false,
      actorId: s.userId,
    });
    audit(s.userId, "PLATFORM_CLIENT_CREATE", result.clientId, {
      firmId, clientId: result.clientId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
