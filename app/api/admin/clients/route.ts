import { NextResponse } from "next/server";
import { db, uid } from "@/lib/db";
import { requireRole, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject, hexColour, text, uniqueSlug } from "@/lib/validate";
import { resolveActiveFirmId } from "@/lib/tenancy";

export async function POST(req: Request) {
  try {
    const s = await requireRole("ADMIN");
    const firmId = resolveActiveFirmId(s);
    if (!firmId) throw new AuthError(403, "Resource not found.");
    const b = await jsonObject(req);

    const name = text(b.name, "Client name", 120);
    // Two clients can legitimately share a name; the URL cannot. Derive a unique one
    // rather than surfacing a database constraint to the person filling in the form.
    // Slugs remain platform-unique on SQLite (see docs/TENANCY.md).
    const slug = uniqueSlug(String(b.slug || name), (candidate) =>
      Boolean(db().prepare("SELECT 1 FROM clients WHERE slug=?").get(candidate)));

    const template = ["modern", "editorial", "executive"].includes(String(b.template))
      ? String(b.template) : "modern";
    const brandPrimary = b.brandPrimary ? hexColour(b.brandPrimary, "Primary colour") : "#2C504D";
    const brandAccent = b.brandAccent ? hexColour(b.brandAccent, "Accent colour") : "#DB5928";

    /**
     * No labour band at creation.
     *
     * A band is agreed in the alignment session and recorded through the goals form,
     * which captures who agreed it and when. Setting one here would manufacture a target
     * with no provenance — the exact thing the metric registry exists to prevent. NULL
     * means "not yet agreed"; zeroes used to look like a real 0–0 band.
     */
    const lo = null, hi = null;

    // Industry is a free tag, not a fixed list. The firm's own book defines what
    // industries exist; a menu I invented would only ever be wrong.
    const industryTag = text(b.industryTag, "Industry", 60, false);

    const id = uid();
    db().prepare(`INSERT INTO clients
      (id,firm_id,name,slug,template,brand_primary,brand_accent,logo_text,logo_sub,target_labor_lo,target_labor_hi,notify_email)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, firmId, name, slug, template, brandPrimary, brandAccent,
        text(b.logoText, "Wordmark", 60, false) || name,
        text(b.logoSub, "Sub-line", 60, false),
        lo, hi, text(b.notifyEmail, "Notification email", 200, false) || null);

    if (industryTag) {
      db().prepare("UPDATE clients SET industry_tag=? WHERE id=?").run(industryTag, id);
    }
    // A new client starts at discovery, because that is where the engagement starts.
    db().prepare("UPDATE clients SET stage='DISCOVERY', stage_since=datetime('now') WHERE id=?").run(id);

    audit(s.userId, "CLIENT_CREATE", id, { firmId, clientId: id });
    return NextResponse.json({ id, slug });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: "Could not create that client." }, { status: 400 });
  }
}
