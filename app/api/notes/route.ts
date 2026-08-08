import { NextResponse } from "next/server";
import { db, uid } from "@/lib/db";
import { assertEditable } from "@/lib/release";
import { requireRole, audit, AuthError } from "@/lib/auth";
import { ValidationError, jsonObject } from "@/lib/validate";

export async function POST(req: Request) {
  try {
  const s = await requireRole("ADMIN", "ADVISOR");
  const { id, tone, heading, body } = await jsonObject(req);
  db().prepare("UPDATE story_notes SET tone=?, heading=?, body=? WHERE id=?").run(tone, heading, body, id);
  audit(s.userId, "NOTE_EDIT", id);
  return NextResponse.json({ ok: true });

  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
  const s = await requireRole("ADMIN", "ADVISOR");
  const { periodId, slot } = await jsonObject(req);
  const id = uid();
  db().prepare("INSERT INTO story_notes (id, period_id, slot, tone, heading, body, sort) VALUES (?,?,?,?,?,?,99)")
    .run(id, periodId, slot, "info", "New note", "");
  audit(s.userId, "NOTE_ADD", id);
  return NextResponse.json({ id, slot, tone: "info", heading: "New note", body: "" });

  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
  const s = await requireRole("ADMIN", "ADVISOR");
  const { id } = await jsonObject(req);
  db().prepare("DELETE FROM story_notes WHERE id=?").run(id);
  audit(s.userId, "NOTE_DELETE", id);
  return NextResponse.json({ ok: true });

  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ValidationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  }
}
