import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
  const s = await requireRole("ADMIN", "ADVISOR");
  const { name, status } = await jsonObject(req);
  db().prepare("UPDATE entities SET name=?, status=? WHERE id=?").run(name, status, params.id);
  audit(s.userId, "ENTITY_UPDATE", params.id);
  return NextResponse.json({ ok: true });

  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
  const s = await requireRole("ADMIN");
  db().prepare("DELETE FROM entities WHERE id=?").run(params.id);
  audit(s.userId, "ENTITY_DELETE", params.id);
  return NextResponse.json({ ok: true });

  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
