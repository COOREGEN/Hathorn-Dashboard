import { NextResponse } from "next/server";
import { db, uid, log } from "@/lib/db";
import { requireRole, audit, AuthError } from "@/lib/auth";

const MAX_BYTES = 900_000;
// SVG logos are accepted but served as attachment (see /api/assets/[id]) to block scripted XSS.
const ALLOWED = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

export async function POST(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR");
    const fd = await req.formData();
    const clientId = String(fd.get("clientId") || "");
    const file = fd.get("file") as File | null;

    if (!clientId) return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });
    if (!file) return NextResponse.json({ ok: false, error: "No file received." }, { status: 400 });
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json({ ok: false, error: "Use a PNG, JPG, SVG or WebP file." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: "That file is over 900 KB. A trimmed PNG or an SVG will look sharper anyway." },
        { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const id = uid();

    const write = db().transaction(() => {
      // One logo per client — replace rather than accumulate.
      db().prepare("DELETE FROM assets WHERE client_id=? AND kind='logo'").run(clientId);
      db().prepare("INSERT INTO assets (id, client_id, kind, mime, bytes, size) VALUES (?,?,?,?,?,?)")
        .run(id, clientId, "logo", file.type, bytes, file.size);
      db().prepare("UPDATE clients SET logo_asset_id=?, logo_data=NULL WHERE id=?").run(id, clientId);
    });
    write();

    audit(s.userId, "LOGO_UPLOAD", `${clientId} ${file.size}b`);
    log("info", "asset.uploaded", { clientId, size: file.size, mime: file.type });
    return NextResponse.json({ ok: true, id, url: `/api/assets/${id}` });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const s = await requireRole("ADMIN", "ADVISOR");
    const { clientId } = await req.json();
    db().prepare("DELETE FROM assets WHERE client_id=? AND kind='logo'").run(clientId);
    db().prepare("UPDATE clients SET logo_asset_id=NULL, logo_data=NULL WHERE id=?").run(clientId);
    audit(s.userId, "LOGO_REMOVE", clientId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
