import { NextResponse } from "next/server";
import { AuthError, audit, hashPassword } from "@/lib/auth";
import { db, uid } from "@/lib/db";
import { ValidationError, jsonObject, text } from "@/lib/validate";
import { createFirm, requirePlatformAdmin } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePlatformAdmin();
    const rows: any[] = db().prepare(`
      SELECT f.*,
        (SELECT COUNT(*) FROM clients c WHERE c.firm_id=f.id) client_count,
        (SELECT COUNT(*) FROM firm_memberships m WHERE m.firm_id=f.id AND m.status='ACTIVE') member_count
      FROM firms f
      ORDER BY f.name
    `).all();
    return NextResponse.json({
      ok: true,
      productName: "Hathorn Dashboard",
      firms: rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        status: r.status,
        clientCount: r.client_count,
        memberCount: r.member_count,
        createdAt: r.created_at,
      })),
    });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

/**
 * Platform-admin provisioning only — ordinary firm users cannot create sibling firms.
 */
export async function POST(req: Request) {
  try {
    const s = await requirePlatformAdmin();
    const body = await jsonObject(req);
    const name = text(body.name, "Firm name", 120);
    const adminEmail = text(body.adminEmail, "Admin email", 200).toLowerCase();
    const adminName = text(body.adminName, "Admin name", 120);
    const password = String(body.adminPassword || "");
    if (password.length < 10) throw new ValidationError("Admin password must be at least 10 characters.");

    let adminId: string;
    const existing: any = db().prepare("SELECT id FROM users WHERE email=?").get(adminEmail);
    if (existing) {
      adminId = existing.id;
    } else {
      adminId = uid();
      db().prepare(
        "INSERT INTO users (id,email,password_hash,name,role,client_id,is_platform_admin) VALUES (?,?,?,?,?,?,0)",
      ).run(adminId, adminEmail, hashPassword(password), adminName, "ADMIN", null);
    }

    const firm = createFirm({
      name,
      slug: body.slug ? String(body.slug) : undefined,
      adminUserId: adminId,
      brandPrimary: body.brandPrimary ? String(body.brandPrimary) : undefined,
      brandAccent: body.brandAccent ? String(body.brandAccent) : undefined,
    });

    audit(s.userId, "PLATFORM_FIRM_CREATE", firm.id, { firmId: firm.id });
    return NextResponse.json({ ok: true, firm, adminUserId: adminId });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
