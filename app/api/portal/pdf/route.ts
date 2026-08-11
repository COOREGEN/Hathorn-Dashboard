import { NextResponse } from "next/server";
import { AuthError, audit, requireClientAccess, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildStatementPdf } from "@/lib/pdf";
import { requestAuditContext } from "@/lib/audit-trail";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR", "BOOKKEEPER", "CLIENT");
    const url = new URL(req.url);
    const periodId = url.searchParams.get("periodId");
    if (!periodId) {
      return NextResponse.json({ ok: false, error: "periodId required" }, { status: 400 });
    }
    const period: any = db().prepare("SELECT client_id FROM periods WHERE id=?").get(periodId);
    if (!period) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    await requireClientAccess(period.client_id);

    const pdf = await buildStatementPdf(periodId);
    if (!pdf) {
      return NextResponse.json({ ok: false, error: "No active release for that period." }, { status: 404 });
    }

    audit(s.userId, "STATEMENT_PDF_EXPORTED", periodId, {
      clientId: period.client_id,
      resourceType: "period",
      resourceId: periodId,
      metadata: { filename: pdf.filename, checksum: pdf.checksum },
      ...requestAuditContext(req),
    });

    return new NextResponse(new Uint8Array(pdf.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${pdf.filename}"`,
        "X-Release-Checksum": pdf.checksum,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: "PDF failed." }, { status: 500 });
  }
}
