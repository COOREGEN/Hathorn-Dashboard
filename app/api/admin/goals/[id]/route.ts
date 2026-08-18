import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
  const s = await requireRole("ADMIN", "ADVISOR");
  const { title, target, current, progress, active } = await jsonObject(req);
  db().prepare("UPDATE goals SET title=?,target=?,current=?,progress=?,active=? WHERE id=?")
    .run(title, target, current ?? "", progress ?? 0, active !== false ? 1 : 0, params.id);
  audit(s.userId, "GOAL_UPDATE", params.id);
  return NextResponse.json({ ok: true });

  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
  const s = await requireRole("ADMIN", "ADVISOR");
  db().prepare("DELETE FROM goals WHERE id=?").run(params.id);
  audit(s.userId, "GOAL_DELETE", params.id);
  return NextResponse.json({ ok: true });

  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
