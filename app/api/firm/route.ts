import { NextResponse } from "next/server";
import { AuthError, audit } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";
import {
  listFirmMembers, listFirmsForUser, requireFirmAdmin, requireFirmContext,
  updateFirmSettings,
} from "@/lib/tenancy";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await requireFirmContext();
    const firms = listFirmsForUser(ctx.session.userId);
    return NextResponse.json({
      ok: true,
      firm: ctx.firm,
      membership: ctx.membership,
      members: listFirmMembers(ctx.firm.id),
      firms: firms.map((f) => ({ id: f.id, name: f.name, slug: f.slug })),
      productName: "Hathorn Dashboard",
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await requireFirmAdmin();
    const body = await jsonObject(req);
    const firm = updateFirmSettings(ctx.firm.id, body);
    audit(ctx.session.userId, "FIRM_SETTINGS_UPDATE", ctx.firm.id, { firmId: ctx.firm.id });
    return NextResponse.json({ ok: true, firm });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
