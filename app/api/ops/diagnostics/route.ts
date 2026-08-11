import { NextResponse } from "next/server";
import { AuthError, audit } from "@/lib/auth";
import { requirePlatformAdmin } from "@/lib/tenancy";
import { clientDiagnostics, searchFirms, platformIntegritySnapshot } from "@/lib/ops/diagnostics";
import { runIntegrityDiagnostics } from "@/lib/ops/integrity";
import { jsonObject, ValidationError } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const s = await requirePlatformAdmin();
    const url = new URL(req.url);
    const q = url.searchParams.get("q");
    const clientId = url.searchParams.get("clientId");
    if (clientId) {
      const diag = clientDiagnostics(clientId);
      if (!diag) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      audit(s.userId, "CONNECTION_DIAGNOSTIC_VIEWED", clientId, {
        firmId: diag.firm?.id, clientId,
      });
      return NextResponse.json({ ok: true, diagnostics: diag });
    }
    if (q != null) {
      return NextResponse.json({ ok: true, firms: searchFirms(q) });
    }
    return NextResponse.json({
      ok: true,
      orphans: platformIntegritySnapshot(),
      firms: searchFirms("", 50),
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const s = await requirePlatformAdmin();
    const body = await jsonObject(req);
    // Re-bind after awaits — platform_admin is never ambient from the JWT.
    try {
      const { setPlatformAdmin, setRlsUserId, setRlsFirmId } =
        require("@/lib/db-context") as typeof import("@/lib/db-context");
      setRlsUserId(s.userId);
      setRlsFirmId(s.firmId ?? null);
      setPlatformAdmin(true);
    } catch { /* sqlite */ }
    if (String(body.action) === "integrity") {
      const result = runIntegrityDiagnostics();
      audit(s.userId, "INTEGRITY_CHECK_RUN", JSON.stringify({
        stuckJobs: result.stuckJobs,
        brokenStorage: result.storageReferenceBroken,
      }));
      return NextResponse.json({ ok: true, result });
    }
    throw new ValidationError("Unknown action");
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
