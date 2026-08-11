import { NextResponse } from "next/server";
import { publish, openAmendment, revoke } from "@/lib/release";
import { requireRole, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";
import { db } from "@/lib/db";
import { sendPeriodPublished } from "@/lib/email";

export async function POST(req: Request) {
  try {
    // Auth and body parsing both live inside the try: a validation failure must be a
    // 400 with a reason, never an unhandled 500.
    const s = await requireRole("ADMIN", "ADVISOR");
    const body = await jsonObject(req);
    const { periodId } = body;
    // Amending is the only route back into a locked period.
    if (String(body.action || "") === "amend") {
      try {
        openAmendment(periodId, s.userId, String(body.reason || ""));
        return NextResponse.json({ ok: true, amended: true });
      } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
      }
    }

    // One release authority. This route decides nothing; it asks.
    const out = publish(periodId, s.userId);
    if (!out.ok) {
      return NextResponse.json({
        ok: false,
        error: out.blockers?.[0]?.message ?? "This period cannot be published yet.",
        blockers: out.blockers ?? [],
      }, { status: 400 });
    }
    audit(s.userId, "PERIOD_PUBLISH", periodId);

    // Email notification (no-op if RESEND_API_KEY not set)
    const period: any = db().prepare("SELECT * FROM periods WHERE id=?").get(periodId);
    const client: any = db().prepare("SELECT * FROM clients WHERE id=?").get(period?.client_id);
    if (client?.notify_email) {
      const { brandingForClient } = await import("@/lib/tenancy");
      const brand = brandingForClient(period.client_id);
      await sendPeriodPublished({
        clientName: client.name, clientEmail: client.notify_email,
        year: period.year, month: period.month,
        portalUrl: `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/portal`,
        firmName: brand.firmName,
      });
    }
    return NextResponse.json({
      ok: true,
      version: out.version,
      releaseId: out.releaseId,
      checksum: out.checksum,
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
