import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject, hexColour, uniqueSlug } from "@/lib/validate";

/** Maps the JSON body's camelCase keys to their snake_case columns. */
const COLUMNS: Record<string, string> = {
  name: "name", slug: "slug", template: "template",
  brandPrimary: "brand_primary", brandAccent: "brand_accent",
  logoText: "logo_text", logoSub: "logo_sub", logoData: "logo_data",
  targetLaborLo: "target_labor_lo", targetLaborHi: "target_labor_hi",
  notifyEmail: "notify_email",
};

function fail(e: any) {
  if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  return NextResponse.json({ ok: false, error: "That change could not be saved." }, { status: 400 });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR");
    const body = await jsonObject(req);

    // Colours are validated here rather than only sanitised at render time — invalid
    // values that persist will eventually be read by something that forgets to check.
    if (body.brandPrimary !== undefined) body.brandPrimary = hexColour(body.brandPrimary, "Primary colour");
    if (body.brandAccent !== undefined) body.brandAccent = hexColour(body.brandAccent, "Accent colour");
    if (body.slug !== undefined) {
      body.slug = uniqueSlug(String(body.slug), (c) =>
        Boolean(db().prepare("SELECT 1 FROM clients WHERE slug=? AND id<>?").get(c, params.id)));
    }

    const sets: string[] = [];
    const vals: any[] = [];
    for (const [key, column] of Object.entries(COLUMNS)) {
      if (body[key] !== undefined) {
        sets.push(`${column}=?`);
        vals.push(body[key]);
      }
    }
    if (!sets.length) return NextResponse.json({ ok: true, changed: 0 });

    vals.push(params.id);
    db().prepare(`UPDATE clients SET ${sets.join(",")} WHERE id=?`).run(...vals);
    audit(s.userId, "CLIENT_UPDATE", params.id);
    return NextResponse.json({ ok: true, changed: sets.length });
  } catch (e: any) {
    return fail(e);
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    const s = await requireRole("ADMIN");
    const id = params.id;
    // Remove the client and everything hanging off it, in one transaction.
    const purge = db().transaction(() => {
      const periods: any[] = db().prepare("SELECT id FROM periods WHERE client_id=?").all(id);
      for (const p of periods) {
        for (const t of ["pl_lines", "payroll_lines", "ar_buckets", "story_notes", "comments"]) {
          db().prepare(`DELETE FROM ${t} WHERE period_id=?`).run(p.id);
        }
        db().prepare("DELETE FROM cash_balances WHERE period_id=?").run(p.id);
      }
      db().prepare("DELETE FROM periods WHERE client_id=?").run(id);
      db().prepare("DELETE FROM entities WHERE client_id=?").run(id);
      db().prepare("DELETE FROM goals WHERE client_id=?").run(id);
      db().prepare("DELETE FROM users WHERE client_id=?").run(id);
      db().prepare("DELETE FROM qbo_connections WHERE client_id=?").run(id);
      db().prepare("DELETE FROM qbo_account_map WHERE client_id=?").run(id);
      db().prepare("DELETE FROM clients WHERE id=?").run(id);
    });
    purge();
    audit(s.userId, "CLIENT_DELETE", id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return fail(e);
  }
}
